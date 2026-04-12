import crypto from "node:crypto";

import { ActivityActorKind, Prisma, SalesInvoiceStatus } from "@prisma/client";
import type { Request } from "express";

import { env } from "../config/env.js";
import { isApsWalletApiBaseConfigured } from "../config/aps-wallet-env.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from "../lib/prisma-sales-enums.js";
import {
  CHECKOUT_ADAPTER_APS_WALLET,
  getPaymentGatewayByCode,
} from "./payment-gateway.service.js";
import {
  deleteStoredApsAuthorizedToken,
  getStoredApsAuthorizedToken,
  upsertStoredApsAuthorizedToken,
} from "./aps-wallet-customer-auth.service.js";
import {
  apsWalletAuthorizeCustomer,
  apsWalletBusinessMerchantContext,
  apsWalletConfirmCustomer,
  apsWalletProcessPayment,
  normalizeApsCustomerMobile,
  type ApsWalletMerchantContext,
} from "./aps-wallet-client.service.js";
import {
  type ApsGatewaySecrets,
  getDecryptedGatewaySecrets,
} from "./business-gateway-credential.service.js";
import {
  nextPaymentPublicCode,
  upsertSalesInvoiceWalletPayment,
} from "./order-wallet-checkout.service.js";
import { completeWalletPaymentByPublicToken } from "./sale.service.js";
import { ACTIVITY_EVENT, appendActivityLog } from "./activity-log.service.js";

const APS_STATE_TTL_MS = 15 * 60 * 1000;
const LOG_PREFIX = "[APS Wallet]";

async function resolveApsWalletMerchantContextForBusiness(
  businessId: string,
  gatewayCode: string,
): Promise<ApsWalletMerchantContext> {
  if (!isApsWalletApiBaseConfigured()) {
    throw new HttpError(
      503,
      "APS Wallet API base URL is not configured on the server (APS_WALLET_BASE_URL).",
    );
  }
  const secrets = await getDecryptedGatewaySecrets<ApsGatewaySecrets>(businessId, gatewayCode);
  if (!secrets?.username?.trim() || !secrets.password?.trim()) {
    throw new HttpError(
      503,
      "APS Wallet merchant username and password are not saved for this business. Add them under Merchant API.",
    );
  }
  return apsWalletBusinessMerchantContext({
    businessId,
    gatewayCode,
    username: secrets.username.trim(),
    password: secrets.password,
  });
}

type OrderApsAuthPayload = {
  v: 1;
  exp: number;
  kind: "order" | "guest_invoice";
  orderId?: string;
  salesInvoiceId?: string;
  paymentId: string;
  businessId: string;
  gatewayCode: string;
  /** From APS authorize-customer; empty when using stored customer authorization. */
  requestToken: string;
  payerMobile: string;
  guestToken?: string;
  /** `stored` = use encrypted token from DB; omit or `otp` = confirm OTP then pay. */
  authMode?: "otp" | "stored";
};

function timingSafeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) {
      return false;
    }
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function signOrderApsAuthPayload(payload: Omit<OrderApsAuthPayload, "v" | "exp">): string {
  const body: OrderApsAuthPayload = {
    v: 1,
    exp: Date.now() + APS_STATE_TTL_MS,
    ...payload,
  };
  const json = JSON.stringify(body);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", env.JWT_SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function parseOrderApsAuthState(token: string): OrderApsAuthPayload {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new HttpError(400, "Invalid APS checkout state.");
  }
  const [b64, sig] = parts;
  const expected = crypto.createHmac("sha256", env.JWT_SECRET).update(b64).digest("base64url");
  if (!timingSafeEqual(sig, expected)) {
    throw new HttpError(400, "Invalid APS checkout state.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid APS checkout state.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new HttpError(400, "Invalid APS checkout state.");
  }
  const p = parsed as OrderApsAuthPayload;
  if (
    p.v !== 1 ||
    typeof p.paymentId !== "string" ||
    (p.kind !== "order" && p.kind !== "guest_invoice")
  ) {
    throw new HttpError(400, "Invalid APS checkout state.");
  }
  const authMode = p.authMode === "stored" ? "stored" : "otp";
  if (authMode === "otp") {
    if (typeof p.requestToken !== "string" || !p.requestToken.trim()) {
      throw new HttpError(400, "Invalid APS checkout state.");
    }
  } else if (typeof p.requestToken !== "string") {
    throw new HttpError(400, "Invalid APS checkout state.");
  }
  if (Date.now() > p.exp) {
    throw new HttpError(400, "APS checkout session expired. Request a new OTP.");
  }
  return p;
}

