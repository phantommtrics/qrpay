import crypto from "node:crypto";

import {
  InvoiceStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  type Prisma,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { waveServiceFromEnv } from "./wave-client-env.js";
import { completeSubscriptionInvoicePayment } from "./subscription.service.js";
import { CHECKOUT_ADAPTER_WAVE_GAMBIA } from "./payment-gateway.service.js";
import { cancelPendingInvoicePaymentLedgers } from "./billing-ledger.service.js";
import {
  completeWalletPaymentByPublicToken,
  WAVE_GAMBIA_WEBHOOK_LOG_PROVIDER,
} from "./sale.service.js";

function validateWaveSignature(waveSignature: string, rawBody: string, webhookSecret: string): boolean {
  try {
    const parts = waveSignature.split(",");
    const timestampPart = parts.find((comp) => comp.startsWith("t="));
    const timestamp = timestampPart?.split("=")[1];
    const signatureParts = parts.filter((comp) => comp.startsWith("v1="));
    const signatures = signatureParts.map((s) => s.split("=")[1]);
    const payload = `${timestamp}${rawBody}`;
    const calculatedSignature = crypto.createHmac("sha256", webhookSecret).update(payload).digest("hex");
    return signatures.includes(calculatedSignature);
  } catch {
    return false;
  }
}

function firstString(...vals: Array<unknown>): string | undefined {
  return vals.find((v) => typeof v === "string" && v.length > 0) as string | undefined;
}

type WaveCheckoutWebhookContext = {
  waveSessionId?: string;
  clientReference?: string;
  mapped: "SUCCESS" | "PENDING" | "CANCELLED" | "FAILED";
};

const STATUS_MAP: Record<string, WaveCheckoutWebhookContext["mapped"]> = {
  succeeded: "SUCCESS",
  processing: "PENDING",
  cancelled: "CANCELLED",
  complete: "SUCCESS",
  expired: "FAILED",
  open: "PENDING",
};

async function parseWaveCheckoutWebhook(
  rawBody: string,
  signatureHeader: string,
): Promise<WaveCheckoutWebhookContext> {
  const webhookSecret = process.env.WAVE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("WAVE_WEBHOOK_SECRET not configured");
  }

  if (!signatureHeader || !rawBody) {
    throw new Error("Missing signature or body");
  }

  const valid = validateWaveSignature(signatureHeader, rawBody, webhookSecret);
  if (!valid) {
    throw new Error("Invalid signature");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON body");
  }

  const data = payload.data as Record<string, unknown> | undefined;
  const dataObject = data?.object as Record<string, unknown> | undefined;

  const waveSessionId =
    firstString(
      data?.id,
      dataObject?.id,
      (data as { session?: { id?: string } })?.session?.id,
      payload.checkout_session_id,
      (payload.checkout_session as { id?: string })?.id,
      payload.session_id,
      (payload.session as { id?: string })?.id,
      payload.id,
    ) || undefined;

  const clientReference =
    firstString(
      payload.client_reference,
      payload.clientReference,
      data?.client_reference,
      dataObject?.client_reference,
    ) || undefined;

  let paymentStatus =
    firstString(payload.payment_status, data?.payment_status, dataObject?.payment_status) ||
    undefined;

  let checkoutStatus =
    firstString(payload.checkout_status, data?.checkout_status, dataObject?.checkout_status) ||
    undefined;

  let mapped =
    STATUS_MAP[paymentStatus as string] ||
    STATUS_MAP[checkoutStatus as string] ||
    "PENDING";

  if (!paymentStatus && !checkoutStatus && waveSessionId && mapped === "PENDING") {
    try {
      const waveApi = waveServiceFromEnv();
      const session = await waveApi.getCheckoutSession(waveSessionId);
      paymentStatus = session?.payment_status || paymentStatus;
      checkoutStatus = session?.checkout_status || checkoutStatus;
      mapped =
        STATUS_MAP[paymentStatus as string] ||
        STATUS_MAP[checkoutStatus as string] ||
        "PENDING";
    } catch {
      // keep mapped
    }
  }

  return { waveSessionId, clientReference, mapped };
}

