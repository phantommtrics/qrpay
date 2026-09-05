import { prisma } from "../lib/prisma.js";
import { PaymentMethod, PaymentProvider, PaymentStatus } from "../lib/prisma-sales-enums.js";
import { clientReferencesForWaveReversals } from "./wave-ops-transactions.util.js";
import type { WaveTransaction } from "./wave-payment.service.js";

const WAVE_REVERSAL_SKIP_REASON = "Wave transaction reversed";
const SETTLEMENT_PENDING = "PENDING";
const SETTLEMENT_PROCESSING = "PROCESSING";
const SETTLEMENT_SKIPPED = "SKIPPED";

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

/**
 * Mark the matching completed Wave checkout payment as reversed.
 * Idempotent if already REVERSED. Skips pending self-settlement payouts.
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
    return { paymentId: payment.id, alreadyReversed: true };
  }
  if (payment.status !== PaymentStatus.COMPLETED) {
    return null;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: PaymentStatus.REVERSED,
      reversedAt: new Date(),
    },
  });

  await prisma.waveSelfSettlementPayout.updateMany({
    where: {
      paymentId: payment.id,
      status: {
        in: [SETTLEMENT_PENDING, SETTLEMENT_PROCESSING],
      },
      wavePayoutId: null,
    },
    data: {
      status: SETTLEMENT_SKIPPED,
      skipReason: WAVE_REVERSAL_SKIP_REASON,
    },
  });

  return { paymentId: payment.id, alreadyReversed: false };
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
  return { reversed, alreadyReversed };
}
