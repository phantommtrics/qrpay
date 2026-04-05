import {
  BillingLedgerDirection,
  BillingLedgerEntryType,
  BillingLedgerStatus,
  InvoiceStatus,
  PlatformJournalSourceType,
  Prisma,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import {
  ensureDefaultPlatformChartAccounts,
  PLATFORM_CHART_DEFERRED_SUBSCRIPTION_REVENUE,
  PLATFORM_CHART_SUBSCRIPTION_AR_PENDING,
  PLATFORM_CHART_SUBSCRIPTION_CLEARING,
  PLATFORM_CHART_SUBSCRIPTION_REFUNDS,
  PLATFORM_CHART_SUBSCRIPTION_REVENUE,
  PLATFORM_CHART_WALLET_FEES_SUBSCRIPTIONS,
} from "./platform-chart-of-accounts.service.js";
import {
  subscriptionCheckoutWaveWalletFeeRate,
  subscriptionCheckoutYonnaWalletFeeRate,
} from "../config/subscription-checkout-wallet-fee-env.js";
import { CHECKOUT_ADAPTER_WAVE_GAMBIA, CHECKOUT_ADAPTER_YONNA_WALLET } from "./payment-gateway.service.js";

type Tx = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * When a subscription checkout session opens: Dr receivable (pending) · Cr deferred revenue.
 * Idempotent per billing ledger row.
 */
export async function postPlatformJournalForPendingCheckoutLedger(
  tx: Tx,
  ledger: {
    id: string;
    businessId: string;
    subscriptionInvoiceId: string | null;
    amount: Prisma.Decimal;
    currency: string;
  },
): Promise<void> {
  await ensureDefaultPlatformChartAccounts(tx);

  const existing = await tx.platformJournalEntry.findFirst({
    where: {
      sourceType: PlatformJournalSourceType.SUBSCRIPTION_CHECKOUT_PENDING,
      sourceId: ledger.id,
    },
  });
  if (existing) {
    return;
  }

  if (!ledger.subscriptionInvoiceId) {
    return;
  }

  const [ar, deferred, business] = await Promise.all([
    tx.platformChartOfAccount.findUnique({ where: { code: PLATFORM_CHART_SUBSCRIPTION_AR_PENDING } }),
    tx.platformChartOfAccount.findUnique({
      where: { code: PLATFORM_CHART_DEFERRED_SUBSCRIPTION_REVENUE },
    }),
    tx.business.findUnique({
      where: { id: ledger.businessId },
      select: { name: true },
    }),
  ]);

  if (!ar || !deferred) {
    throw new Error("Platform chart accounts missing for subscription checkout pending.");
  }

  const amt = ledger.amount;
  const label = business?.name ?? ledger.businessId;

  await tx.platformJournalEntry.create({
    data: {
      postedAt: new Date(),
      memo: `Subscription checkout pending — ${label} (${ledger.currency})`,
      reference: ledger.subscriptionInvoiceId,
      sourceType: PlatformJournalSourceType.SUBSCRIPTION_CHECKOUT_PENDING,
      sourceId: ledger.id,
      lines: {
        create: [
          {
            chartOfAccountId: ar.id,
            debitAmount: amt,
            creditAmount: new Prisma.Decimal(0),
            description: "Receivable — subscription payment in progress",
          },
          {
            chartOfAccountId: deferred.id,
            debitAmount: new Prisma.Decimal(0),
            creditAmount: amt,
            description: "Deferred revenue until checkout completes",
          },
        ],
      },
    },
  });
}

/** Remove pending-checkout GL when the billing ledger row is cancelled (new checkout, plan change, etc.). */
export async function removePlatformJournalForPendingCheckoutLedger(tx: Tx, billingLedgerId: string): Promise<void> {
  await tx.platformJournalEntry.deleteMany({
    where: {
      sourceType: PlatformJournalSourceType.SUBSCRIPTION_CHECKOUT_PENDING,
      sourceId: billingLedgerId,
    },
  });
}

/**
 * Idempotent GL when a merchant subscription invoice is paid.
 * - If checkout pending GL exists for the succeeded ledger: Dr clearing · Cr AR · Dr deferred · Cr revenue.
 * - Else (dev pay, legacy): Dr clearing · Cr revenue.
 */
export async function postPlatformJournalForPaidSubscriptionInvoice(
  tx: Tx,
  invoice: {
    id: string;
    businessId: string;
    amount: Prisma.Decimal;
    currency: string;
  },
): Promise<void> {
  await ensureDefaultPlatformChartAccounts(tx);

  const existingClassic = await tx.platformJournalEntry.findFirst({
    where: {
      sourceType: PlatformJournalSourceType.SUBSCRIPTION_INVOICE_PAYMENT,
      sourceId: invoice.id,
    },
  });
  const existingSettlement = await tx.platformJournalEntry.findFirst({
    where: {
      sourceType: PlatformJournalSourceType.SUBSCRIPTION_CHECKOUT_SETTLEMENT,
      sourceId: invoice.id,
    },
  });
  if (existingClassic || existingSettlement) {
    return;
  }

  const settledLedger = await tx.billingLedgerEntry.findFirst({
    where: {
      subscriptionInvoiceId: invoice.id,
      type: BillingLedgerEntryType.INVOICE_PAYMENT,
      status: BillingLedgerStatus.SUCCEEDED,
    },
    orderBy: [{ succeededAt: "desc" }, { createdAt: "desc" }],
  });

  const pendingGl =
    settledLedger &&
    (await tx.platformJournalEntry.findFirst({
      where: {
        sourceType: PlatformJournalSourceType.SUBSCRIPTION_CHECKOUT_PENDING,
        sourceId: settledLedger.id,
      },
    }));

  const [clearing, revenue, ar, deferred, business] = await Promise.all([
    tx.platformChartOfAccount.findUnique({ where: { code: PLATFORM_CHART_SUBSCRIPTION_CLEARING } }),
    tx.platformChartOfAccount.findUnique({ where: { code: PLATFORM_CHART_SUBSCRIPTION_REVENUE } }),
    tx.platformChartOfAccount.findUnique({ where: { code: PLATFORM_CHART_SUBSCRIPTION_AR_PENDING } }),
    tx.platformChartOfAccount.findUnique({
      where: { code: PLATFORM_CHART_DEFERRED_SUBSCRIPTION_REVENUE },
    }),
    tx.business.findUnique({
      where: { id: invoice.businessId },
      select: { name: true, slug: true },
    }),
  ]);

  if (!clearing || !revenue) {
    throw new Error("Platform chart accounts missing after ensureDefaultPlatformChartAccounts.");
  }

  const amt = invoice.amount;
  const label = business?.name ?? invoice.businessId;

  if (pendingGl && settledLedger && ar && deferred) {
    await tx.platformJournalEntry.create({
      data: {
        postedAt: new Date(),
        memo: `Subscription invoice settled — ${label} (${invoice.currency})`,
        reference: invoice.id,
        sourceType: PlatformJournalSourceType.SUBSCRIPTION_CHECKOUT_SETTLEMENT,
        sourceId: invoice.id,
        lines: {
          create: [
            {
              chartOfAccountId: clearing.id,
              debitAmount: amt,
              creditAmount: new Prisma.Decimal(0),
              description: "Funds collected — subscription payment",
            },
            {
              chartOfAccountId: ar.id,
              debitAmount: new Prisma.Decimal(0),
              creditAmount: amt,
              description: "Clear checkout receivable",
            },
            {
              chartOfAccountId: deferred.id,
              debitAmount: amt,
              creditAmount: new Prisma.Decimal(0),
              description: "Release deferred revenue",
            },
            {
              chartOfAccountId: revenue.id,
              debitAmount: new Prisma.Decimal(0),
              creditAmount: amt,
              description: `Subscription revenue — ${label}`,
            },
          ],
        },
      },
    });
    return;
  }

  await tx.platformJournalEntry.create({
    data: {
      postedAt: new Date(),
      memo: `Subscription invoice paid — ${label} (${invoice.currency})`,
      reference: invoice.id,
      sourceType: PlatformJournalSourceType.SUBSCRIPTION_INVOICE_PAYMENT,
      sourceId: invoice.id,
      lines: {
        create: [
          {
            chartOfAccountId: clearing.id,
            debitAmount: amt,
            creditAmount: new Prisma.Decimal(0),
            description: "Merchant plan payment received",
          },
          {
            chartOfAccountId: revenue.id,
            debitAmount: new Prisma.Decimal(0),
            creditAmount: amt,
            description: `Subscription revenue — ${label}`,
          },
        ],
      },
    },
  });
}

/**
 * Record an externally completed refund to the merchant (money out). Idempotent per billing ledger id.
 * GL: Dr subscription refunds (expense) · Cr clearing (cash out).
 */
export async function postPlatformJournalForSubscriptionRefundLedger(
  tx: Tx,
  ledger: {
    id: string;
    businessId: string;
    subscriptionInvoiceId: string | null;
    amount: Prisma.Decimal;
    currency: string;
  },
): Promise<void> {
  await ensureDefaultPlatformChartAccounts(tx);

  const existing = await tx.platformJournalEntry.findFirst({
    where: {
      sourceType: PlatformJournalSourceType.SUBSCRIPTION_REFUND,
      sourceId: ledger.id,
    },
  });
  if (existing) {
    return;
  }

  const [refunds, clearing, business] = await Promise.all([
    tx.platformChartOfAccount.findUnique({ where: { code: PLATFORM_CHART_SUBSCRIPTION_REFUNDS } }),
    tx.platformChartOfAccount.findUnique({ where: { code: PLATFORM_CHART_SUBSCRIPTION_CLEARING } }),
    tx.business.findUnique({
      where: { id: ledger.businessId },
      select: { name: true },
    }),
  ]);

  if (!refunds || !clearing) {
    throw new Error("Platform chart accounts missing for subscription refunds.");
  }

  const amt = ledger.amount;
  const label = business?.name ?? ledger.businessId;
  const invRef = ledger.subscriptionInvoiceId ?? "—";

  await tx.platformJournalEntry.create({
    data: {
      postedAt: new Date(),
      memo: `Subscription refund to merchant — ${label} (${ledger.currency})`,
      reference: invRef,
      sourceType: PlatformJournalSourceType.SUBSCRIPTION_REFUND,
      sourceId: ledger.id,
      lines: {
        create: [
          {
            chartOfAccountId: refunds.id,
            debitAmount: amt,
            creditAmount: new Prisma.Decimal(0),
            description: `Refund — invoice ${invRef}`,
          },
          {
            chartOfAccountId: clearing.id,
            debitAmount: new Prisma.Decimal(0),
            creditAmount: amt,
            description: "Cash / settlement out to merchant",
          },
        ],
      },
    },
  });
}

const SUBSCRIPTION_WALLET_FEE_IDEM_PREFIX = "subscription-wallet-fee:";

function subscriptionCheckoutWalletFeeRate(provider: string): Prisma.Decimal {
  if (provider === CHECKOUT_ADAPTER_WAVE_GAMBIA) {
    return subscriptionCheckoutWaveWalletFeeRate();
  }
  if (provider === CHECKOUT_ADAPTER_YONNA_WALLET) {
    return subscriptionCheckoutYonnaWalletFeeRate();
  }
  return new Prisma.Decimal("0");
}

function isSubscriptionCheckoutWalletFeeRail(provider: string): boolean {
  return provider === CHECKOUT_ADAPTER_WAVE_GAMBIA || provider === CHECKOUT_ADAPTER_YONNA_WALLET;
}

/**
 * GL for wallet/processor fee on a paid subscription invoice: Dr wallet fee expense · Cr clearing.
 * Idempotent per billing ledger row (WALLET_FEE).
 */
export async function postPlatformJournalForSubscriptionWalletFeeLedger(
  tx: Tx,
  ledger: {
    id: string;
    businessId: string;
    subscriptionInvoiceId: string | null;
    amount: Prisma.Decimal;
    currency: string;
  },
): Promise<void> {
  await ensureDefaultPlatformChartAccounts(tx);

  const existing = await tx.platformJournalEntry.findFirst({
    where: {
      sourceType: PlatformJournalSourceType.SUBSCRIPTION_WALLET_FEE,
      sourceId: ledger.id,
    },
  });
  if (existing) {
    return;
  }

  const [walletFee, clearing, business] = await Promise.all([
    tx.platformChartOfAccount.findUnique({
      where: { code: PLATFORM_CHART_WALLET_FEES_SUBSCRIPTIONS },
    }),
    tx.platformChartOfAccount.findUnique({ where: { code: PLATFORM_CHART_SUBSCRIPTION_CLEARING } }),
    tx.business.findUnique({
      where: { id: ledger.businessId },
      select: { name: true },
    }),
  ]);

  if (!walletFee || !clearing) {
    throw new Error("Platform chart accounts missing for subscription wallet fees.");
  }

  const amt = ledger.amount;
  const label = business?.name ?? ledger.businessId;
  const invRef = ledger.subscriptionInvoiceId ?? "—";

  await tx.platformJournalEntry.create({
    data: {
      postedAt: new Date(),
      memo: `Subscription checkout wallet fee — ${label} (${ledger.currency})`,
      reference: invRef,
      sourceType: PlatformJournalSourceType.SUBSCRIPTION_WALLET_FEE,
      sourceId: ledger.id,
      lines: {
        create: [
          {
            chartOfAccountId: walletFee.id,
            debitAmount: amt,
            creditAmount: new Prisma.Decimal(0),
            description: `Wallet rail fee — invoice ${invRef}`,
          },
          {
            chartOfAccountId: clearing.id,
            debitAmount: new Prisma.Decimal(0),
            creditAmount: amt,
            description: "Reduce subscription collections clearing",
          },
        ],
      },
    },
  });
}

/**
 * After a successful Wave/Yonna subscription payment: billing ledger WALLET_FEE (rate × gross) + platform GL.
 * Rates: SUBSCRIPTION_CHECKOUT_WAVE_WALLET_FEE_RATE / SUBSCRIPTION_CHECKOUT_YONNA_WALLET_FEE_RATE (fraction 0–1).
 * Other checkout providers no-op here.
 * Idempotent per invoice (one WALLET_FEE row per subscription invoice).
 */
export async function recordSubscriptionCheckoutWalletFeeTx(
  tx: Tx,
  input: {
    provider: string;
    invoiceId: string;
    businessId: string;
    subscriptionId: string | null;
    grossAmount: Prisma.Decimal;
    currency: string;
  },
): Promise<void> {
  if (!isSubscriptionCheckoutWalletFeeRail(input.provider)) {
    return;
  }

  const canonicalIdem = `${SUBSCRIPTION_WALLET_FEE_IDEM_PREFIX}${input.invoiceId}`;

  let ledger = await tx.billingLedgerEntry.findFirst({
    where: {
      subscriptionInvoiceId: input.invoiceId,
      type: BillingLedgerEntryType.WALLET_FEE,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!ledger) {
    const rate = subscriptionCheckoutWalletFeeRate(input.provider);
    const feeAmount = new Prisma.Decimal(input.grossAmount.toString()).mul(rate).toDecimalPlaces(2);
    if (feeAmount.lte(0)) {
      return;
    }
    ledger = await tx.billingLedgerEntry.create({
      data: {
        businessId: input.businessId,
        subscriptionId: input.subscriptionId,
        subscriptionInvoiceId: input.invoiceId,
        type: BillingLedgerEntryType.WALLET_FEE,
        direction: BillingLedgerDirection.MONEY_OUT,
        status: BillingLedgerStatus.SUCCEEDED,
        amount: feeAmount,
        currency: input.currency,
        provider: input.provider,
        idempotencyKey: canonicalIdem,
        succeededAt: new Date(),
        metadata: {
          rate: rate.toString(),
          basis: "subscription_invoice_gross",
          rail: input.provider,
          source: "legacy_no_pending_wallet_row",
        } as Prisma.InputJsonValue,
      },
    });
  }

  if (ledger.amount.lte(0)) {
    return;
  }

  await postPlatformJournalForSubscriptionWalletFeeLedger(tx, {
    id: ledger.id,
    businessId: ledger.businessId,
    subscriptionInvoiceId: ledger.subscriptionInvoiceId,
    amount: ledger.amount,
    currency: ledger.currency,
  });
}

/** @deprecated Use recordSubscriptionCheckoutWalletFeeTx */
export const recordSubscriptionWaveWalletFeeTx = recordSubscriptionCheckoutWalletFeeTx;

const SUBSCRIPTION_REFUND_IDEM_PREFIX = "subscription-refund:";

/**
 * Creates a succeeded REFUND billing ledger row (if missing) and posts platform GL.
 * Use inside an existing transaction (e.g. billing review patch).
 */
export async function recordSubscriptionRefundBillingAndJournalTx(
  tx: Tx,
  input: {
    invoiceId: string;
    businessId: string;
    subscriptionId: string | null;
    amount: Prisma.Decimal;
    currency: string;
  },
): Promise<void> {
  const idem = `${SUBSCRIPTION_REFUND_IDEM_PREFIX}${input.invoiceId}`;

  const inv = await tx.subscriptionInvoice.findUnique({
    where: { id: input.invoiceId },
    select: { status: true },
  });
  if (!inv || inv.status !== InvoiceStatus.PAID) {
    throw new HttpError(400, "Only paid invoices can be marked as refunded externally.");
  }

  let ledger = await tx.billingLedgerEntry.findFirst({
    where: { idempotencyKey: idem },
  });

  if (!ledger) {
    ledger = await tx.billingLedgerEntry.create({
      data: {
        businessId: input.businessId,
        subscriptionId: input.subscriptionId,
        subscriptionInvoiceId: input.invoiceId,
        type: BillingLedgerEntryType.REFUND,
        direction: BillingLedgerDirection.MONEY_OUT,
        status: BillingLedgerStatus.SUCCEEDED,
        amount: input.amount,
        currency: input.currency,
        provider: "platform_manual",
        idempotencyKey: idem,
        succeededAt: new Date(),
      },
    });
  } else if (ledger.type !== BillingLedgerEntryType.REFUND) {
    throw new HttpError(409, "Billing ledger idempotency key conflict.");
  }

  await postPlatformJournalForSubscriptionRefundLedger(tx, {
    id: ledger.id,
    businessId: ledger.businessId,
    subscriptionInvoiceId: ledger.subscriptionInvoiceId,
    amount: ledger.amount,
    currency: ledger.currency,
  });
}

/** Standalone: refund billing row + GL in one transaction. */
export async function recordSubscriptionRefundBillingAndJournal(input: {
  invoiceId: string;
  businessId: string;
  subscriptionId: string | null;
  amount: Prisma.Decimal;
  currency: string;
}): Promise<void> {
  await prisma.$transaction((tx) => recordSubscriptionRefundBillingAndJournalTx(tx, input));
}

/** Backfill journals for invoices that were paid before platform GL existed (idempotent). */
export async function backfillPlatformJournalsForPaidInvoices(limit = 500): Promise<{ created: number }> {
  await ensureDefaultPlatformChartAccounts(prisma);
  const paid = await prisma.subscriptionInvoice.findMany({
    where: { status: InvoiceStatus.PAID },
    orderBy: { paidAt: "asc" },
    take: limit,
    select: { id: true, businessId: true, amount: true, currency: true },
  });

  let created = 0;
  for (const inv of paid) {
    const existed =
      (await prisma.platformJournalEntry.findFirst({
        where: {
          sourceType: PlatformJournalSourceType.SUBSCRIPTION_INVOICE_PAYMENT,
          sourceId: inv.id,
        },
      })) ||
      (await prisma.platformJournalEntry.findFirst({
        where: {
          sourceType: PlatformJournalSourceType.SUBSCRIPTION_CHECKOUT_SETTLEMENT,
          sourceId: inv.id,
        },
      }));
    if (existed) continue;
    await prisma.$transaction(async (tx) => {
      await postPlatformJournalForPaidSubscriptionInvoice(tx, inv);
    });
    created += 1;
  }
  return { created };
}