async function handleWaveSubscriptionCheckoutWebhook(
  ctx: WaveCheckoutWebhookContext,
): Promise<boolean> {
  const { waveSessionId, clientReference, mapped } = ctx;

  const orClause: Array<{ id: string } | { checkoutSessionId: string }> = [];
  if (clientReference) {
    orClause.push({ id: clientReference });
  }
  if (waveSessionId) {
    orClause.push({ checkoutSessionId: waveSessionId });
  }
  if (orClause.length === 0) {
    return false;
  }

  const invoice = await prisma.subscriptionInvoice.findFirst({
    where: {
      OR: orClause,
      status: InvoiceStatus.PENDING,
    },
  });

  if (!invoice) {
    return false;
  }

  if (invoice.checkoutProvider && invoice.checkoutProvider !== CHECKOUT_ADAPTER_WAVE_GAMBIA) {
    return true;
  }

  if (mapped === "PENDING") {
    return true;
  }

  if (mapped === "CANCELLED" || mapped === "FAILED") {
    await prisma.$transaction((tx) => cancelPendingInvoicePaymentLedgers(tx, invoice.id));
    return true;
  }

  if (mapped !== "SUCCESS") {
    return false;
  }

  const sessionRef = waveSessionId || invoice.checkoutSessionId || undefined;

  await completeSubscriptionInvoicePayment({
    invoiceId: invoice.id,
    provider: invoice.checkoutProvider || CHECKOUT_ADAPTER_WAVE_GAMBIA,
    providerCheckoutSessionId: sessionRef,
    metadata: { source: "wave_webhook" },
  });

  return true;
}

async function findPendingWaveMerchantPayment(ctx: WaveCheckoutWebhookContext) {
  const { waveSessionId, clientReference } = ctx;
  const or: Prisma.PaymentWhereInput[] = [];
  if (waveSessionId) {
    or.push({ providerRef: waveSessionId });
  }
  if (clientReference) {
    or.push({ orderId: clientReference });
    or.push({ salesInvoiceId: clientReference });
  }
  if (or.length === 0) {
    return null;
  }

  return prisma.payment.findFirst({
    where: {
      method: PaymentMethod.QR_WALLET,
      provider: PaymentProvider.WAVE_GAMBIA,
      status: PaymentStatus.PENDING,
      OR: or,
    },
    orderBy: { createdAt: "desc" },
  });
}

async function handleWaveMerchantWalletCheckoutWebhook(ctx: WaveCheckoutWebhookContext): Promise<void> {
  const payment = await findPendingWaveMerchantPayment(ctx);
  if (!payment) {
    return;
  }

  const { mapped, waveSessionId } = ctx;

  if (mapped === "PENDING") {
    return;
  }

  if (mapped === "CANCELLED" || mapped === "FAILED") {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING },
      data: {
        status: mapped === "CANCELLED" ? PaymentStatus.CANCELLED : PaymentStatus.FAILED,
      },
    });
    return;
  }

  if (mapped !== "SUCCESS") {
    return;
  }

  const externalEventId = waveSessionId
    ? `wave:session:${waveSessionId}`
    : `wave:payment:${payment.id}`;

  await completeWalletPaymentByPublicToken(payment.publicToken, {
    externalEventId,
    settlementSource: "webhook",
    webhookLogProvider: WAVE_GAMBIA_WEBHOOK_LOG_PROVIDER,
  });
}

/**
 * Wave checkout webhook: subscription billing invoices and merchant POS / sales-invoice wallet payments.
 */
export async function processWaveSubscriptionWebhook(rawBody: string, signatureHeader: string): Promise<void> {
  const ctx = await parseWaveCheckoutWebhook(rawBody, signatureHeader);
  const subscriptionHandled = await handleWaveSubscriptionCheckoutWebhook(ctx);
  if (subscriptionHandled) {
    return;
  }
  await handleWaveMerchantWalletCheckoutWebhook(ctx);
}
