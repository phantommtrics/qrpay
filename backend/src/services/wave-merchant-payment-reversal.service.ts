import {
  PaymentStatus as PrismaPaymentStatus,
  Prisma,
  SalesLedgerEntryType,
  SalesLedgerStatus,
  WaveSelfSettlementPayoutStatus,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { PaymentMethod, PaymentProvider, PaymentStatus } from "../lib/prisma-sales-enums.js";
import { reverseMerchantSalesJournalsForPayment } from "./sale-accounting.service.js";
import {
  clientReferencesForWaveReversals,
  wavePayoutReversalLookups,
} from "./wave-ops-transactions.util.js";
import type { WaveTransaction } from "./wave-payment.service.js";
import { applyWaveSelfSettlementPayoutReversed } from "./wave-self-settlement-reversal.service.js";

const WAVE_REVERSAL_SKIP_REASON = "Wave transaction reversed";

const REVERSAL_LEDGER_TYPES: SalesLedgerEntryType[] = [
  SalesLedgerEntryType.CUSTOMER_SALE,
  SalesLedgerEntryType.WALLET_FEE,
  SalesLedgerEntryType.SELF_SETTLEMENT_CHECKOUT_FEE,
];

export async function findLocalWavePaymentByClientReference(clientReference: string) {
  const ref = clientReference.trim();
  if (!ref) {
    return null;
  }
  return prisma.payment.findFirst({
    where: {
      method: PaymentMethod.QR_WALLET,
      provider: PaymentProvider.WAVE_GAMBIA,
      OR: [{ orderId: ref }, { salesInvoiceId: ref }, { id: ref }],
    },
    orderBy: { createdAt: "desc" },
  });
}

async function skipPendingSelfSettlementPayouts(tx: Prisma.TransactionClient, paymentId: string) {
  await tx.waveSelfSettlementPayout.updateMany({
    where: {
      paymentId,
      status: {
        in: [WaveSelfSettlementPayoutStatus.PENDING, WaveSelfSettlementPayoutStatus.PROCESSING],
      },
      wavePayoutId: null,
    },
    data: {
      status: WaveSelfSettlementPayoutStatus.SKIPPED,
      skipReason: WAVE_REVERSAL_SKIP_REASON,
    },
  });
}

/**
 * Mark the matching completed Wave checkout payment as reversed and reverse merchant
 * sale / wallet-fee / reserved checkout-fee journals. Idempotent if already REVERSED
 * (still heals leftover SUCCEEDED sales-ledger rows).
 */
export async function markLocalWavePaymentReversed(input: {
  clientReference?: string | null;
  waveTransactionId?: string | null;
}): Promise<{ paymentId: string; alreadyReversed: boolean } | null> {
  const ref = input.clientReference?.trim();
  if (!ref) {
    return null;
  }
  const payment = await findLocalWavePaymentByClientReference(ref);
  if (!payment) {
    return null;
  }
  if (payment.status === PaymentStatus.REVERSED) {
    await prisma.$transaction(async (tx) => {
      await reverseMerchantSalesJournalsForPayment(tx, payment.id, payment.reversedAt);
    });
    return { paymentId: payment.id, alreadyReversed: true };
  }
  if (payment.status !== PaymentStatus.COMPLETED) {
    return null;
  }

  const reversedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.REVERSED,
        reversedAt,
      },
    });
    await skipPendingSelfSettlementPayouts(tx, payment.id);
    await reverseMerchantSalesJournalsForPayment(tx, payment.id, reversedAt);
  });

  return { paymentId: payment.id, alreadyReversed: false };
}

export async function reverseMerchantLedgersForReversedPayment(
  paymentId: string,
  postedAt?: Date | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await reverseMerchantSalesJournalsForPayment(tx, paymentId, postedAt);
  });
}

/**
 * Catch up payments already marked REVERSED whose sales-ledger rows are still SUCCEEDED.
 * Does not send push notifications.
 */
export async function backfillMerchantLedgersForReversedPayments(
  limit = 100,
): Promise<{ scanned: number; reversed: number; skipped: number }> {
  const payments = await prisma.payment.findMany({
    where: {
      status: PrismaPaymentStatus.REVERSED,
      salesLedgerEntries: {
        some: {
          status: SalesLedgerStatus.SUCCEEDED,
          type: { in: REVERSAL_LEDGER_TYPES },
        },
      },
    },
    select: { id: true, reversedAt: true },
    orderBy: { reversedAt: "asc" },
    take: Math.min(Math.max(limit, 1), 200),
  });

  let reversed = 0;
  let skipped = 0;
  for (const payment of payments) {
    try {
      await reverseMerchantLedgersForReversedPayment(payment.id, payment.reversedAt);
      reversed += 1;
    } catch (err) {
      skipped += 1;
      console.error("[wave-ops] Failed to backfill reversed payment ledger", payment.id, err);
    }
  }
  if (payments.length) {
    console.info("[wave-ops] backfilled reversed payment ledgers", {
      scanned: payments.length,
      reversed,
      skipped,
    });
  }
  return { scanned: payments.length, reversed, skipped };
}

export async function syncLocalWaveReversalsFromTransactions(
  items: WaveTransaction[],
): Promise<{ reversed: number; alreadyReversed: number }> {
  const refs = clientReferencesForWaveReversals(items);
  let reversed = 0;
  let alreadyReversed = 0;
  for (const clientReference of refs) {
    try {
      const result = await markLocalWavePaymentReversed({ clientReference });
      if (!result) {
        continue;
      }
      if (result.alreadyReversed) {
        alreadyReversed += 1;
      } else {
        reversed += 1;
      }
    } catch (err) {
      console.error("[wave-ops] Failed to mark local payment reversed", clientReference, err);
    }
  }

  const payoutLookups = wavePayoutReversalLookups(items);
  const seen = new Set<string>();
  for (const wavePayoutId of payoutLookups.wavePayoutIds) {
    try {
      const result = await applyWaveSelfSettlementPayoutReversed({ wavePayoutId });
      if (!result || seen.has(result.payoutId)) {
        continue;
      }
      seen.add(result.payoutId);
      if (result.already) {
        alreadyReversed += 1;
      } else {
        reversed += 1;
      }
    } catch (err) {
      console.error("[wave-ops] Failed to apply self-settlement payout reversal", wavePayoutId, err);
    }
  }
  for (const clientReference of payoutLookups.clientReferences) {
    try {
      const result = await applyWaveSelfSettlementPayoutReversed({ clientReference });
      if (!result || seen.has(result.payoutId)) {
        continue;
      }
      seen.add(result.payoutId);
      if (result.already) {
        alreadyReversed += 1;
      } else {
        reversed += 1;
      }
    } catch (err) {
      console.error(
        "[wave-ops] Failed to apply self-settlement payout reversal by client_reference",
        clientReference,
        err,
      );
    }
  }
  return { reversed, alreadyReversed };
}
