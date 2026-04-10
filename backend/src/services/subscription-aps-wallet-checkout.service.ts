import crypto from "node:crypto";

import { InvoiceStatus } from "@prisma/client";
import type { Request } from "express";

import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  CHECKOUT_ADAPTER_APS_WALLET,
  getPaymentGatewayByCode,
} from "./payment-gateway.service.js";
import {
  apsWalletAuthorizeCustomer,
  apsWalletConfirmCustomer,
  apsWalletProcessPayment,
  normalizeApsCustomerMobile,
} from "./aps-wallet-client.service.js";
import {
  deleteStoredApsAuthorizedToken,
  getStoredApsAuthorizedToken,
  upsertStoredApsAuthorizedToken,
} from "./aps-wallet-customer-auth.service.js";
import { completeSubscriptionInvoicePayment } from "./subscription.service.js";

const APS_STATE_TTL_MS = 15 * 60 * 1000;
const LOG_PREFIX = "[APS Wallet]";

type ApsAuthPayload = {
  v: 1;
  exp: number;
  invoiceId: string;
  gatewayCode: string;
  requestToken: string;
  payerMobile: string;
  kind: "business" | "guest";
  businessId?: string;
  guestToken?: string;
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

function signApsAuthPayload(payload: Omit<ApsAuthPayload, "v" | "exp">): string {
  const body: ApsAuthPayload = {
    v: 1,
    exp: Date.now() + APS_STATE_TTL_MS,
    ...payload,
  };
  const json = JSON.stringify(body);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", env.JWT_SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function parseApsAuthState(token: string): ApsAuthPayload {
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
  const p = parsed as ApsAuthPayload;
  if (p.v !== 1 || typeof p.invoiceId !== "string") {
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

async function loadPayableInvoiceForBusiness(invoiceId: string, businessId: string) {
  const invoice = await prisma.subscriptionInvoice.findFirst({
    where: { id: invoiceId, businessId },
    include: { plan: true, subscription: true },
  });
  if (!invoice) {
    throw new HttpError(404, "Invoice not found.");
  }
  if (invoice.status !== InvoiceStatus.PENDING) {
    throw new HttpError(400, "Only pending invoices can be paid.");
  }
  const amount = Number(invoice.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, "Invalid invoice amount.");
  }
  return invoice;
}

async function loadPayableInvoiceForGuest(guestToken: string) {
  const t = guestToken?.trim();
  if (!t) {
    throw new HttpError(400, "Invalid link.");
  }
  const invoice = await prisma.subscriptionInvoice.findFirst({
    where: { guestToken: t },
    include: { plan: true, subscription: true, business: true },
  });
  if (!invoice) {
    throw new HttpError(404, "Invoice not found.");
  }
  if (invoice.status !== InvoiceStatus.PENDING) {
    throw new HttpError(400, "Only pending invoices can be paid.");
  }
  const amount = Number(invoice.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, "Invalid invoice amount.");
  }
  return invoice;
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

export async function authorizeSubscriptionInvoiceApsCheckout(input: {
  invoiceId: string;
  businessId: string;
  userId: string;
  gatewayCode: string;
  payerMobile: string;
  req: Request;
}): Promise<{ authState: string; requiresOtp: boolean }> {
  const membership = await prisma.businessMembership.findFirst({
    where: { userId: input.userId, businessId: input.businessId },
  });
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  const isPlatform = user?.role === "PLATFORM_OWNER" || user?.role === "PLATFORM_ADMIN";
  if (!membership?.isOwner && !isPlatform) {
    throw new HttpError(403, "Only the business owner can pay subscription invoices.");
  }

  const code = input.gatewayCode.trim().toLowerCase();
  await assertGatewayAps(code);

  const mobile = normalizeApsCustomerMobile(input.payerMobile ?? "");
  if (!mobile) {
    throw new HttpError(400, "APS mobile number is required.");
  }

  console.log(LOG_PREFIX, "checkout_authorize_start", {
    invoiceId: input.invoiceId,
    businessId: input.businessId,
    gatewayCode: code,
  });

  const invoice = await loadPayableInvoiceForBusiness(input.invoiceId, input.businessId);
  void input.req;

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
  } else {
    authMode = "otp";
    try {
      requestToken = await apsWalletAuthorizeCustomer(mobile);
    } catch (e) {
      console.log(LOG_PREFIX, "checkout_authorize_failed", {
        invoiceId: input.invoiceId,
        step: "authorize_customer",
      });
      rethrowAsHttpError(e);
    }
  }

  const authState = signApsAuthPayload({
    invoiceId: invoice.id,
    gatewayCode: code,
    requestToken,
    payerMobile: mobile,
    kind: "business",
    businessId: input.businessId,
    authMode,
  });

  console.log(LOG_PREFIX, "checkout_authorize_done", {
    invoiceId: invoice.id,
    authStateChars: authState.length,
    requiresOtp: authMode === "otp",
  });

  return { authState, requiresOtp: authMode === "otp" };
}

export async function authorizeGuestSubscriptionInvoiceApsCheckout(input: {
  guestToken: string;
  gatewayCode: string;
  payerMobile: string;
  req: Request;
}): Promise<{ authState: string; requiresOtp: boolean }> {
  void input.req;
  const code = input.gatewayCode.trim().toLowerCase();
  await assertGatewayAps(code);

  const mobile = normalizeApsCustomerMobile(input.payerMobile ?? "");
  if (!mobile) {
    throw new HttpError(400, "APS mobile number is required.");
  }

  console.log(LOG_PREFIX, "checkout_guest_authorize_start", {
    invoiceWillLoad: true,
    gatewayCode: code,
  });

  const invoice = await loadPayableInvoiceForGuest(input.guestToken);

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
  } else {
    authMode = "otp";
    try {
      requestToken = await apsWalletAuthorizeCustomer(mobile);
    } catch (e) {
      console.log(LOG_PREFIX, "checkout_guest_authorize_failed", { step: "authorize_customer" });
      rethrowAsHttpError(e);
    }
  }

  const authState = signApsAuthPayload({
    invoiceId: invoice.id,
    gatewayCode: code,
    requestToken,
    payerMobile: mobile,
    kind: "guest",
    guestToken: input.guestToken.trim(),
    authMode,
  });

  console.log(LOG_PREFIX, "checkout_guest_authorize_done", {
    invoiceId: invoice.id,
    authStateChars: authState.length,
    requiresOtp: authMode === "otp",
  });

  return { authState, requiresOtp: authMode === "otp" };
}

