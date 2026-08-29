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
import { yonnaForexApiBaseUrl } from "../config/payment-provider-env.js";
import { waveServiceFromBearer, waveServiceFromEnv } from "./wave-client-env.js";
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
  waveOwnAccountBearer,
  type WaveGatewaySecrets,
  type YonnaGatewaySecrets,
} from "./business-gateway-credential.service.js";
import { ACTIVITY_EVENT, appendActivityLog } from "./activity-log.service.js";
import { queueInternalPartnerPaymentCancelledForPaymentIds } from "./internal-partner-webhook-queue.service.js";

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

function waveClientForSalesSecrets(secrets: WaveGatewaySecrets | null) {
  const ownBearer = waveOwnAccountBearer(secrets);
  if (ownBearer) {
    return { wave: waveServiceFromBearer(ownBearer), aggregatedMerchantId: undefined as string | undefined };
  }
  const aggregatedMerchantId = secrets?.aggregatedMerchantId?.trim();
  if (!aggregatedMerchantId) {
    throw new HttpError(503, "Wave checkout is not provisioned for this business.");
  }
  return { wave: waveServiceFromEnv(), aggregatedMerchantId };
}

/**
 * `Payment.salesInvoiceId` is @unique — only one row per invoice. Reuse/update it on retries
 * (e.g. switch Wave → Yonna, or a new APS authorize after a failed/cancelled attempt) instead of inserting again.
 */
export async function upsertSalesInvoiceWalletPayment(
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

type GatewayCredentialStatusPack = Awaited<
  ReturnType<typeof listBusinessGatewayCredentialStatus>
>;

function mapGatewayStatusToWalletRows(
  rows: GatewayCredentialStatusPack["credentialStatus"],
): OrderCheckoutWalletRow[] {
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

export async function listOrderCheckoutWallets(businessId: string): Promise<OrderCheckoutWalletRow[]> {
  const pack = await listBusinessGatewayCredentialStatus(businessId);
  return mapGatewayStatusToWalletRows(pack.credentialStatus);
}

/**
 * Single pass over gateway + credential rows (for partner diagnostics without a second query).
 */
export async function listOrderCheckoutWalletsWithGatewayStatus(businessId: string): Promise<{
  wallets: OrderCheckoutWalletRow[];
  gatewayStatus: GatewayCredentialStatusPack["credentialStatus"];
  platformWaveConfigured: boolean;
}> {
  const pack = await listBusinessGatewayCredentialStatus(businessId);
  return {
    wallets: mapGatewayStatusToWalletRows(pack.credentialStatus),
    gatewayStatus: pack.credentialStatus,
    platformWaveConfigured: pack.platformWaveConfigured,
  };
}

/**
 * Non-secret hint when `wallets` is empty — explains common misconfigurations (incomplete secrets, APS env, disabled gateways).
 */
export function partnerCheckoutWalletsReadinessHint(
  gatewayStatus: GatewayCredentialStatusPack["credentialStatus"],
  walletCount: number,
): string | null {
  if (walletCount > 0) {
    return null;
  }
  const partial = gatewayStatus.filter((r) => r.hasCredential && !r.checkoutConfigured);
  if (partial.length > 0) {
    return (
      "Credentials exist but checkout is not ready yet. Inspect gatewayStatus[].fieldStatus — e.g. Wave needs a stored own-account API key (fieldStatus.ownAccountBearer) or aggregated merchant plus platform WAVE_CHECKOUT_BEARER; " +
      "Yonna needs clientId+secretKey; APS needs username+password and APS_WALLET_BASE_URL on the Easypay server. " +
      "If secrets were saved under a different Easypay environment, decryption may fail after APP_SECRET_ENCRYPTION_KEY changes."
    );
  }
  if (gatewayStatus.length === 0) {
    return "No enabled payment gateways have a checkout adapter on Easypay. Enable Wave / Yonna / APS under Platform → Payment gateways.";
  }
  if (gatewayStatus.every((r) => !r.hasCredential)) {
    return "No gateway credentials are saved for this business. Add APS / Wave / Yonna under Merchant API for this business.";
  }
  return null;
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

  const replacedWalletPaymentIds = (
    await prisma.payment.findMany({
      where: {
        orderId: input.orderId,
        businessId: input.businessId,
        method: PaymentMethod.QR_WALLET,
        status: PaymentStatus.PENDING,
      },
      select: { id: true },
    })
  ).map((r) => r.id);

  await prisma.payment.updateMany({
    where: {
      orderId: input.orderId,
      businessId: input.businessId,
      method: PaymentMethod.QR_WALLET,
      status: PaymentStatus.PENDING,
    },
    data: { status: PaymentStatus.CANCELLED },
  });

  if (replacedWalletPaymentIds.length > 0) {
    void queueInternalPartnerPaymentCancelledForPaymentIds(
      replacedWalletPaymentIds,
      "wallet_checkout_replaced",
    ).catch((err) => {
      console.error("[internal-partner] Failed to queue cancel webhook:", err);
    });
  }

  const appBase = resolveAppPublicBaseForBrowserReturns(input.req);

  if (adapter === CHECKOUT_ADAPTER_WAVE_GAMBIA) {
    const secrets = await getDecryptedGatewaySecrets<WaveGatewaySecrets>(
      input.businessId,
      codeNorm,
    );
    const { wave, aggregatedMerchantId } = waveClientForSalesSecrets(secrets);

    const publicToken = genPublicToken();
    const successUrl = spaHashRoute(appBase, `/pay/${encodeURIComponent(publicToken)}`);
    const errorUrl = spaHashRoute(appBase, `/pay/${encodeURIComponent(publicToken)}?error=1`);

    const amountStr = String(Math.round(Number(order.total)));
    const session = await wave.createSalesCheckoutSession({
      amount: amountStr,
      currency: (order.currency || "GMD").toUpperCase(),
      success_url: successUrl,
      error_url: errorUrl,
      client_reference: order.id,
      aggregated_merchant_id: aggregatedMerchantId,
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
    const { wave, aggregatedMerchantId } = waveClientForSalesSecrets(secrets);

    const publicToken = genPublicToken();
    const successUrl = spaHashRoute(appBase, `/pay/${encodeURIComponent(publicToken)}`);
    const errorUrl = spaHashRoute(appBase, `/pay/${encodeURIComponent(publicToken)}?error=1`);

    const amountStr = String(Math.round(Number(total)));
    const session = await wave.createSalesCheckoutSession({
      amount: amountStr,
      currency: (invoice.currency || "GMD").toUpperCase(),
      success_url: successUrl,
      error_url: errorUrl,
      client_reference: invoice.id,
      aggregated_merchant_id: aggregatedMerchantId,
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
