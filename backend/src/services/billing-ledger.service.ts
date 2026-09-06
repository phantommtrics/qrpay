import {
  BillingLedgerDirection,
  BillingLedgerEntryType,
  BillingLedgerStatus,
  Prisma,
} from "@prisma/client";

import {
  subscriptionCheckoutWaveWalletFeeRate,
  subscriptionCheckoutYonnaWalletFeeRate,
} from "../config/subscription-checkout-wallet-fee-env.js";
import {
  postPlatformJournalForPendingCheckoutLedger,
  removePlatformJournalForPendingCheckoutLedger,
} from "./platform-subscription-journal.service.js";
import { CHECKOUT_ADAPTER_WAVE_GAMBIA, CHECKOUT_ADAPTER_YONNA_WALLET } from "./payment-gateway.service.js";
import { computeWalletFeeAmount } from "./merchant-pos-wallet-fee-resolution.service.js";

/** Gross × configured wallet-fee rate. Wave uses whole-GMD rounding. */
export function subscriptionCheckoutPendingWalletFeeAmount(
  provider: string,
  grossAmount: Prisma.Decimal,
): Prisma.Decimal {
  const rate =
    provider === CHECKOUT_ADAPTER_WAVE_GAMBIA
      ? subscriptionCheckoutWaveWalletFeeRate()
      : provider === CHECKOUT_ADAPTER_YONNA_WALLET
        ? subscriptionCheckoutYonnaWalletFeeRate()
        : new Prisma.Decimal(0);
  return computeWalletFeeAmount(grossAmount, rate, provider);
}

/**
 * Cancels pending subscription checkout billing rows: invoice payment (and its pending GL) plus wallet-fee pending.
 */
export async function cancelPendingInvoicePaymentLedgers(
  tx: Prisma.TransactionClient,
  subscriptionInvoiceId: string,
): Promise<void> {
  const pendingRows = await tx.billingLedgerEntry.findMany({
    where: {
      subscriptionInvoiceId,
      type: BillingLedgerEntryType.INVOICE_PAYMENT,
      status: BillingLedgerStatus.PENDING,
    },
    select: { id: true },
  });
  for (const row of pendingRows) {
    await removePlatformJournalForPendingCheckoutLedger(tx, row.id);
  }
  await tx.billingLedgerEntry.updateMany({
    where: {
      subscriptionInvoiceId,
      type: BillingLedgerEntryType.INVOICE_PAYMENT,
      status: BillingLedgerStatus.PENDING,
    },
    data: { status: BillingLedgerStatus.CANCELLED },
  });

  await tx.billingLedgerEntry.updateMany({
    where: {
      subscriptionInvoiceId,
      type: BillingLedgerEntryType.WALLET_FEE,
      status: BillingLedgerStatus.PENDING,
    },
    data: { status: BillingLedgerStatus.CANCELLED },
  });
}

export async function createPendingInvoicePaymentLedger(
  tx: Prisma.TransactionClient,
  input: {
    businessId: string;
    subscriptionId: string;
    subscriptionInvoiceId: string;
    amount: Prisma.Decimal;
    currency: string;
    provider: string;
    providerCheckoutSessionId: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  const row = await tx.billingLedgerEntry.create({
    data: {
      businessId: input.businessId,
      subscriptionId: input.subscriptionId,
      subscriptionInvoiceId: input.subscriptionInvoiceId,
      type: BillingLedgerEntryType.INVOICE_PAYMENT,
      direction: BillingLedgerDirection.MONEY_IN,
      status: BillingLedgerStatus.PENDING,
      amount: input.amount,
      currency: input.currency,
      provider: input.provider,
      providerCheckoutSessionId: input.providerCheckoutSessionId,
      metadata: input.metadata ?? undefined,
    },
  });

  await postPlatformJournalForPendingCheckoutLedger(tx, {
    id: row.id,
    businessId: row.businessId,
    subscriptionInvoiceId: row.subscriptionInvoiceId,
    amount: row.amount,
    currency: row.currency,
  });

  return row;
}

/**
 * Pending wallet-fee row for the same checkout session as {@link createPendingInvoicePaymentLedger}.
 * No platform GL until the payment succeeds (paired with invoice payment webhook).
 */
export async function createPendingWalletFeeLedgerForSubscriptionCheckout(
  tx: Prisma.TransactionClient,
  input: {
    businessId: string;
    subscriptionId: string;
    subscriptionInvoiceId: string;
    grossAmount: Prisma.Decimal;
    currency: string;
    provider: string;
    providerCheckoutSessionId: string;
  },
): Promise<void> {
  const feeAmount = subscriptionCheckoutPendingWalletFeeAmount(input.provider, input.grossAmount);
  const rate =
    input.provider === CHECKOUT_ADAPTER_WAVE_GAMBIA
      ? subscriptionCheckoutWaveWalletFeeRate()
      : input.provider === CHECKOUT_ADAPTER_YONNA_WALLET
        ? subscriptionCheckoutYonnaWalletFeeRate()
        : new Prisma.Decimal(0);

  await tx.billingLedgerEntry.create({
    data: {
      businessId: input.businessId,
      subscriptionId: input.subscriptionId,
      subscriptionInvoiceId: input.subscriptionInvoiceId,
      type: BillingLedgerEntryType.WALLET_FEE,
      direction: BillingLedgerDirection.MONEY_OUT,
      status: BillingLedgerStatus.PENDING,
      amount: feeAmount,
      currency: input.currency,
      provider: input.provider,
      providerCheckoutSessionId: input.providerCheckoutSessionId,
      metadata: {
        phase: "pending_checkout",
        basis: "subscription_invoice_gross",
        rate: rate.toString(),
        rail: input.provider,
      } as Prisma.InputJsonValue,
    },
  });
}
