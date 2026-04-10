import { randomBytes } from "node:crypto";
import type { Request } from "express";
import { ActivityActorKind, Prisma, SalesInvoiceStatus } from "@prisma/client";

import { buildPayUrl, spaHashRoute } from "../lib/public-guest-urls.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import {
  OrderStatus,
  PaymentMethod,
  PaymentMethodType,
  PaymentProvider,
  PaymentProviderType,
  PaymentStatus,
} from "../lib/prisma-sales-enums.js";
import { resolveAppPublicBaseForBrowserReturns } from "../config/app-public-url.js";
import { waveApiBaseUrl, yonnaForexApiBaseUrl } from "../config/payment-provider-env.js";
import { WavePaymentService } from "./wave-payment.service.js";
import { YonnaForexPaymentService } from "./yonna-forex-payment.service.js";
import {
  CHECKOUT_ADAPTER_APS_WALLET,
  CHECKOUT_ADAPTER_WAVE_GAMBIA,
  CHECKOUT_ADAPTER_YONNA_WALLET,
  getPaymentGatewayByCode,
} from "./payment-gateway.service.js";
import {
  getDecryptedGatewaySecrets,
  listBusinessGatewayCredentialStatus,
  type WaveGatewaySecrets,
  type YonnaGatewaySecrets,
} from "./business-gateway-credential.service.js";
import { ACTIVITY_EVENT, appendActivityLog } from "./activity-log.service.js";

function buildBusinessCodePrefix(name: string): string {
  const sanitized = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (sanitized.slice(0, 3) || "BUS").padEnd(3, "X");
}

function buildPublicCode(
  businessName: string,
  kind: "ORD" | "PAY" | "RCT",
  sequence: number,
): string {
  return `${buildBusinessCodePrefix(businessName)}-${kind}-${String(sequence).padStart(5, "0")}`;
}

function parsePublicCodeSequence(code: string | null | undefined): number {
  if (!code) {
    return 0;
  }
  const match = code.match(/(\d{5})$/);
  return match ? Number(match[1]) : 0;
}

export async function nextPaymentPublicCode(
  tx: Pick<Prisma.TransactionClient, "payment">,
  businessId: string,
  businessName: string,
): Promise<string> {
  const prefix = `${buildBusinessCodePrefix(businessName)}-PAY-`;
  const last = await tx.payment.findFirst({
    where: { businessId, publicCode: { startsWith: prefix } },
    orderBy: { publicCode: "desc" },
    select: { publicCode: true },
  });
  return buildPublicCode(businessName, "PAY", parsePublicCodeSequence(last?.publicCode) + 1);
}

