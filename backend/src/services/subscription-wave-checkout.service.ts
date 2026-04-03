import { InvoiceStatus } from "@prisma/client";
import type { Request } from "express";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { WavePaymentService } from "./wave-payment.service.js";
import {
  CHECKOUT_ADAPTER_WAVE_GAMBIA,
  getPaymentGatewayByCode,
} from "./payment-gateway.service.js";

function waveServiceFromEnv(): WavePaymentService {
  const baseUrl = process.env.WAVE_API_BASE_URL || "https://api.wave.com";
  const bearer = process.env.WAVE_CHECKOUT_BEARER;
  if (!bearer) {
    throw new HttpError(503, "Online checkout is not configured (WAVE_CHECKOUT_BEARER).");
  }
  return new WavePaymentService({ baseUrl, bearerToken: bearer });
}

function publicAppBase(req: Request): string {
  const rawBase =
    process.env.APP_PUBLIC_BASE_URL ||
    (req.headers.origin as string) ||
    process.env.CLIENT_BASE_URL ||
    process.env.WEB_APP_URL ||
    process.env.FRONTEND_BASE_URL ||
    "";
  let appBase = rawBase ? rawBase.replace(/\/$/, "") : "";
  if (appBase.startsWith("http://")) {
    appBase = appBase.replace("http://", "https://");
  }
  if (!appBase || !appBase.startsWith("https://")) {
    throw new HttpError(
      500,
      "APP_PUBLIC_BASE_URL must be set to a public HTTPS origin for payment return URLs.",
    );
  }
  return appBase;
}

/**
 * Start hosted checkout for a subscription invoice using an enabled gateway.
 * Currently supports checkoutAdapter `wave_gambia` (Wave API).
 */
export async function createSubscriptionInvoiceCheckout(input: {
  gatewayCode: string;
  invoiceId: string;
  businessId: string;
  userId: string;
  restrictPayerMobile?: string;
  req: Request;
}) {
  const code = input.gatewayCode.trim().toLowerCase();
  const gateway = await getPaymentGatewayByCode(code);
  if (!gateway || !gateway.isEnabled) {
    throw new HttpError(400, "This payment gateway is not available.");
  }

  if (gateway.checkoutAdapter !== CHECKOUT_ADAPTER_WAVE_GAMBIA) {
    throw new HttpError(
      400,
      "Online checkout is not available for this gateway yet. Add it as a payment method or pay by arrangement.",
    );
  }

  const membership = await prisma.businessMembership.findFirst({
    where: { userId: input.userId, businessId: input.businessId },
  });
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  const isPlatform = user?.role === "PLATFORM_OWNER" || user?.role === "PLATFORM_ADMIN";
  if (!membership?.isOwner && !isPlatform) {
    throw new HttpError(403, "Only the business owner can pay subscription invoices.");
  }

  const invoice = await prisma.subscriptionInvoice.findFirst({
    where: {
      id: input.invoiceId,
      businessId: input.businessId,
    },
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

  const appBase = publicAppBase(input.req);
  const successUrl = `${appBase}/billing/wave/success?invoiceId=${encodeURIComponent(invoice.id)}`;
  const errorUrl = `${appBase}/billing/wave/cancel?invoiceId=${encodeURIComponent(invoice.id)}`;

  const wave = waveServiceFromEnv();
  const session = await wave.createCheckoutSession({
    amount: String(Math.round(amount)),
    currency: (invoice.currency || "GMD").toUpperCase(),
    success_url: successUrl,
    error_url: errorUrl,
    client_reference: invoice.id,
    ...(input.restrictPayerMobile
      ? { restrict_payer_mobile: String(input.restrictPayerMobile) }
      : {}),
  });

  await prisma.subscriptionInvoice.update({
    where: { id: invoice.id },
    data: {
      checkoutSessionId: session.id,
      checkoutProvider: CHECKOUT_ADAPTER_WAVE_GAMBIA,
    },
  });

  return {
    sessionId: session.id,
    launchUrl: session.wave_launch_url,
    amount: Number(session.amount),
    currency: session.currency,
    paymentStatus: session.payment_status,
    checkoutStatus: session.checkout_status,
    gatewayCode: gateway.code,
  };
}