function rethrowAsHttpError(e: unknown): never {
  if (e instanceof HttpError) {
    throw e;
  }
  const msg = e instanceof Error ? e.message : "APS Wallet could not complete the request.";
  throw new HttpError(400, msg);
}

async function assertGatewayAps(code: string): Promise<void> {
  const gateway = await getPaymentGatewayByCode(code);
  if (!gateway) {
    throw new HttpError(
      400,
      `No payment gateway is registered with code "${code}". Add or select the APS gateway your platform created (e.g. aps_wallet).`,
    );
  }
  if (!gateway.isEnabled) {
    throw new HttpError(
      400,
      "This payment gateway is disabled. A platform admin must enable it under Platform → Payment gateways.",
    );
  }
  const adapter = gateway.checkoutAdapter?.trim() || "";
  if (adapter !== CHECKOUT_ADAPTER_APS_WALLET) {
    throw new HttpError(
      400,
      `Gateway "${gateway.name}" (${code}) is not wired to APS Wallet. Set checkout adapter to aps_wallet (current: ${adapter || "none"}).`,
    );
  }
}

function genPublicToken(): string {
  return crypto.randomBytes(16).toString("base64url");
}

export async function authorizeOrderApsWalletCheckout(input: {
  orderId: string;
  businessId: string;
  gatewayCode: string;
  payerMobile: string;
  recordedByUserId?: string | null;
  req: Request;
}): Promise<{ authState: string; requiresOtp: boolean }> {
  void input.req;
  const code = input.gatewayCode.trim().toLowerCase();
  await assertGatewayAps(code);

  const mobile = normalizeApsCustomerMobile(input.payerMobile ?? "");
  if (!mobile) {
    throw new HttpError(400, "APS mobile number is required.");
  }

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, businessId: input.businessId },
    include: { business: { select: { name: true } } },
  });
  if (!order) {
    throw new HttpError(404, "Order not found.");
  }
  if (order.status === OrderStatus.PAID) {
    throw new HttpError(400, "Order is already paid.");
  }
  if (order.status !== OrderStatus.PENDING_PAYMENT) {
    throw new HttpError(400, "Order cannot accept payment.");
  }

  console.log(LOG_PREFIX, "order_checkout_authorize_start", {
    orderId: input.orderId,
    businessId: input.businessId,
    gatewayCode: code,
  });

  await prisma.payment.updateMany({
    where: {
      orderId: input.orderId,
      businessId: input.businessId,
      method: PaymentMethod.QR_WALLET,
      status: PaymentStatus.PENDING,
    },
    data: { status: PaymentStatus.CANCELLED },
  });

  const publicToken = genPublicToken();
  const recordedBy = input.recordedByUserId?.trim() || undefined;
  const payment = await prisma.payment.create({
    data: {
      businessId: input.businessId,
      orderId: input.orderId,
      publicCode: await nextPaymentPublicCode(prisma, input.businessId, order.business.name),
      method: PaymentMethod.QR_WALLET,
      provider: PaymentProvider.APS_WALLET,
      gatewayCode: code,
      status: PaymentStatus.PENDING,
      amount: order.total,
      currency: order.currency,
      providerRef: `authorize:${Date.now().toString(36)}`,
      publicToken,
      recordedByUserId: recordedBy,
    },
  });

  if (recordedBy) {
    await appendActivityLog(prisma, {
      businessId: input.businessId,
      actorUserId: recordedBy,
      actorKind: ActivityActorKind.USER,
      eventType: ACTIVITY_EVENT.PAYMENT_WALLET_INITIATED,
      resourceType: "payment",
      resourceId: payment.id,
      metadata: {
        orderId: input.orderId,
        orderPublicCode: order.publicCode,
        paymentPublicCode: payment.publicCode,
        provider: "aps_wallet",
        gatewayCode: code,
      },
    });
  }

  const gateway = await getPaymentGatewayByCode(code);
  if (!gateway) {
    throw new HttpError(400, "Payment gateway not found.");
  }

  const storedAuth = await getStoredApsAuthorizedToken(input.businessId, gateway.id, mobile);

  let requestToken: string;
  let authMode: "otp" | "stored";

  if (storedAuth) {
    authMode = "stored";
    requestToken = "";
    console.log(LOG_PREFIX, "order_checkout_authorize_using_stored_customer_auth", {
      orderId: order.id,
      paymentId: payment.id,
      gatewayCode: code,
    });
  } else {
    authMode = "otp";
    const merchantCtx = await resolveApsWalletMerchantContextForBusiness(input.businessId, code);
    try {
      requestToken = await apsWalletAuthorizeCustomer(mobile, merchantCtx);
    } catch (e) {
      console.log(LOG_PREFIX, "order_checkout_authorize_failed", {
        orderId: input.orderId,
        step: "authorize_customer",
      });
      rethrowAsHttpError(e);
    }
  }

  const authState = signOrderApsAuthPayload({
    kind: "order",
    orderId: order.id,
    paymentId: payment.id,
    businessId: input.businessId,
    gatewayCode: code,
    requestToken,
    payerMobile: mobile,
    authMode,
  });

  console.log(LOG_PREFIX, "order_checkout_authorize_done", {
    orderId: order.id,
    paymentId: payment.id,
    requiresOtp: authMode === "otp",
  });

  return { authState, requiresOtp: authMode === "otp" };
}

