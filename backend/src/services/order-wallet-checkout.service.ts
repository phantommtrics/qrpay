import { randomBytes } from "node:crypto";
import type { Request } from "express";
import type { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import {
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from "../lib/prisma-sales-enums.js";
import { resolveAppPublicBaseForBrowserReturns } from "../config/app-public-url.js";
import { waveApiBaseUrl, yonnaForexApiBaseUrl } from "../config/payment-provider-env.js";
import { WavePaymentService } from "./wave-payment.service.js";
import { YonnaForexPaymentService } from "./yonna-forex-payment.service.js";
import {
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

async function nextPaymentPublicCode(
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

function getPublicWebAppBaseUrl(): string {
  const raw =
    process.env.PUBLIC_WEB_APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  return raw.replace(/\/$/, "");
}

function buildPayUrl(publicToken: string): string {
  return `${getPublicWebAppBaseUrl()}/pay/${publicToken}`;
}

export type OrderCheckoutWalletRow = {
  gatewayId: string;
  code: string;
  name: string;
  checkoutAdapter: string;
  /** Yonna: encrypted credentials include a default payer phone — Orders UI can skip manual entry. */
  hasStoredPayerPhone: boolean;
};

export async function listOrderCheckoutWallets(businessId: string): Promise<OrderCheckoutWalletRow[]> {
  const rows = await listBusinessGatewayCredentialStatus(businessId);
  return rows
    .filter((r) => r.checkoutConfigured)
    .map((r) => {
      const adapter = (r.checkoutAdapter || "").trim();
      const hasStoredPayerPhone =
        adapter === CHECKOUT_ADAPTER_YONNA_WALLET &&
        Boolean(r.fieldStatus?.defaultPayerPhone);
      return {
        gatewayId: r.gatewayId,
        code: r.code,
        name: r.name,
        checkoutAdapter: adapter,
        hasStoredPayerPhone,
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
    const successUrl = `${appBase}/pay/${encodeURIComponent(publicToken)}`;
    const errorUrl = `${appBase}/pay/${encodeURIComponent(publicToken)}?error=1`;

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
      },
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

  const payerPhone =
    input.payerPhone?.trim() || secrets.defaultPayerPhone?.trim() || "";
  if (!payerPhone) {
    throw new HttpError(
      400,
      "Wallet phone is required. Save a default number under Merchant API for Yonna, or send payerPhone with the request.",
    );
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
    },
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
