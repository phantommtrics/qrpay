import crypto from "node:crypto";

import { InvoiceStatus } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { WavePaymentService } from "./wave-payment.service.js";
import { completeSubscriptionInvoicePayment } from "./subscription.service.js";
import { CHECKOUT_ADAPTER_WAVE_GAMBIA } from "./payment-gateway.service.js";

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

export async function processWaveSubscriptionWebhook(rawBody: string, signatureHeader: string): Promise<void> {
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
  const waveSessionId =
    firstString(
      (payload?.data as Record<string, unknown>)?.id as string,
      (payload?.data as { object?: { id?: string } })?.object?.id,
      (payload?.data as { session?: { id?: string } })?.session?.id,
      payload?.checkout_session_id as string,
      (payload?.checkout_session as { id?: string })?.id,
      payload?.session_id as string,
      (payload?.session as { id?: string })?.id,
      payload?.id as string,
    ) || undefined;

  const clientReference =
    firstString(
      payload?.client_reference as string,
      payload?.clientReference as string,
      (payload?.data as { client_reference?: string })?.client_reference,
      (payload?.data as { object?: { client_reference?: string } })?.object?.client_reference,
    ) || undefined;

  let paymentStatus =
    firstString(
      payload?.payment_status as string,
      (payload?.data as { payment_status?: string })?.payment_status,
      (payload?.data as { object?: { payment_status?: string } })?.object?.payment_status,
    ) || undefined;

  let checkoutStatus =
    firstString(
      payload?.checkout_status as string,
      (payload?.data as { checkout_status?: string })?.checkout_status,
      (payload?.data as { object?: { checkout_status?: string } })?.object?.checkout_status,
    ) || undefined;

  const statusMap: Record<string, string> = {
    succeeded: "SUCCESS",
    processing: "PENDING",
    cancelled: "CANCELLED",
    complete: "SUCCESS",
    expired: "FAILED",
    open: "PENDING",
  };

  let mapped =
    statusMap[paymentStatus as string] ||
    statusMap[checkoutStatus as string] ||
    "PENDING";

  if ((!paymentStatus && !checkoutStatus) && waveSessionId && mapped === "PENDING") {
    try {
      const baseUrl = process.env.WAVE_API_BASE_URL || "https://api.wave.com";
      const bearer = process.env.WAVE_CHECKOUT_BEARER;
      if (bearer) {
        const waveApi = new WavePaymentService({ baseUrl, bearerToken: bearer });
        const session = await waveApi.getCheckoutSession(waveSessionId);
        paymentStatus = session?.payment_status || paymentStatus;
        checkoutStatus = session?.checkout_status || checkoutStatus;
        mapped =
          statusMap[paymentStatus as string] ||
          statusMap[checkoutStatus as string] ||
          "PENDING";
      }
    } catch {
      // keep mapped
    }
  }

  if (mapped !== "SUCCESS") {
    return;
  }

  const orClause: Array<{ id: string } | { checkoutSessionId: string }> = [];
  if (clientReference) {
    orClause.push({ id: clientReference });
  }
  if (waveSessionId) {
    orClause.push({ checkoutSessionId: waveSessionId });
  }
  if (orClause.length === 0) {
    return;
  }

  const invoice = await prisma.subscriptionInvoice.findFirst({
    where: {
      OR: orClause,
      status: InvoiceStatus.PENDING,
    },
  });

  if (!invoice) {
    return;
  }

  if (invoice.checkoutProvider && invoice.checkoutProvider !== CHECKOUT_ADAPTER_WAVE_GAMBIA) {
    return;
  }

  const sessionRef = waveSessionId || invoice.checkoutSessionId || undefined;

  await completeSubscriptionInvoicePayment({
    invoiceId: invoice.id,
    provider: invoice.checkoutProvider || CHECKOUT_ADAPTER_WAVE_GAMBIA,
    providerCheckoutSessionId: sessionRef,
    metadata: { source: "wave_webhook" },
  });
}