export async function completeOrderApsWalletCheckout(input: {
  orderId: string;
  businessId: string;
  gatewayCode: string;
  otp?: string;
  authState: string;
  req: Request;
}): Promise<{ paid: true; receiptId: string | null }> {
  void input.req;
  const code = input.gatewayCode.trim().toLowerCase();
  await assertGatewayAps(code);

  const state = parseOrderApsAuthState(input.authState);
  if (state.kind !== "order" || state.orderId !== input.orderId || state.businessId !== input.businessId) {
    throw new HttpError(400, "APS checkout does not match this order.");
  }
  if (state.gatewayCode !== code) {
    throw new HttpError(400, "APS checkout does not match this gateway.");
  }

  const payment = await prisma.payment.findFirst({
    where: {
      id: state.paymentId,
      orderId: input.orderId,
      businessId: input.businessId,
    },
  });
  if (!payment) {
    throw new HttpError(404, "Payment not found.");
  }
  if (payment.provider !== PaymentProvider.APS_WALLET) {
    throw new HttpError(400, "This payment is not an APS Wallet checkout.");
  }

  const authMode = state.authMode === "stored" ? "stored" : "otp";
  const gateway = await getPaymentGatewayByCode(code);
  if (!gateway) {
    throw new HttpError(400, "Payment gateway not found.");
  }

  const otp = input.otp?.trim();
  if (authMode === "otp" && !otp) {
    throw new HttpError(400, "OTP is required.");
  }
  if (authMode === "stored" && otp) {
    throw new HttpError(400, "OTP is not required for this checkout — use Pay without a code.");
  }

  console.log(LOG_PREFIX, "order_checkout_complete_start", {
    orderId: input.orderId,
    paymentId: payment.id,
    gatewayCode: code,
    authMode,
  });

  const merchantCtx = await resolveApsWalletMerchantContextForBusiness(input.businessId, code);

  let authorizedToken: string;
  if (authMode === "stored") {
    const stored = await getStoredApsAuthorizedToken(input.businessId, gateway.id, state.payerMobile);
    if (!stored) {
      throw new HttpError(
        400,
        "Saved APS customer authorization is missing or was cleared. Start checkout again to receive an OTP.",
      );
    }
    authorizedToken = stored;
  } else {
    try {
      authorizedToken = await apsWalletConfirmCustomer(otp!, state.requestToken, merchantCtx);
    } catch (e) {
      console.log(LOG_PREFIX, "order_checkout_complete_failed", {
        step: "confirm_customer",
        orderId: input.orderId,
      });
      rethrowAsHttpError(e);
    }
    await upsertStoredApsAuthorizedToken(input.businessId, gateway.id, state.payerMobile, authorizedToken);
  }

  const amountStr = new Prisma.Decimal(payment.amount.toString()).toFixed(2);
  let processed: Awaited<ReturnType<typeof apsWalletProcessPayment>>;
  try {
    processed = await apsWalletProcessPayment(amountStr, authorizedToken, merchantCtx);
  } catch (e) {
    if (authMode === "stored") {
      await deleteStoredApsAuthorizedToken(input.businessId, gateway.id, state.payerMobile);
    }
    console.log(LOG_PREFIX, "order_checkout_complete_failed", {
      step: "process_payment",
      orderId: input.orderId,
    });
    rethrowAsHttpError(e);
  }

  const providerRef =
    processed.reference || `aps:${payment.id}:${Date.now().toString(36)}`;

  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerRef },
  });

  const externalEventId = processed.reference ?? providerRef;
  const result = await completeWalletPaymentByPublicToken(payment.publicToken, {
    externalEventId,
    settlementSource: "aps_wallet",
  });

  console.log(LOG_PREFIX, "order_checkout_complete_done", {
    orderId: input.orderId,
    paid: true,
    amount: amountStr,
    apsPaymentReference: processed.reference ?? providerRef,
  });

  return { paid: true, receiptId: result.receiptId ?? null };
}

