import {
  JournalSourceType,
  Prisma,
  SalesLedgerDirection,
  SalesLedgerEntryType,
  SalesLedgerStatus,
  WaveSelfSettlementPayoutStatus,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import {
  CHART_CODE_MERCHANT_WALLET_CLEARING,
  CHART_CODE_MOBILE_MONEY,
  CHART_CODE_OTHER_REVENUE,
  CHART_CODE_QR_WALLET_PROCESSING_FEES,
  CHART_CODE_WAVE_MERCHANT_PAYOUTS,
  ensureDefaultChartOfAccountsForBusiness,
  getChartAccountByCode,
} from "./chart-of-accounts.service.js";
import { loadWaveMerchantBusinessLinks } from "./wave-aggregated-merchant.service.js";

export type MerchantPayoutJournalResult = {
  id: string;
  created: boolean;
};

type Tx = Prisma.TransactionClient;

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

async function reverseMerchantJournalBySource(
  tx: Tx,
  input: {
    sourceType: JournalSourceType;
    reversalSourceType: JournalSourceType;
    sourceId: string;
    ledgerType: SalesLedgerEntryType;
    paymentId?: string | null;
    postedAt?: Date | null;
    fallbackMemo: string;
  },
): Promise<MerchantPayoutJournalResult | null> {
  const original = await tx.journalEntry.findFirst({
    where: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reversesJournalEntryId: null,
    },
    include: {
      lines: { orderBy: { id: "asc" } },
      reversedByEntry: { select: { id: true } },
    },
  });
  if (!original) {
    return null;
  }

  const markLedger = async () => {
    await tx.salesLedgerEntry.updateMany({
      where: {
        ...(input.paymentId
          ? { paymentId: input.paymentId, type: input.ledgerType }
          : { journalEntryId: original.id, type: input.ledgerType }),
        status: SalesLedgerStatus.SUCCEEDED,
      },
      data: { status: SalesLedgerStatus.REVERSED },
    });
  };

  if (original.reversedByEntry) {
    await markLedger();
    return { id: original.reversedByEntry.id, created: false };
  }
  const existingReversal = await tx.journalEntry.findFirst({
    where: {
      OR: [
        { reversesJournalEntryId: original.id },
        { sourceType: input.reversalSourceType, sourceId: input.sourceId },
      ],
    },
    select: { id: true },
  });
  if (existingReversal) {
    await markLedger();
    return { id: existingReversal.id, created: false };
  }
  if (!original.lines.length) {
    await markLedger();
    return null;
  }

  const reversal = await tx.journalEntry.create({
    data: {
      businessId: original.businessId,
      postedAt: input.postedAt ?? new Date(),
      memo: original.memo?.trim()
        ? `Reversal of ${original.memo.trim()}`
        : input.fallbackMemo,
      reference: original.reference,
      sourceType: input.reversalSourceType,
      sourceId: input.sourceId,
      reversesJournalEntryId: original.id,
      journalApprovalExempt: true,
      lines: {
        create: original.lines.map((ln) => {
          const desc = ln.description?.trim()
            ? `Reversal: ${ln.description.trim()}`
            : "Reversal of merchant payout journal line";
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
  await markLedger();
  return { id: reversal.id, created: true };
}

/**
 * Merchant books for a succeeded aggregator self-settlement:
 *   Dr MOBILE_MONEY           receive
 *   Cr MERCHANT_WALLET_CLEARING receive
 *   Dr QR_WALLET_FEES         withhold + Wave payout fee
 *   Cr MERCHANT_WALLET_CLEARING withhold + Wave payout fee
 * Idempotent on WaveSelfSettlementPayout.id. Does not send push.
 */
export async function postMerchantJournalForSelfSettlementPayout(
  tx: Tx,
  row: {
    id: string;
    businessId: string;
    paymentId: string;
    currency: string;
    receiveAmount: Prisma.Decimal;
    withholdAmount: Prisma.Decimal;
    fee: string | null;
    name?: string | null;
  },
  postedAt?: Date | null,
): Promise<MerchantPayoutJournalResult | null> {
  const existing = await tx.journalEntry.findFirst({
    where: {
      sourceType: JournalSourceType.WAVE_SELF_SETTLEMENT_PAYOUT,
      sourceId: row.id,
    },
    select: { id: true },
  });
  if (existing) {
    return { id: existing.id, created: false };
  }

  await ensureDefaultChartOfAccountsForBusiness(tx, row.businessId);
  const [mobileMoney, clearing, fees, payment] = await Promise.all([
    getChartAccountByCode(tx, row.businessId, CHART_CODE_MOBILE_MONEY),
    getChartAccountByCode(tx, row.businessId, CHART_CODE_MERCHANT_WALLET_CLEARING),
    getChartAccountByCode(tx, row.businessId, CHART_CODE_QR_WALLET_PROCESSING_FEES),
    tx.payment.findUnique({
      where: { id: row.paymentId },
      select: { orderId: true, publicCode: true, providerRef: true },
    }),
  ]);
  if (!mobileMoney || !clearing || !fees) {
    throw new Error("Chart accounts missing for merchant self-settlement payout.");
  }

  const receive = money(row.receiveAmount);
  const withhold = money(row.withholdAmount);
  const payoutFee = parseWaveFee(row.fee);
  const feeOut = withhold.plus(payoutFee);
  if (receive.lte(0) && feeOut.lte(0)) {
    return null;
  }

  const label = row.name?.trim() || row.id;
  const zero = new Prisma.Decimal(0);
  const lines: Array<{
    chartOfAccountId: string;
    debitAmount: Prisma.Decimal;
    creditAmount: Prisma.Decimal;
    description: string;
  }> = [];
  if (receive.gt(0)) {
    lines.push(
      {
        chartOfAccountId: mobileMoney.id,
        debitAmount: receive,
        creditAmount: zero,
        description: `Self-settlement received — ${label}`,
      },
      {
        chartOfAccountId: clearing.id,
        debitAmount: zero,
        creditAmount: receive,
        description: `Clear digital payments for self-settlement received — ${label}`,
      },
    );
  }
  if (feeOut.gt(0)) {
    const parts = [
      withhold.gt(0) ? `withhold ${withhold.toString()}` : null,
      payoutFee.gt(0) ? `Wave payout fee ${payoutFee.toString()}` : null,
    ].filter(Boolean);
    lines.push(
      {
        chartOfAccountId: fees.id,
        debitAmount: feeOut,
        creditAmount: zero,
        description: `Self-settlement platform/Wave cost (${parts.join(", ")}) — ${label}`,
      },
      {
        chartOfAccountId: clearing.id,
        debitAmount: zero,
        creditAmount: feeOut,
        description: `Clear digital payments for self-settlement withhold/fee — ${label}`,
      },
    );
  }

  const journal = await tx.journalEntry.create({
    data: {
      postedAt: postedAt ?? new Date(),
      businessId: row.businessId,
      memo: `Wave self-settlement payout — ${label} (${row.currency})`,
      reference: payment?.publicCode ?? row.paymentId,
      sourceType: JournalSourceType.WAVE_SELF_SETTLEMENT_PAYOUT,
      sourceId: row.id,
      journalApprovalExempt: true,
      lines: { create: lines },
    },
    select: { id: true },
  });

  const ledgerAmount = receive.gt(0) ? receive : feeOut;
  await tx.salesLedgerEntry.create({
    data: {
      businessId: row.businessId,
      orderId: payment?.orderId ?? null,
      paymentId: row.paymentId,
      journalEntryId: journal.id,
      type: SalesLedgerEntryType.SETTLEMENT_PAYOUT,
      direction: SalesLedgerDirection.MONEY_IN,
      status: SalesLedgerStatus.SUCCEEDED,
      amount: ledgerAmount,
      currency: row.currency,
      provider: "wave gambia",
      providerPaymentRef: payment?.providerRef ?? null,
      metadata: {
        receiveAmount: receive.toString(),
        withholdAmount: withhold.toString(),
        payoutFee: payoutFee.toString(),
        debitAccountCode: CHART_CODE_MOBILE_MONEY,
        creditAccountCode: CHART_CODE_MERCHANT_WALLET_CLEARING,
      },
    },
  });

  return { id: journal.id, created: true };
}

export async function reverseMerchantJournalForSelfSettlementPayout(
  tx: Tx,
  payoutId: string,
  paymentId: string,
  postedAt?: Date | null,
): Promise<MerchantPayoutJournalResult | null> {
  return reverseMerchantJournalBySource(tx, {
    sourceType: JournalSourceType.WAVE_SELF_SETTLEMENT_PAYOUT,
    reversalSourceType: JournalSourceType.WAVE_SELF_SETTLEMENT_PAYOUT_REVERSAL,
    sourceId: payoutId,
    ledgerType: SalesLedgerEntryType.SETTLEMENT_PAYOUT,
    paymentId,
    postedAt,
    fallbackMemo: `Reversal of Wave self-settlement payout (${payoutId})`,
  });
}

/**
 * Merchant books when platform admin pays this business via Wave Ops (merchant id):
 *   Dr WAVE_MERCHANT_PAYOUTS   receive (money in, net after Wave payout fee)
 *   Cr other revenue (260)     receive (income)
 * Platform books receive + Wave fee as expense (P-4930). The fee is not a merchant cost.
 */
export async function postMerchantJournalForWaveOpsPayout(
  tx: Tx,
  row: {
    id: string;
    businessId: string;
    currency: string;
    receiveAmount: string;
    fee: string | null;
    name: string;
    clientReference: string | null;
    supplierName?: string | null;
  },
  postedAt?: Date | null,
): Promise<MerchantPayoutJournalResult | null> {
  const existing = await tx.journalEntry.findFirst({
    where: {
      sourceType: JournalSourceType.WAVE_OPS_MERCHANT_PAYOUT,
      sourceId: row.id,
    },
    select: { id: true },
  });
  if (existing) {
    return { id: existing.id, created: false };
  }

  await ensureDefaultChartOfAccountsForBusiness(tx, row.businessId);
  const [moneyIn, payoutRevenue] = await Promise.all([
    getChartAccountByCode(tx, row.businessId, CHART_CODE_WAVE_MERCHANT_PAYOUTS),
    getChartAccountByCode(tx, row.businessId, CHART_CODE_OTHER_REVENUE),
  ]);
  if (!moneyIn || !payoutRevenue) {
    throw new Error("Chart accounts missing for merchant Wave operations payout.");
  }

  const receive = money(row.receiveAmount);
  if (receive.lte(0)) {
    return null;
  }

  const label = row.supplierName?.trim() || row.name.trim() || row.id;
  const zero = new Prisma.Decimal(0);
  const journal = await tx.journalEntry.create({
    data: {
      postedAt: postedAt ?? new Date(),
      businessId: row.businessId,
      memo: `Wave operations payout received — ${label} (${row.currency})`,
      reference: row.clientReference,
      sourceType: JournalSourceType.WAVE_OPS_MERCHANT_PAYOUT,
      sourceId: row.id,
      journalApprovalExempt: true,
      lines: {
        create: [
          {
            chartOfAccountId: moneyIn.id,
            debitAmount: receive,
            creditAmount: zero,
            description: `Wave operations payout received — ${label}`,
          },
          {
            chartOfAccountId: payoutRevenue.id,
            debitAmount: zero,
            creditAmount: receive,
            description: `Wave operations payout revenue (net of Wave fee) — ${label}`,
          },
        ],
      },
    },
    select: { id: true },
  });

  await tx.salesLedgerEntry.create({
    data: {
      businessId: row.businessId,
      orderId: null,
      paymentId: null,
      journalEntryId: journal.id,
      type: SalesLedgerEntryType.WAVE_OPS_PAYOUT,
      direction: SalesLedgerDirection.MONEY_IN,
      status: SalesLedgerStatus.SUCCEEDED,
      amount: receive,
      currency: row.currency,
      provider: "wave gambia",
      providerPaymentRef: row.id,
      metadata: {
        receiveAmount: receive.toString(),
        fee: parseWaveFee(row.fee).toString(),
        supplierName: label,
        debitAccountCode: CHART_CODE_WAVE_MERCHANT_PAYOUTS,
        creditAccountCode: CHART_CODE_OTHER_REVENUE,
      },
    },
  });

  return { id: journal.id, created: true };
}

export async function reverseMerchantJournalForWaveOpsPayout(
  tx: Tx,
  payoutId: string,
  postedAt?: Date | null,
): Promise<MerchantPayoutJournalResult | null> {
  return reverseMerchantJournalBySource(tx, {
    sourceType: JournalSourceType.WAVE_OPS_MERCHANT_PAYOUT,
    reversalSourceType: JournalSourceType.WAVE_OPS_MERCHANT_PAYOUT_REVERSAL,
    sourceId: payoutId,
    ledgerType: SalesLedgerEntryType.WAVE_OPS_PAYOUT,
    postedAt,
    fallbackMemo: `Reversal of Wave operations payout (${payoutId})`,
  });
}

export type SyncWaveOpsMerchantLedgerResult = {
  businessId: string;
  created: boolean;
  reversed: boolean;
  receiveAmount: string;
  currency: string;
  name: string;
  journalId: string | null;
};

/**
 * Post or reverse merchant GL when a Wave Ops payout is attributed to a business merchant id.
 * Net receive is money in (WAVE_MERCHANT_PAYOUTS) and other revenue; platform expense stays on WAVE_OPS_PAYOUT.
 * Skips platform aggregator (no business link), self-settlement copies (`businessId`), and bill-linked payouts.
 */
export async function syncMerchantJournalForWaveOpsPayout(
  payoutId: string,
): Promise<SyncWaveOpsMerchantLedgerResult | null> {
  const row = await prisma.waveOpsPayout.findUnique({
    where: { id: payoutId },
    include: { supplier: { select: { name: true } } },
  });
  if (!row || row.businessId || row.platformBillId) {
    return null;
  }
  const aggregatedMerchantId = row.aggregatedMerchantId?.trim();
  if (!aggregatedMerchantId) {
    return null;
  }

  const { businessByMerchantId } = await loadWaveMerchantBusinessLinks();
  const business = businessByMerchantId.get(aggregatedMerchantId);
  if (!business) {
    return null;
  }

  const status = row.status.trim().toLowerCase();
  const reversed = status === "reversed" || Boolean(row.reversedAt);
  const name = row.supplier?.name ?? row.name;

  try {
    return await prisma.$transaction(async (tx) => {
      if (reversed) {
        const reversal = await reverseMerchantJournalForWaveOpsPayout(tx, row.id, row.reversedAt);
        return {
          businessId: business.id,
          created: Boolean(reversal?.created),
          reversed: true,
          receiveAmount: row.receiveAmount,
          currency: row.currency,
          name,
          journalId: reversal?.id ?? null,
        };
      }
      if (status !== "succeeded") {
        return null;
      }
      const posted = await postMerchantJournalForWaveOpsPayout(tx, {
        id: row.id,
        businessId: business.id,
        currency: row.currency,
        receiveAmount: row.receiveAmount,
        fee: row.fee,
        name: row.name,
        clientReference: row.clientReference,
        supplierName: name,
      });
      return {
        businessId: business.id,
        created: Boolean(posted?.created),
        reversed: false,
        receiveAmount: row.receiveAmount,
        currency: row.currency,
        name,
        journalId: posted?.id ?? null,
      };
    });
  } catch (err) {
    console.error("[wave-ops] Failed to sync merchant journal for payout", payoutId, err);
    return null;
  }
}

/** Catch up SUCCEEDED / REVERSED self-settlements that predate merchant settlement journals. No push. */
export async function backfillMerchantJournalsForSelfSettlementPayouts(
  limit = 100,
): Promise<{ scanned: number; posted: number; reversed: number; skipped: number }> {
  const take = Math.min(Math.max(limit, 1), 200);
  const missing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT p.id
    FROM "WaveSelfSettlementPayout" p
    WHERE p.status IN (
        'SUCCEEDED'::"WaveSelfSettlementPayoutStatus",
        'REVERSED'::"WaveSelfSettlementPayoutStatus"
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM "JournalEntry" j
          WHERE j."sourceType" = 'WAVE_SELF_SETTLEMENT_PAYOUT'::"JournalSourceType"
            AND j."sourceId" = p.id
        )
        OR (
          p.status = 'REVERSED'::"WaveSelfSettlementPayoutStatus"
          AND NOT EXISTS (
            SELECT 1 FROM "JournalEntry" j
            WHERE j."sourceType" = 'WAVE_SELF_SETTLEMENT_PAYOUT_REVERSAL'::"JournalSourceType"
              AND j."sourceId" = p.id
          )
        )
      )
    ORDER BY p."createdAt" ASC
    LIMIT ${take}
  `;

  let posted = 0;
  let reversed = 0;
  let skipped = 0;
  for (const { id } of missing) {
    const row = await prisma.waveSelfSettlementPayout.findUnique({ where: { id } });
    if (!row) {
      skipped += 1;
      continue;
    }
    try {
      await prisma.$transaction(async (tx) => {
        const forward = await postMerchantJournalForSelfSettlementPayout(
          tx,
          {
            id: row.id,
            businessId: row.businessId,
            paymentId: row.paymentId,
            currency: row.currency,
            receiveAmount: row.receiveAmount,
            withholdAmount: row.withholdAmount,
            fee: row.fee,
            name: row.name,
          },
          row.waveTimestamp ?? row.createdAt,
        );
        if (forward?.created) {
          posted += 1;
        }
        if (row.status === WaveSelfSettlementPayoutStatus.REVERSED) {
          const rev = await reverseMerchantJournalForSelfSettlementPayout(
            tx,
            row.id,
            row.paymentId,
            row.updatedAt,
          );
          if (rev?.created) {
            reversed += 1;
          }
        }
      });
    } catch (err) {
      skipped += 1;
      console.error("[wave-self-settlement] Failed to backfill merchant payout journal", row.id, err);
    }
  }
  if (missing.length) {
    console.info("[wave-self-settlement] backfilled merchant payout journals", {
      scanned: missing.length,
      posted,
      reversed,
      skipped,
    });
  }
  return { scanned: missing.length, posted, reversed, skipped };
}