export async function completeSubscriptionInvoiceApsCheckout(input: {
  invoiceId: string;
  businessId: string;
  userId: string;
  gatewayCode: string;
  otp?: string;
  authState: string;
  req: Request;
}): Promise<{ paid: true }> {
  const membership = await prisma.businessMembership.findFirst({
    where: { userId: input.userId, businessId: input.businessId },
  });
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  const isPlatform = user?.role === "PLATFORM_OWNER" || user?.role === "PLATFORM_ADMIN";
  if (!membership?.isOwner && !isPlatform) {
    throw new HttpError(403, "Only the business owner can pay subscription invoices.");
  }

  const code = input.gatewayCode.trim().toLowerCase();
  await assertGatewayAps(code);

  const state = parseApsAuthState(input.authState);
  if (state.kind !== "business" || state.businessId !== input.businessId) {
    throw new HttpError(400, "APS checkout does not match this invoice or business.");
  }
  if (state.invoiceId !== input.invoiceId || state.gatewayCode !== code) {
    throw new HttpError(400, "APS checkout does not match this request.");
  }

  const invoice = await loadPayableInvoiceForBusiness(input.invoiceId, input.businessId);

  const gateway = await getPaymentGatewayByCode(code);
  if (!gateway) {
    throw new HttpError(400, "Payment gateway not found.");
  }

  const authMode = state.authMode === "stored" ? "stored" : "otp";
  const otp = input.otp?.trim();
  if (authMode === "otp" && !otp) {
    throw new HttpError(400, "OTP is required.");
  }
  if (authMode === "stored" && otp) {
    throw new HttpError(400, "OTP is not required for this checkout — confirm payment without a code.");
  }

  void input.req;

  console.log(LOG_PREFIX, "checkout_complete_start", {
    invoiceId: invoice.id,
    otpDigits: otp?.length ?? 0,
    gatewayCode: code,
    authMode,
  });

  let authorizedToken: string;
  if (authMode === "stored") {
    const stored = await getStoredApsAuthorizedToken(invoice.businessId, gateway.id, state.payerMobile);
    if (!stored) {
      throw new HttpError(
        400,
        "Saved APS customer authorization is missing or was cleared. Start checkout again to receive an OTP.",
      );
    }
    authorizedToken = stored;
  } else {
    try {
      authorizedToken = await apsWalletConfirmCustomer(otp!, state.requestToken);
    } catch (e) {
      console.log(LOG_PREFIX, "checkout_complete_failed", { step: "confirm_customer", invoiceId: invoice.id });
      rethrowAsHttpError(e);
    }
    await upsertStoredApsAuthorizedToken(invoice.businessId, gateway.id, state.payerMobile, authorizedToken);
  }

  const amountStr = invoice.amount.toFixed(2);
  let processed: Awaited<ReturnType<typeof apsWalletProcessPayment>>;
  try {
    processed = await apsWalletProcessPayment(amountStr, authorizedToken);
  } catch (e) {
    if (authMode === "stored") {
      await deleteStoredApsAuthorizedToken(invoice.businessId, gateway.id, state.payerMobile);
    }
    console.log(LOG_PREFIX, "checkout_complete_failed", { step: "process_payment", invoiceId: invoice.id });
    rethrowAsHttpError(e);
  }

  const providerRef =
    processed.reference ||
    `aps:${invoice.id}:${Date.now().toString(36)}`;

  try {
    await completeSubscriptionInvoicePayment({
      invoiceId: invoice.id,
      provider: CHECKOUT_ADAPTER_APS_WALLET,
      providerCheckoutSessionId: providerRef,
      providerPaymentRef: processed.reference ?? null,
      metadata: {
        source: "aps_wallet_sync",
        payerMobile: state.payerMobile,
        apsPaymentReference: processed.reference ?? providerRef,
      },
    });
  } catch (e) {
    console.log(LOG_PREFIX, "checkout_complete_failed", { step: "complete_subscription_invoice_payment", invoiceId: invoice.id });
    rethrowAsHttpError(e);
  }

  console.log(LOG_PREFIX, "checkout_complete_done", {
    invoiceId: invoice.id,
    paid: true,
    amount: amountStr,
    currency: invoice.currency || "GMD",
    apsPaymentReference: processed.reference ?? providerRef,
  });

  return { paid: true };
}

