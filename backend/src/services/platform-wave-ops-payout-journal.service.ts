import { ActivityActorKind, PlatformJournalSourceType, Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { ACTIVITY_EVENT, appendActivityLog } from "./activity-log.service.js";
import {
  ensureDefaultPlatformChartAccounts,
  PLATFORM_CHART_AGGREGATOR_WAVE_CLEARING,
  PLATFORM_CHART_WAVE_OPS_PAYOUTS,
} from "./platform-chart-of-accounts.service.js";

type Tx = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

function money(raw: Prisma.Decimal | string | number): Prisma.Decimal {
  const d = new Prisma.Decimal(String(raw ?? 0));
  if (!d.isFinite() || d.lte(0)) {
    return new Prisma.Decimal(0);
  }
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function parseWaveFee(raw: string | null | undefined): Prisma.Decimal {
  if (!raw?.trim()) {
    return new Prisma.Decimal(0);
  }
  return money(raw);
}

function payoutTotal(receiveAmount: string, fee: string | null): Prisma.Decimal {
  return money(receiveAmount).plus(parseWaveFee(fee));
}

async function postPlatformJournalForWaveOpsPayout(
  tx: Tx,
  row: {
    id: string;
    currency: string;
    receiveAmount: string;
    fee: string | null;
    name: string;
    clientReference: string | null;
    supplierName?: string | null;
  },
): Promise<{ id: string; created: boolean } | null> {
  await ensureDefaultPlatformChartAccounts(tx);

  const existing = await tx.platformJournalEntry.findFirst({
    where: {
      sourceType: PlatformJournalSourceType.WAVE_OPS_PAYOUT,
      sourceId: row.id,
    },
    select: { id: true },
  });
  if (existing) {
    return { id: existing.id, created: false };
  }

  const [clearing, payoutCost] = await Promise.all([
    tx.platformChartOfAccount.findUnique({
      where: { code: PLATFORM_CHART_AGGREGATOR_WAVE_CLEARING },
    }),
    tx.platformChartOfAccount.findUnique({
      where: { code: PLATFORM_CHART_WAVE_OPS_PAYOUTS },
    }),
  ]);
  if (!clearing || !payoutCost) {
    throw new Error("Platform chart accounts missing for Wave operations payouts.");
  }

  const total = payoutTotal(row.receiveAmount, row.fee);
  if (total.lte(0)) {
    return null;
  }

  const label = row.supplierName?.trim() || row.name.trim() || row.id;
  const zero = new Prisma.Decimal(0);
  const entry = await tx.platformJournalEntry.create({
    data: {
      postedAt: new Date(),
      memo: `Wave operations payout — ${label} (${row.currency})`,
      reference: row.clientReference,
      sourceType: PlatformJournalSourceType.WAVE_OPS_PAYOUT,
      sourceId: row.id,
      lines: {
        create: [
          {
            chartOfAccountId: payoutCost.id,
            debitAmount: total,
            creditAmount: zero,
            description: `Wave operations payout — ${label}`,
          },
          {
            chartOfAccountId: clearing.id,
            debitAmount: zero,
            creditAmount: total,
            description: `Wave wallet out — ${label}`,
          },
        ],
      },
    },
    select: { id: true },
  });
  return { id: entry.id, created: true };
}

async function postPlatformJournalReversalForWaveOpsPayout(
  tx: Tx,
  payoutId: string,
): Promise<{ id: string; created: boolean } | null> {
  const original = await tx.platformJournalEntry.findFirst({
    where: {
      sourceType: PlatformJournalSourceType.WAVE_OPS_PAYOUT,
      sourceId: payoutId,
    },
    include: {
      lines: { orderBy: { id: "asc" } },
      reversedByPlatformEntry: { select: { id: true } },
    },
  });
  if (!original) {
    return null;
  }
  if (original.reversedByPlatformEntry) {
    return { id: original.reversedByPlatformEntry.id, created: false };
  }
  const existingReversal = await tx.platformJournalEntry.findFirst({
    where: {
      OR: [
        { reversesPlatformJournalEntryId: original.id },
        {
          sourceType: PlatformJournalSourceType.WAVE_OPS_PAYOUT_REVERSAL,
          sourceId: payoutId,
        },
      ],
    },
    select: { id: true },
  });
  if (existingReversal) {
    return { id: existingReversal.id, created: false };
  }
  if (!original.lines.length) {
    return null;
  }

  const reversal = await tx.platformJournalEntry.create({
    data: {
      postedAt: new Date(),
      memo: original.memo?.trim()
        ? `Reversal of ${original.memo.trim()}`
        : `Reversal of Wave operations payout (${payoutId})`,
      reference: original.reference,
      sourceType: PlatformJournalSourceType.WAVE_OPS_PAYOUT_REVERSAL,
      sourceId: payoutId,
      reversesPlatformJournalEntryId: original.id,
      lines: {
        create: original.lines.map((ln) => {
          const desc = ln.description?.trim()
            ? `Reversal: ${ln.description.trim()}`
            : "Reversal of Wave operations payout line";
          return {
            chartOfAccountId: ln.chartOfAccountId,
            debitAmount: ln.creditAmount,
            creditAmount: ln.debitAmount,
            description: desc.length > 4000 ? desc.slice(0, 4000) : desc,
            quantity: ln.quantity,
            unitLabel: ln.unitLabel,
            taxAmount: ln.taxAmount,
          };
        }),
      },
    },
    select: { id: true },
  });
  return { id: reversal.id, created: true };
}

/**
 * Post or reverse platform GL for a Wave Operations supplier payout.
 * Skips self-settlement (`businessId`) and bill-linked payouts (`platformBillId`).
 */
export async function syncPlatformJournalForWaveOpsSupplierPayout(payoutId: string): Promise<void> {
  const row = await prisma.waveOpsPayout.findUnique({
    where: { id: payoutId },
    include: { supplier: { select: { name: true } } },
  });
  if (!row || row.businessId || row.platformBillId) {
    return;
  }

  const status = row.status.trim().toLowerCase();
  const reversed = status === "reversed" || Boolean(row.reversedAt);

  try {
    await prisma.$transaction(async (tx) => {
      if (reversed) {
        const reversal = await postPlatformJournalReversalForWaveOpsPayout(tx, row.id);
        if (reversal?.created) {
          await appendActivityLog(tx, {
            actorUserId: null,
            actorKind: ActivityActorKind.SYSTEM,
            eventType: ACTIVITY_EVENT.WAVE_OPS_PAYOUT_REVERSED,
            resourceType: "WaveOpsPayout",
            resourceId: row.id,
            metadata: {
              wavePayoutId: row.wavePayoutId,
              receiveAmount: row.receiveAmount,
              fee: row.fee,
              supplierName: row.supplier?.name ?? row.name,
              platformJournalReversalId: reversal.id,
            },
          });
        }
        return;
      }
      if (status !== "succeeded") {
        return;
      }
      const posted = await postPlatformJournalForWaveOpsPayout(tx, {
        id: row.id,
        currency: row.currency,
        receiveAmount: row.receiveAmount,
        fee: row.fee,
        name: row.name,
        clientReference: row.clientReference,
        supplierName: row.supplier?.name ?? row.name,
      });
      if (posted && row.platformJournalEntryId !== posted.id) {
        await tx.waveOpsPayout.update({
          where: { id: row.id },
          data: { platformJournalEntryId: posted.id },
        });
      }
      if (posted?.created) {
        await appendActivityLog(tx, {
          actorUserId: null,
          actorKind: ActivityActorKind.SYSTEM,
          eventType: ACTIVITY_EVENT.WAVE_OPS_PAYOUT_SUCCEEDED,
          resourceType: "WaveOpsPayout",
          resourceId: row.id,
          metadata: {
            wavePayoutId: row.wavePayoutId,
            receiveAmount: row.receiveAmount,
            fee: row.fee,
            supplierName: row.supplier?.name ?? row.name,
            platformJournalEntryId: posted.id,
          },
        });
      }
    });
  } catch (err) {
    console.error("[wave-ops] Failed to sync platform journal for payout", payoutId, err);
  }
}