function genPublicToken(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * `Payment.salesInvoiceId` is @unique — only one row per invoice. Reuse/update it on retries
 * (e.g. switch Wave → Yonna) instead of inserting again.
 */
async function upsertSalesInvoiceWalletPayment(
  invoiceId: string,
  businessId: string,
  businessName: string,
  input: {
    total: Prisma.Decimal;
    currency: string;
    method: PaymentMethodType;
    provider: PaymentProviderType;
    gatewayCode: string;
    providerRef: string;
    publicToken: string;
  },
) {
  const existing = await prisma.payment.findFirst({
    where: { salesInvoiceId: invoiceId },
  });
  if (existing?.status === PaymentStatus.COMPLETED) {
    throw new HttpError(400, "This invoice payment is already completed.");
  }
  if (existing) {
    return prisma.payment.update({
      where: { id: existing.id },
      data: {
        orderId: null,
        status: PaymentStatus.PENDING,
        amount: input.total,
        currency: input.currency,
        method: input.method,
        provider: input.provider,
        gatewayCode: input.gatewayCode,
        providerRef: input.providerRef,
        publicToken: input.publicToken,
        completedAt: null,
      },
    });
  }
  return prisma.payment.create({
    data: {
      businessId,
      orderId: null,
      salesInvoiceId: invoiceId,
      publicCode: await nextPaymentPublicCode(prisma, businessId, businessName),
      method: input.method,
      provider: input.provider,
      gatewayCode: input.gatewayCode,
      status: PaymentStatus.PENDING,
      amount: input.total,
      currency: input.currency,
      providerRef: input.providerRef,
      publicToken: input.publicToken,
    },
  });
}

export type OrderCheckoutWalletRow = {
  gatewayId: string;
  code: string;
  name: string;
  checkoutAdapter: string;
  /** Kept for API compatibility; always false (Yonna requires payer phone per checkout). */
  hasStoredPayerPhone: boolean;
};

export async function listOrderCheckoutWallets(businessId: string): Promise<OrderCheckoutWalletRow[]> {
  const rows = await listBusinessGatewayCredentialStatus(businessId);
  return rows
    .filter((r) => r.checkoutConfigured)
    .map((r) => {
      const adapter = (r.checkoutAdapter || "").trim();
      return {
        gatewayId: r.gatewayId,
        code: r.code,
        name: r.name,
        checkoutAdapter: adapter,
        hasStoredPayerPhone: false,
      };
    });
}

export type GatewayWalletCheckoutResult = {
  payment: Awaited<ReturnType<typeof prisma.payment.create>>;
  qrPayload: string;
  launchUrl: string;
  paymentHtml: string | null;
  checkoutAdapter: string;
};

export async function startGatewayWalletCheckout(input: {
  orderId: string;
  businessId: string;
  gatewayCode: string;
  payerPhone?: string;
  /** Staff who started QR checkout from POS */
  recordedByUserId?: string;
  req: Request;
}): Promise<GatewayWalletCheckoutResult> {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, businessId: input.businessId },
    include: {
      business: { select: { name: true } },
    },
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

  const codeNorm = input.gatewayCode.trim().toLowerCase();
  const wallets = await listOrderCheckoutWallets(input.businessId);
  const pick = wallets.find((w) => w.code === codeNorm);
  if (!pick) {
    throw new HttpError(
      400,
      "This wallet is not configured for checkout. Add credentials under Merchant API.",
    );
  }

  const gateway = await getPaymentGatewayByCode(codeNorm);
  if (!gateway || !gateway.isEnabled) {
    throw new HttpError(400, "This payment gateway is not available.");
  }

  const adapter = gateway.checkoutAdapter?.trim() || "";
  if (adapter === CHECKOUT_ADAPTER_APS_WALLET) {
    throw new HttpError(
      400,
      "APS Wallet uses SMS OTP checkout. Use the order APS Wallet authorize and complete endpoints instead of this single-step call.",
    );
  }
  if (adapter !== CHECKOUT_ADAPTER_WAVE_GAMBIA && adapter !== CHECKOUT_ADAPTER_YONNA_WALLET) {
    throw new HttpError(400, "Checkout is not supported for this gateway.");
  }

  await prisma.payment.updateMany({
    where: {
      orderId: input.orderId,
      businessId: input.businessId,
      method: PaymentMethod.QR_WALLET,
      status: PaymentStatus.PENDING,
    },
    data: { status: PaymentStatus.CANCELLED },
  });

  const appBase = resolveAppPublicBaseForBrowserReturns(input.req);

  if (adapter === CHECKOUT_ADAPTER_WAVE_GAMBIA) {
    const secrets = await getDecryptedGatewaySecrets<WaveGatewaySecrets>(
      input.businessId,
      codeNorm,
    );
    if (!secrets?.bearerToken?.trim()) {
      throw new HttpError(503, "Wallet credentials could not be loaded for this business.");
    }

    const publicToken = genPublicToken();
    const successUrl = spaHashRoute(appBase, `/pay/${encodeURIComponent(publicToken)}`);
    const errorUrl = spaHashRoute(appBase, `/pay/${encodeURIComponent(publicToken)}?error=1`);

    const wave = new WavePaymentService({
      baseUrl: waveApiBaseUrl(),
      bearerToken: secrets.bearerToken.trim(),
    });

    const amountStr = String(Math.round(Number(order.total)));
    const session = await wave.createCheckoutSession({
      amount: amountStr,
      currency: (order.currency || "GMD").toUpperCase(),
      success_url: successUrl,
      error_url: errorUrl,
      client_reference: order.id,
    });

    const recordedByUserId = input.recordedByUserId?.trim() || undefined;
    const payment = await prisma.payment.create({
      data: {
        businessId: input.businessId,
        orderId: input.orderId,
        publicCode: await nextPaymentPublicCode(prisma, input.businessId, order.business.name),
        method: PaymentMethod.QR_WALLET,
        provider: PaymentProvider.WAVE_GAMBIA,
        gatewayCode: gateway.code,
        status: PaymentStatus.PENDING,
        amount: order.total,
        currency: order.currency,
        providerRef: session.id,
        publicToken,
        recordedByUserId,
      },
    });

    if (recordedByUserId) {
      await appendActivityLog(prisma, {
        businessId: input.businessId,
        actorUserId: recordedByUserId,
        actorKind: ActivityActorKind.USER,
        eventType: ACTIVITY_EVENT.PAYMENT_WALLET_INITIATED,
        resourceType: "payment",
        resourceId: payment.id,
        metadata: {
          orderId: input.orderId,
          orderPublicCode: order.publicCode,
          paymentPublicCode: payment.publicCode,
          provider: "wave_gambia",
          gatewayCode: gateway.code,
        },
      });
    }

    const launchUrl = session.wave_launch_url;
    return {
      payment,
      qrPayload: launchUrl,
      launchUrl,
      paymentHtml: null,
      checkoutAdapter: adapter,
    };
  }

  const secrets = await getDecryptedGatewaySecrets<YonnaGatewaySecrets>(
    input.businessId,
    codeNorm,
  );
  if (!secrets?.secretKey?.trim() || !secrets?.clientId?.trim()) {
    throw new HttpError(503, "Wallet credentials could not be loaded for this business.");
  }

  const payerPhone = input.payerPhone?.trim() || "";
  if (!payerPhone) {
    throw new HttpError(400, "Wallet phone is required for Yonna checkout.");
  }

  const yonna = new YonnaForexPaymentService({
    baseUrl: yonnaForexApiBaseUrl(),
    secretKey: secrets.secretKey.trim(),
    clientId: secrets.clientId.trim(),
  });

  const countryCode = (process.env.YONNA_FOREX_COUNTRY_CODE || "+220").trim();
  const currencyCode = (order.currency || "GMD").toUpperCase();
  const transactionId = yonna.generateTransactionId();

  const result = await yonna.processPayment({
    amount: Number(order.total),
    phone: payerPhone,
    currency: currencyCode,
    fee: 0,
    transactionId,
    countryCode,
    appTransactionId: order.id,
    description: `Order ${order.publicCode}`,
  });

  if (!result.success) {
    throw new HttpError(400, result.error || result.message || "Wallet checkout failed.");
  }

  const publicToken = genPublicToken();
  const payUrl = result.paymentUrl?.trim();
  const qrPayload = payUrl && payUrl.length > 0 ? payUrl : buildPayUrl(publicToken);

  const recordedByUserIdY = input.recordedByUserId?.trim() || undefined;
  const payment = await prisma.payment.create({
    data: {
      businessId: input.businessId,
      orderId: input.orderId,
      publicCode: await nextPaymentPublicCode(prisma, input.businessId, order.business.name),
      method: PaymentMethod.QR_WALLET,
      provider: PaymentProvider.YONNA_WALLET,
      gatewayCode: gateway.code,
      status: PaymentStatus.PENDING,
      amount: order.total,
      currency: order.currency,
      providerRef: result.transactionId || transactionId,
      publicToken,
      recordedByUserId: recordedByUserIdY,
    },
  });

  if (recordedByUserIdY) {
    await appendActivityLog(prisma, {
      businessId: input.businessId,
      actorUserId: recordedByUserIdY,
      actorKind: ActivityActorKind.USER,
      eventType: ACTIVITY_EVENT.PAYMENT_WALLET_INITIATED,
      resourceType: "payment",
      resourceId: payment.id,
      metadata: {
        orderId: input.orderId,
        orderPublicCode: order.publicCode,
        paymentPublicCode: payment.publicCode,
        provider: "yonna_wallet",
        gatewayCode: gateway.code,
      },
    });
  }

  const launchUrl =
    payUrl && payUrl.length > 0 ? payUrl : result.paymentHtml ? "" : buildPayUrl(publicToken);

  return {
    payment,
    qrPayload,
    launchUrl,
    paymentHtml: result.paymentHtml ?? null,
    checkoutAdapter: adapter,
  };
}