export async function completeGuestSubscriptionInvoiceApsCheckout(input: {
  guestToken: string;
  gatewayCode: string;
  otp?: string;
  authState: string;
  req: Request;
}): Promise<{ paid: true }> {
  void input.req;
  const code = input.gatewayCode.trim().toLowerCase();
  await assertGatewayAps(code);

  const state = parseApsAuthState(input.authState);
  if (state.kind !== "guest" || state.guestToken?.trim() !== input.guestToken.trim()) {
    throw new HttpError(400, "APS checkout does not match this link.");
  }
  if (state.gatewayCode !== code) {
    throw new HttpError(400, "APS checkout does not match this gateway.");
  }

  const invoice = await loadPayableInvoiceForGuest(input.guestToken);
  if (state.invoiceId !== invoice.id) {
    throw new HttpError(400, "APS checkout does not match this invoice.");
  }

  const gateway = await getPaymentGatewayByCode(code);
  if (!gateway) {
    throw new HttpError(400, "Payment gateway not found.");
  }

  const authMode = state.authMode === "stored" ? "stored" : "otp";
  const otp = input.otp?.trim();
  if (authMode === "otp" && !otp) {
    throw new HttpError(400, "OTP is required.");
  }
  if (authMode === "stored" && otp) {
    throw new HttpError(400, "OTP is not required for this checkout — confirm payment without a code.");
  }

  console.log(LOG_PREFIX, "checkout_guest_complete_start", {
    invoiceId: invoice.id,
    otpDigits: otp?.length ?? 0,
    gatewayCode: code,
    authMode,
  });

  let authorizedToken: string;
  if (authMode === "stored") {
    const stored = await getStoredApsAuthorizedToken(invoice.businessId, gateway.id, state.payerMobile);
    if (!stored) {
      throw new HttpError(
        400,
        "Saved APS customer authorization is missing or was cleared. Start checkout again to receive an OTP.",
      );
    }
    authorizedToken = stored;
  } else {
    try {
      authorizedToken = await apsWalletConfirmCustomer(otp!, state.requestToken);
    } catch (e) {
      console.log(LOG_PREFIX, "checkout_guest_complete_failed", { step: "confirm_customer", invoiceId: invoice.id });
      rethrowAsHttpError(e);
    }
    await upsertStoredApsAuthorizedToken(invoice.businessId, gateway.id, state.payerMobile, authorizedToken);
  }

  const amountStr = invoice.amount.toFixed(2);
  let processed: Awaited<ReturnType<typeof apsWalletProcessPayment>>;
  try {
    processed = await apsWalletProcessPayment(amountStr, authorizedToken);
  } catch (e) {
    if (authMode === "stored") {
      await deleteStoredApsAuthorizedToken(invoice.businessId, gateway.id, state.payerMobile);
    }
    console.log(LOG_PREFIX, "checkout_guest_complete_failed", { step: "process_payment", invoiceId: invoice.id });
    rethrowAsHttpError(e);
  }

  const providerRef =
    processed.reference ||
    `aps:${invoice.id}:${Date.now().toString(36)}`;

  try {
    await completeSubscriptionInvoicePayment({
      invoiceId: invoice.id,
      provider: CHECKOUT_ADAPTER_APS_WALLET,
      providerCheckoutSessionId: providerRef,
      providerPaymentRef: processed.reference ?? null,
      metadata: {
        source: "aps_wallet_guest",
        payerMobile: state.payerMobile,
        apsPaymentReference: processed.reference ?? providerRef,
      },
    });
  } catch (e) {
    console.log(LOG_PREFIX, "checkout_guest_complete_failed", {
      step: "complete_subscription_invoice_payment",
      invoiceId: invoice.id,
    });
    rethrowAsHttpError(e);
  }

  console.log(LOG_PREFIX, "checkout_guest_complete_done", {
    invoiceId: invoice.id,
    paid: true,
    amount: amountStr,
    currency: invoice.currency || "GMD",
    apsPaymentReference: processed.reference ?? providerRef,
  });

  return { paid: true };
}