export async function authorizeGuestSalesInvoiceApsWalletCheckout(input: {
  guestToken: string;
  gatewayCode: string;
  payerMobile: string;
  req: Request;
}): Promise<{ authState: string; requiresOtp: boolean }> {
  void input.req;
  const t = input.guestToken?.trim();
  if (!t) {
    throw new HttpError(400, "Invalid link.");
  }
  const code = input.gatewayCode.trim().toLowerCase();
  await assertGatewayAps(code);

  const mobile = normalizeApsCustomerMobile(input.payerMobile ?? "");
  if (!mobile) {
    throw new HttpError(400, "APS mobile number is required.");
  }

  const invoice = await prisma.salesInvoice.findFirst({
    where: { guestToken: t },
    include: {
      business: { select: { name: true } },
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!invoice) {
    throw new HttpError(404, "Invoice not found.");
  }
  if (invoice.status !== SalesInvoiceStatus.APPROVED || invoice.journalEntryId) {
    throw new HttpError(400, "This invoice cannot be paid online.");
  }
  if (!invoice.lines.length) {
    throw new HttpError(400, "Invoice has no lines.");
  }

  let total = new Prisma.Decimal(0);
  for (const l of invoice.lines) {
    total = total.add(l.quantity.mul(l.unitAmount).add(l.taxAmount));
  }

  console.log(LOG_PREFIX, "guest_invoice_checkout_authorize_start", {
    invoiceId: invoice.id,
    businessId: invoice.businessId,
    gatewayCode: code,
  });

  const publicToken = genPublicToken();
  const payment = await upsertSalesInvoiceWalletPayment(
    invoice.id,
    invoice.businessId,
    invoice.business.name,
    {
      total,
      currency: invoice.currency,
      method: PaymentMethod.QR_WALLET,
      provider: PaymentProvider.APS_WALLET,
      gatewayCode: code,
      providerRef: `authorize:${Date.now().toString(36)}`,
      publicToken,
    },
  );

  const gateway = await getPaymentGatewayByCode(code);
  if (!gateway) {
    throw new HttpError(400, "Payment gateway not found.");
  }

  const storedAuth = await getStoredApsAuthorizedToken(invoice.businessId, gateway.id, mobile);

  let requestToken: string;
  let authMode: "otp" | "stored";

  if (storedAuth) {
    authMode = "stored";
    requestToken = "";
    console.log(LOG_PREFIX, "guest_invoice_checkout_authorize_using_stored_customer_auth", {
      invoiceId: invoice.id,
      paymentId: payment.id,
    });
  } else {
    authMode = "otp";
    const guestMerchantCtx = await resolveApsWalletMerchantContextForBusiness(invoice.businessId, code);
    try {
      requestToken = await apsWalletAuthorizeCustomer(mobile, guestMerchantCtx);
    } catch (e) {
      console.log(LOG_PREFIX, "guest_invoice_checkout_authorize_failed", {
        invoiceId: invoice.id,
        step: "authorize_customer",
      });
      rethrowAsHttpError(e);
    }
  }

  const authState = signOrderApsAuthPayload({
    kind: "guest_invoice",
    salesInvoiceId: invoice.id,
    guestToken: t,
    paymentId: payment.id,
    businessId: invoice.businessId,
    gatewayCode: code,
    requestToken,
    payerMobile: mobile,
    authMode,
  });

  console.log(LOG_PREFIX, "guest_invoice_checkout_authorize_done", {
    invoiceId: invoice.id,
    paymentId: payment.id,
    requiresOtp: authMode === "otp",
  });

  return { authState, requiresOtp: authMode === "otp" };
}

export async function completeGuestSalesInvoiceApsWalletCheckout(input: {
  guestToken: string;
  gatewayCode: string;
  otp?: string;
  authState: string;
  req: Request;
}): Promise<{ paid: true }> {
  void input.req;
  const t = input.guestToken?.trim();
  if (!t) {
    throw new HttpError(400, "Invalid link.");
  }
  const code = input.gatewayCode.trim().toLowerCase();
  await assertGatewayAps(code);

  const state = parseOrderApsAuthState(input.authState);
  if (state.kind !== "guest_invoice" || state.guestToken?.trim() !== t) {
    throw new HttpError(400, "APS checkout does not match this link.");
  }
  if (state.gatewayCode !== code) {
    throw new HttpError(400, "APS checkout does not match this gateway.");
  }

  const payment = await prisma.payment.findFirst({
    where: {
      id: state.paymentId,
      businessId: state.businessId,
      salesInvoiceId: state.salesInvoiceId ?? undefined,
    },
  });
  if (!payment?.salesInvoiceId) {
    throw new HttpError(404, "Payment not found.");
  }
  if (payment.provider !== PaymentProvider.APS_WALLET) {
    throw new HttpError(400, "This payment is not an APS Wallet checkout.");
  }

  const authMode = state.authMode === "stored" ? "stored" : "otp";
  const gateway = await getPaymentGatewayByCode(code);
  if (!gateway) {
    throw new HttpError(400, "Payment gateway not found.");
  }

  const otp = input.otp?.trim();
  if (authMode === "otp" && !otp) {
    throw new HttpError(400, "OTP is required.");
  }
  if (authMode === "stored" && otp) {
    throw new HttpError(400, "OTP is not required for this checkout — confirm payment without a code.");
  }

  console.log(LOG_PREFIX, "guest_invoice_checkout_complete_start", {
    invoiceId: payment.salesInvoiceId,
    paymentId: payment.id,
    gatewayCode: code,
    authMode,
  });

  const guestCompleteCtx = await resolveApsWalletMerchantContextForBusiness(payment.businessId, code);

  let authorizedToken: string;
  if (authMode === "stored") {
    const stored = await getStoredApsAuthorizedToken(payment.businessId, gateway.id, state.payerMobile);
    if (!stored) {
      throw new HttpError(
        400,
        "Saved APS customer authorization is missing or was cleared. Start checkout again to receive an OTP.",
      );
    }
    authorizedToken = stored;
  } else {
    try {
      authorizedToken = await apsWalletConfirmCustomer(otp!, state.requestToken, guestCompleteCtx);
    } catch (e) {
      console.log(LOG_PREFIX, "guest_invoice_checkout_complete_failed", {
        step: "confirm_customer",
        invoiceId: payment.salesInvoiceId,
      });
      rethrowAsHttpError(e);
    }
    await upsertStoredApsAuthorizedToken(payment.businessId, gateway.id, state.payerMobile, authorizedToken);
  }

  const amountStr = new Prisma.Decimal(payment.amount.toString()).toFixed(2);
  let processed: Awaited<ReturnType<typeof apsWalletProcessPayment>>;
  try {
    processed = await apsWalletProcessPayment(amountStr, authorizedToken, guestCompleteCtx);
  } catch (e) {
    if (authMode === "stored") {
      await deleteStoredApsAuthorizedToken(payment.businessId, gateway.id, state.payerMobile);
    }
    console.log(LOG_PREFIX, "guest_invoice_checkout_complete_failed", {
      step: "process_payment",
      invoiceId: payment.salesInvoiceId,
    });
    rethrowAsHttpError(e);
  }

  const providerRef =
    processed.reference || `aps:${payment.id}:${Date.now().toString(36)}`;

  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerRef },
  });

  const externalEventId = processed.reference ?? providerRef;
  await completeWalletPaymentByPublicToken(payment.publicToken, {
    externalEventId,
    settlementSource: "aps_wallet",
  });

  console.log(LOG_PREFIX, "guest_invoice_checkout_complete_done", {
    invoiceId: payment.salesInvoiceId,
    paid: true,
    apsPaymentReference: processed.reference ?? providerRef,
  });

  return { paid: true };
}