/** Guest / public invoice wallet checkout (no stock; links Payment to SalesInvoice only). */
export async function startGatewayWalletCheckoutForInvoice(input: {
  invoiceId: string;
  businessId: string;
  gatewayCode: string;
  payerPhone?: string;
  req: Request;
}): Promise<GatewayWalletCheckoutResult> {
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: input.invoiceId, businessId: input.businessId },
    include: {
      business: { select: { name: true } },
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!invoice) {
    throw new HttpError(404, "Invoice not found.");
  }
  if (invoice.status !== SalesInvoiceStatus.APPROVED) {
    throw new HttpError(400, "Only approved invoices can be paid online.");
  }
  if (invoice.journalEntryId) {
    throw new HttpError(400, "This invoice is already recorded as paid.");
  }
  if (!invoice.lines.length) {
    throw new HttpError(400, "Invoice has no lines.");
  }

  let total = new Prisma.Decimal(0);
  for (const l of invoice.lines) {
    total = total.add(l.quantity.mul(l.unitAmount).add(l.taxAmount));
  }

  const codeNorm = input.gatewayCode.trim().toLowerCase();
  const wallets = await listOrderCheckoutWallets(input.businessId);
  const pick = wallets.find((w) => w.code === codeNorm);
  if (!pick) {
    throw new HttpError(
      400,
      "This wallet is not configured for checkout. Add credentials under Merchant API.",
    );
  }

  const gateway = await getPaymentGatewayByCode(codeNorm);
  if (!gateway || !gateway.isEnabled) {
    throw new HttpError(400, "This payment gateway is not available.");
  }

  const adapter = gateway.checkoutAdapter?.trim() || "";
  if (adapter === CHECKOUT_ADAPTER_APS_WALLET) {
    throw new HttpError(
      400,
      "APS Wallet uses SMS OTP checkout. Use the invoice APS Wallet authorize and complete endpoints instead of this single-step call.",
    );
  }
  if (adapter !== CHECKOUT_ADAPTER_WAVE_GAMBIA && adapter !== CHECKOUT_ADAPTER_YONNA_WALLET) {
    throw new HttpError(400, "Checkout is not supported for this gateway.");
  }

  await prisma.payment.updateMany({
    where: {
      salesInvoiceId: invoice.id,
      businessId: input.businessId,
      method: PaymentMethod.QR_WALLET,
      status: PaymentStatus.PENDING,
    },
    data: { status: PaymentStatus.CANCELLED },
  });

  const appBase = resolveAppPublicBaseForBrowserReturns(input.req);

  if (adapter === CHECKOUT_ADAPTER_WAVE_GAMBIA) {
    const secrets = await getDecryptedGatewaySecrets<WaveGatewaySecrets>(
      input.businessId,
      codeNorm,
    );
    if (!secrets?.bearerToken?.trim()) {
      throw new HttpError(503, "Wallet credentials could not be loaded for this business.");
    }

    const publicToken = genPublicToken();
    const successUrl = spaHashRoute(appBase, `/pay/${encodeURIComponent(publicToken)}`);
    const errorUrl = spaHashRoute(appBase, `/pay/${encodeURIComponent(publicToken)}?error=1`);

    const wave = new WavePaymentService({
      baseUrl: waveApiBaseUrl(),
      bearerToken: secrets.bearerToken.trim(),
    });

    const amountStr = String(Math.round(Number(total)));
    const session = await wave.createCheckoutSession({
      amount: amountStr,
      currency: (invoice.currency || "GMD").toUpperCase(),
      success_url: successUrl,
      error_url: errorUrl,
      client_reference: invoice.id,
    });

    const payment = await upsertSalesInvoiceWalletPayment(invoice.id, input.businessId, invoice.business.name, {
      total,
      currency: invoice.currency,
      method: PaymentMethod.QR_WALLET,
      provider: PaymentProvider.WAVE_GAMBIA,
      gatewayCode: gateway.code,
      providerRef: session.id,
      publicToken,
    });

    const launchUrl = session.wave_launch_url;
    return {
      payment,
      qrPayload: launchUrl,
      launchUrl,
      paymentHtml: null,
      checkoutAdapter: adapter,
    };
  }

  const secrets = await getDecryptedGatewaySecrets<YonnaGatewaySecrets>(
    input.businessId,
    codeNorm,
  );
  if (!secrets?.secretKey?.trim() || !secrets?.clientId?.trim()) {
    throw new HttpError(503, "Wallet credentials could not be loaded for this business.");
  }

  const payerPhone = input.payerPhone?.trim() || "";
  if (!payerPhone) {
    throw new HttpError(400, "Wallet phone is required for Yonna checkout.");
  }

  const yonna = new YonnaForexPaymentService({
    baseUrl: yonnaForexApiBaseUrl(),
    secretKey: secrets.secretKey.trim(),
    clientId: secrets.clientId.trim(),
  });

  const countryCode = (process.env.YONNA_FOREX_COUNTRY_CODE || "+220").trim();
  const currencyCode = (invoice.currency || "GMD").toUpperCase();
  const transactionId = yonna.generateTransactionId();

  const result = await yonna.processPayment({
    amount: Number(total),
    phone: payerPhone,
    currency: currencyCode,
    fee: 0,
    transactionId,
    countryCode,
    appTransactionId: invoice.id,
    description: `Invoice ${invoice.publicCode}`,
  });

  if (!result.success) {
    throw new HttpError(400, result.error || result.message || "Wallet checkout failed.");
  }

  const publicToken = genPublicToken();
  const payUrl = result.paymentUrl?.trim();
  const qrPayload = payUrl && payUrl.length > 0 ? payUrl : buildPayUrl(publicToken);

  const payment = await upsertSalesInvoiceWalletPayment(invoice.id, input.businessId, invoice.business.name, {
    total,
    currency: invoice.currency,
    method: PaymentMethod.QR_WALLET,
    provider: PaymentProvider.YONNA_WALLET,
    gatewayCode: gateway.code,
    providerRef: result.transactionId || transactionId,
    publicToken,
  });

  const launchUrl =
    payUrl && payUrl.length > 0 ? payUrl : result.paymentHtml ? "" : buildPayUrl(publicToken);

  return {
    payment,
    qrPayload,
    launchUrl,
    paymentHtml: result.paymentHtml ?? null,
    checkoutAdapter: adapter,
  };
}
