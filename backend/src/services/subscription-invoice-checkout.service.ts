import type { Plan, Subscription, SubscriptionInvoice } from "@prisma/client";
import { InvoiceStatus } from "@prisma/client";
import type { Request } from "express";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import {
  cancelPendingInvoicePaymentLedgers,
  createPendingInvoicePaymentLedger,
  createPendingWalletFeeLedgerForSubscriptionCheckout,
} from "./billing-ledger.service.js";
import { waveServiceFromEnv } from "./wave-client-env.js";
import { YonnaForexPaymentService } from "./yonna-forex-payment.service.js";
import { resolveAppPublicBaseForBrowserReturns } from "../config/app-public-url.js";
import {
  CHECKOUT_ADAPTER_APS_WALLET,
  CHECKOUT_ADAPTER_WAVE_GAMBIA,
  CHECKOUT_ADAPTER_YONNA_WALLET,
  getPaymentGatewayByCode,
  listEnabledPaymentGateways,
} from "./payment-gateway.service.js";
import type { OrderCheckoutWalletRow } from "./order-wallet-checkout.service.js";
import { isApsWalletPlatformMerchantConfigured } from "../config/aps-wallet-env.js";
import { yonnaForexApiBaseUrl } from "../config/payment-provider-env.js";

export type SubscriptionInvoiceCheckoutRow = SubscriptionInvoice & {
  plan: Plan;
  subscription: Subscription;
};

function yonnaServiceFromEnv(): YonnaForexPaymentService {
  const baseUrl = yonnaForexApiBaseUrl();
  const secretKey = (process.env.YONNA_FOREX_SECRET_KEY || "").trim();
  const clientId = (process.env.YONNA_FOREX_CLIENT_ID || "").trim();
  if (!secretKey || !clientId) {
    throw new HttpError(
      503,
      "Online checkout is not configured (YONNA_FOREX_SECRET_KEY, YONNA_FOREX_CLIENT_ID).",
    );
  }
  return new YonnaForexPaymentService({ baseUrl, secretKey, clientId });
}

async function assertInvoicePayable(invoice: SubscriptionInvoice): Promise<void> {
  if (invoice.status !== InvoiceStatus.PENDING) {
    throw new HttpError(400, "Only pending invoices can be paid.");
  }
  const amount = Number(invoice.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, "Invalid invoice amount.");
  }
}

/**
 * Shared Wave/Yonna checkout for subscription invoices (authenticated owner or guest link).
 */
export async function runSubscriptionInvoiceGatewayCheckout(input: {
  invoice: SubscriptionInvoiceCheckoutRow;
  gatewayCode: string;
  restrictPayerMobile?: string;
  payerPhone?: string;
  req: Request;
}): Promise<{
  sessionId: string;
  launchUrl: string;
  paymentHtml?: string | null;
  amount: number;
  currency: string;
  paymentStatus: string;
  checkoutStatus: string;
  gatewayCode: string;
}> {
  const code = input.gatewayCode.trim().toLowerCase();
  const gateway = await getPaymentGatewayByCode(code);
  if (!gateway || !gateway.isEnabled) {
    throw new HttpError(400, "This payment gateway is not available.");
  }

  const adapter = gateway.checkoutAdapter?.trim() || "";
  if (adapter === CHECKOUT_ADAPTER_APS_WALLET) {
    throw new HttpError(
      400,
      "APS Wallet checkout uses SMS OTP: authorize, then complete in the billing UI (or guest pay page).",
    );
  }
  if (adapter !== CHECKOUT_ADAPTER_WAVE_GAMBIA && adapter !== CHECKOUT_ADAPTER_YONNA_WALLET) {
    throw new HttpError(
      400,
      "Online checkout is not available for this gateway yet. Add it as a payment method or pay by arrangement.",
    );
  }

  await assertInvoicePayable(input.invoice);
  const invoice = input.invoice;
  const amount = Number(invoice.amount);

  if (adapter === CHECKOUT_ADAPTER_WAVE_GAMBIA) {
    const appBase = resolveAppPublicBaseForBrowserReturns(input.req);
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

    await prisma.$transaction(async (tx) => {
      await cancelPendingInvoicePaymentLedgers(tx, invoice.id);
      await tx.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: {
          checkoutSessionId: session.id,
          checkoutProvider: CHECKOUT_ADAPTER_WAVE_GAMBIA,
        },
      });
      await createPendingInvoicePaymentLedger(tx, {
        businessId: invoice.businessId,
        subscriptionId: invoice.subscriptionId,
        subscriptionInvoiceId: invoice.id,
        amount: invoice.amount,
        currency: invoice.currency || "GMD",
        provider: CHECKOUT_ADAPTER_WAVE_GAMBIA,
        providerCheckoutSessionId: session.id,
        metadata: { waveCheckoutSessionId: session.id },
      });
      await createPendingWalletFeeLedgerForSubscriptionCheckout(tx, {
        businessId: invoice.businessId,
        subscriptionId: invoice.subscriptionId,
        subscriptionInvoiceId: invoice.id,
        grossAmount: invoice.amount,
        currency: invoice.currency || "GMD",
        provider: CHECKOUT_ADAPTER_WAVE_GAMBIA,
        providerCheckoutSessionId: session.id,
      });
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

  const payerPhone = input.payerPhone?.trim();
  if (!payerPhone) {
    throw new HttpError(400, "Wallet phone number is required for Yonna checkout.");
  }

  const countryCode = (process.env.YONNA_FOREX_COUNTRY_CODE || "+220").trim();
  const currencyCode = (invoice.currency || "GMD").toUpperCase();
  const yonna = yonnaServiceFromEnv();
  const finalTransactionId = yonna.generateTransactionId();

  const result = await yonna.processPayment({
    amount,
    phone: payerPhone,
    currency: currencyCode,
    fee: 0,
    transactionId: finalTransactionId,
    countryCode,
    appTransactionId: invoice.id,
    description: `Subscription invoice ${invoice.id}`,
  });

  if (!result.success) {
    throw new HttpError(400, result.error || result.message || "Yonna checkout failed.");
  }

  await prisma.$transaction(async (tx) => {
    await cancelPendingInvoicePaymentLedgers(tx, invoice.id);
    await tx.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: {
        checkoutSessionId: finalTransactionId,
        checkoutProvider: CHECKOUT_ADAPTER_YONNA_WALLET,
      },
    });
    await createPendingInvoicePaymentLedger(tx, {
      businessId: invoice.businessId,
      subscriptionId: invoice.subscriptionId,
      subscriptionInvoiceId: invoice.id,
      amount: invoice.amount,
      currency: invoice.currency || "GMD",
      provider: CHECKOUT_ADAPTER_YONNA_WALLET,
      providerCheckoutSessionId: finalTransactionId,
      metadata: {
        yonnaTransactionId: finalTransactionId,
        appTransactionId: invoice.id,
      },
    });
    await createPendingWalletFeeLedgerForSubscriptionCheckout(tx, {
      businessId: invoice.businessId,
      subscriptionId: invoice.subscriptionId,
      subscriptionInvoiceId: invoice.id,
      grossAmount: invoice.amount,
      currency: invoice.currency || "GMD",
      provider: CHECKOUT_ADAPTER_YONNA_WALLET,
      providerCheckoutSessionId: finalTransactionId,
    });
  });

  return {
    sessionId: finalTransactionId,
    launchUrl: result.paymentHtml ? "" : (result.paymentUrl ?? ""),
    paymentHtml: result.paymentHtml,
    amount,
    currency: currencyCode,
    paymentStatus: result.status,
    checkoutStatus: "open",
    gatewayCode: gateway.code,
  };
}

