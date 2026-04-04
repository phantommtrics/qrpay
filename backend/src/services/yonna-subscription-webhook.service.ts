import crypto from "node:crypto";

import { InvoiceStatus } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { CHECKOUT_ADAPTER_YONNA_WALLET } from "./payment-gateway.service.js";
import { completeSubscriptionInvoicePayment } from "./subscription.service.js";

export type YonnaForexWebhookPayload = {
  appTransactionId?: string;
  status?: string;
  amount?: number;
  currency?: string;
  phoneNumber?: string;
  timestamp?: string | number;
  message?: string;
  error?: string;
  transactionId?: string;
  reference?: string;
  signature?: string;
};

function unwrapPayload(body: unknown): YonnaForexWebhookPayload {
  let incoming: unknown = body;
  if (Buffer.isBuffer(incoming)) {
    const raw = incoming.toString("utf8");
    try {
      incoming = JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
  }
  if (typeof incoming === "string") {
    try {
      incoming = JSON.parse(incoming) as unknown;
    } catch {
      return {};
    }
  }
  if (incoming && typeof incoming === "object") {
    const o = incoming as Record<string, unknown>;
    const nested = o.payload ?? o.data;
    if (nested) {
      if (typeof nested === "string") {
        try {
          incoming = JSON.parse(nested) as unknown;
        } catch {
          incoming = nested;
        }
      } else {
        incoming = nested;
      }
    }
  }
  return (incoming as YonnaForexWebhookPayload) || {};
}

function verifyWebhookSignature(payload: YonnaForexWebhookPayload, signatureHeader: string | undefined): boolean {
  const secret = process.env.YONNA_FOREX_WEBHOOK_SECRET?.trim();
  if (!secret || !signatureHeader) {
    return false;
  }
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
  return signatureHeader === `sha256=${expectedSignature}`;
}

/**
 * Yonna Forex → subscription invoice completion (same role as Wave webhook).
 * Idempotent via completeSubscriptionInvoicePayment.
 */
export async function processYonnaSubscriptionWebhook(
  body: unknown,
  signatureHeader: string | undefined,
): Promise<void> {
  const secret = process.env.YONNA_FOREX_WEBHOOK_SECRET?.trim();
  const payload = unwrapPayload(body);

  if (secret) {
    const ok = verifyWebhookSignature(payload, signatureHeader);
    if (!ok) {
      throw new Error("Invalid Yonna webhook signature");
    }
  }

  const appTransactionId = payload.appTransactionId?.trim();
  if (!appTransactionId || !payload.status) {
    throw new Error("Missing appTransactionId or status");
  }

  const normalized = String(payload.status).toLowerCase();
  if (normalized !== "success" && normalized !== "completed") {
    return;
  }

  const providerTxn =
    (typeof payload.transactionId === "string" && payload.transactionId) ||
    (typeof payload.reference === "string" && payload.reference) ||
    undefined;

  const invoice = await prisma.subscriptionInvoice.findFirst({
    where: {
      status: InvoiceStatus.PENDING,
      checkoutProvider: CHECKOUT_ADAPTER_YONNA_WALLET,
      OR: [{ id: appTransactionId }, ...(providerTxn ? [{ checkoutSessionId: providerTxn }] : [])],
    },
  });

  if (!invoice) {
    return;
  }

  await completeSubscriptionInvoicePayment({
    invoiceId: invoice.id,
    provider: invoice.checkoutProvider || CHECKOUT_ADAPTER_YONNA_WALLET,
    providerCheckoutSessionId: invoice.checkoutSessionId || providerTxn || undefined,
    providerPaymentRef: providerTxn || undefined,
    metadata: { source: "yonna_webhook", yonnaStatus: payload.status },
  });
}
