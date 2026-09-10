import { ActivityActorKind, PlatformJournalSourceType, Prisma, WaveSelfSettlementPayoutStatus } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { ACTIVITY_EVENT, appendActivityLog } from "./activity-log.service.js";
import { postPlatformJournalReversalForSelfSettlementPayout } from "./platform-self-settlement-journal.service.js";
import { reverseMerchantSelfSettlementCheckoutFeeJournal } from "./sale-accounting.service.js";
import {
  postMerchantJournalForSelfSettlementPayout,
  reverseMerchantJournalForSelfSettlementPayout,
} from "./merchant-payout-journal.service.js";
import { isPlatformWaveCheckoutConfigured, waveServiceFromEnv } from "./wave-client-env.js";

const SUCCEEDED_REVERSE_POLL_MS = 5 * 60 * 1000;
const SUCCEEDED_REVERSE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ApplySelfSettlementReverseResult = {
  payoutId: string;
  already: boolean;
  platformJournalReversalId: string | null;
  merchantFeeJournalReversalId: string | null;
};

async function findSelfSettlementPayout(input: {
  payoutId?: string | null;
  wavePayoutId?: string | null;
  clientReference?: string | null;
  paymentId?: string | null;
}) {
  const payoutId = input.payoutId?.trim();
  if (payoutId) {
    return prisma.waveSelfSettlementPayout.findUnique({ where: { id: payoutId } });
  }
  const wavePayoutId = input.wavePayoutId?.trim();
  const clientReference = input.clientReference?.trim();
  const paymentId = input.paymentId?.trim();
  const or: Prisma.WaveSelfSettlementPayoutWhereInput[] = [];
  if (wavePayoutId) {
    or.push({ wavePayoutId });
  }
  if (clientReference) {
    or.push({ clientReference });
    or.push({ paymentId: clientReference });
  }
  if (paymentId) {
    or.push({ paymentId });
  }
  if (!or.length) {
    return null;
  }
  return prisma.waveSelfSettlementPayout.findFirst({
    where: { OR: or },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * When Wave reports a self-settlement payout reversed: mark local row, reverse platform
 * journal (payout + fee + withhold), and reverse the merchant reserved checkout-fee journal.
 * Idempotent.
 */
export async function applyWaveSelfSettlementPayoutReversed(input: {
  payoutId?: string | null;
  wavePayoutId?: string | null;
  clientReference?: string | null;
  paymentId?: string | null;
}): Promise<ApplySelfSettlementReverseResult | null> {
  const row = await findSelfSettlementPayout(input);
  if (!row) {
    return null;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const merchantFeeJournalReversalId = await reverseMerchantSelfSettlementCheckoutFeeJournal(
        tx,
        row.paymentId,
      );
      await postMerchantJournalForSelfSettlementPayout(tx, {
        id: row.id,
        businessId: row.businessId,
        paymentId: row.paymentId,
        currency: row.currency,
        receiveAmount: row.receiveAmount,
        withholdAmount: row.withholdAmount,
        fee: row.fee,
        name: row.name,
      });
      const merchantPayoutJournalReversal = await reverseMerchantJournalForSelfSettlementPayout(
        tx,
        row.id,
        row.paymentId,
      );

      const original = await tx.platformJournalEntry.findFirst({
        where: {
          sourceType: PlatformJournalSourceType.WAVE_SELF_SETTLEMENT,
          sourceId: row.id,
        },
        select: { id: true, reversedByPlatformEntry: { select: { id: true } } },
      });
      const alreadyHadPlatformReversal = Boolean(original?.reversedByPlatformEntry);

      let platformJournalReversalId: string | null = original?.reversedByPlatformEntry?.id ?? null;
      if (original && !alreadyHadPlatformReversal) {
        platformJournalReversalId = await postPlatformJournalReversalForSelfSettlementPayout(
          tx,
          row.id,
        );
      }

      const already =
        row.status === WaveSelfSettlementPayoutStatus.REVERSED &&
        (alreadyHadPlatformReversal || !original);

      await tx.waveSelfSettlementPayout.update({
        where: { id: row.id },
        data: {
          status: WaveSelfSettlementPayoutStatus.REVERSED,
          errorCode: null,
          errorMessage: "Wave payout reversed",
        },
      });

      const now = new Date();
      if (row.waveOpsPayoutId) {
        await tx.waveOpsPayout.update({
          where: { id: row.waveOpsPayoutId },
          data: { status: "reversed", reversedAt: now },
        });
      } else if (row.wavePayoutId) {
        await tx.waveOpsPayout.updateMany({
          where: { wavePayoutId: row.wavePayoutId },
          data: { status: "reversed", reversedAt: now },
        });
      }

      if (!already) {
        await appendActivityLog(tx, {
          businessId: row.businessId,
          actorUserId: null,
          actorKind: ActivityActorKind.SYSTEM,
          eventType: ACTIVITY_EVENT.WAVE_SELF_SETTLEMENT_REVERSED,
          resourceType: "WaveSelfSettlementPayout",
          resourceId: row.id,
          metadata: {
            wavePayoutId: row.wavePayoutId,
            receiveAmount: row.receiveAmount.toFixed(2),
            withholdAmount: row.withholdAmount.toFixed(2),
            fee: row.fee,
            platformJournalReversalId,
            merchantFeeJournalReversalId,
            merchantPayoutJournalReversalId: merchantPayoutJournalReversal?.id ?? null,
          },
        });
      }

      return {
        payoutId: row.id,
        already,
        platformJournalReversalId,
        merchantFeeJournalReversalId,
      };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        payoutId: row.id,
        already: true,
        platformJournalReversalId: null,
        merchantFeeJournalReversalId: null,
      };
    }
    console.error("[wave-self-settlement] Failed to apply payout reversal journals", row.id, err);
    throw err;
  }
}

/** Poll recent SUCCEEDED aggregator payouts in case Wave reversed them after we stopped polling. */
export async function pollSucceededSelfSettlementPayoutsForReverse(limit = 15): Promise<number> {
  if (!isPlatformWaveCheckoutConfigured()) {
    return 0;
  }
  const now = new Date();
  const windowStart = new Date(now.getTime() - SUCCEEDED_REVERSE_WINDOW_MS);
  const rows = await prisma.waveSelfSettlementPayout.findMany({
    where: {
      status: WaveSelfSettlementPayoutStatus.SUCCEEDED,
      wavePayoutId: { not: null },
      nextAttemptAt: { lte: now },
      OR: [
        { waveTimestamp: { gte: windowStart } },
        { waveTimestamp: null, createdAt: { gte: windowStart } },
      ],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: Math.min(Math.max(limit, 1), 25),
    select: { id: true, wavePayoutId: true },
  });
  if (!rows.length) {
    return 0;
  }

  const wave = waveServiceFromEnv();
  let reversed = 0;
  for (const row of rows) {
    const wavePayoutId = row.wavePayoutId?.trim();
    if (!wavePayoutId) {
      continue;
    }
    try {
      const remote = await wave.getPayout(wavePayoutId);
      if (remote.status === "reversed") {
        await applyWaveSelfSettlementPayoutReversed({
          payoutId: row.id,
          wavePayoutId,
        });
        reversed += 1;
        continue;
      }
      await prisma.waveSelfSettlementPayout.update({
        where: { id: row.id },
        data: { nextAttemptAt: new Date(Date.now() + SUCCEEDED_REVERSE_POLL_MS) },
      });
    } catch (err) {
      console.warn("[wave-self-settlement] reverse-poll failed", {
        payoutId: row.id,
        wavePayoutId,
        err,
      });
      await prisma.waveSelfSettlementPayout.update({
        where: { id: row.id },
        data: { nextAttemptAt: new Date(Date.now() + SUCCEEDED_REVERSE_POLL_MS) },
      });
    }
  }
  if (reversed) {
    console.info("[wave-self-settlement] applied Wave payout reversals", { reversed });
  }
  return reversed;
}