export async function createSubscriptionInvoiceCheckout(input: {
  gatewayCode: string;
  invoiceId: string;
  businessId: string;
  userId: string;
  restrictPayerMobile?: string;
  /** Required when paying with Yonna wallet (no phone on User model). */
  payerPhone?: string;
  req: Request;
}) {
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

  return runSubscriptionInvoiceGatewayCheckout({
    invoice,
    gatewayCode: input.gatewayCode,
    restrictPayerMobile: input.restrictPayerMobile,
    payerPhone: input.payerPhone,
    req: input.req,
  });
}

/**
 * Gateways available for subscription invoice checkout when credentials come from platform env
 * (Wave bearer, Yonna keys, APS platform merchant) — same path as {@link runSubscriptionInvoiceGatewayCheckout}.
 * Not tied to per-business Merchant API credentials.
 */
export async function listSubscriptionInvoiceCheckoutWallets(): Promise<OrderCheckoutWalletRow[]> {
  const gateways = await listEnabledPaymentGateways();
  const rows: OrderCheckoutWalletRow[] = [];

  for (const g of gateways) {
    const adapter = g.checkoutAdapter?.trim() || "";
    if (adapter === CHECKOUT_ADAPTER_WAVE_GAMBIA) {
      if ((process.env.WAVE_CHECKOUT_BEARER || "").trim()) {
        rows.push({
          gatewayId: g.id,
          code: g.code,
          name: g.name,
          checkoutAdapter: adapter,
          hasStoredPayerPhone: false,
        });
      }
    } else if (adapter === CHECKOUT_ADAPTER_YONNA_WALLET) {
      const secretKey = (process.env.YONNA_FOREX_SECRET_KEY || "").trim();
      const clientId = (process.env.YONNA_FOREX_CLIENT_ID || "").trim();
      if (secretKey && clientId) {
        rows.push({
          gatewayId: g.id,
          code: g.code,
          name: g.name,
          checkoutAdapter: adapter,
          hasStoredPayerPhone: false,
        });
      }
    } else if (adapter === CHECKOUT_ADAPTER_APS_WALLET) {
      if (isApsWalletPlatformMerchantConfigured()) {
        rows.push({
          gatewayId: g.id,
          code: g.code,
          name: g.name,
          checkoutAdapter: adapter,
          hasStoredPayerPhone: false,
        });
      }
    }
  }

  const adapterOrder: Record<string, number> = {
    [CHECKOUT_ADAPTER_WAVE_GAMBIA]: 0,
    [CHECKOUT_ADAPTER_YONNA_WALLET]: 1,
    [CHECKOUT_ADAPTER_APS_WALLET]: 2,
  };
  return rows.sort(
    (a, b) =>
      (adapterOrder[a.checkoutAdapter] ?? 99) - (adapterOrder[b.checkoutAdapter] ?? 99),
  );
}

export async function createSubscriptionInvoiceGuestCheckout(input: {
  guestToken: string;
  gatewayCode: string;
  payerPhone?: string;
  req: Request;
}) {
  const t = input.guestToken?.trim();
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

  return runSubscriptionInvoiceGatewayCheckout({
    invoice,
    gatewayCode: input.gatewayCode,
    payerPhone: input.payerPhone,
    req: input.req,
  });
}
