import { PlatformJournalSourceType, Prisma } from "@prisma/client";

import {
  ensureDefaultPlatformChartAccounts,
  PLATFORM_CHART_AGGREGATOR_WAVE_CLEARING,
  PLATFORM_CHART_SELF_SETTLEMENT_PAYOUTS,
  PLATFORM_CHART_SELF_SETTLEMENT_WITHHOLD,
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

/**
 * On a succeeded aggregator self-settlement payout:
 *   Dr P-4920 payout cost     receive + Wave fee
 *   Cr P-1200 clearing        receive + Wave fee
 *   Dr P-1200 clearing        withhold
 *   Cr P-4010 withhold revenue withhold
 * Idempotent on WaveSelfSettlementPayout.id. Merchant is stored on the journal (`businessId`).
 */
export async function postPlatformJournalForSelfSettlementPayout(
  tx: Tx,
  row: {
    id: string;
    businessId: string;
    paymentId: string;
    currency: string;
    receiveAmount: Prisma.Decimal;
    withholdAmount: Prisma.Decimal;
    fee: string | null;
  },
): Promise<string | null> {
  await ensureDefaultPlatformChartAccounts(tx);

  const existing = await tx.platformJournalEntry.findFirst({
    where: {
      sourceType: PlatformJournalSourceType.WAVE_SELF_SETTLEMENT,
      sourceId: row.id,
    },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  const [clearing, payoutCost, withholdRevenue, business] = await Promise.all([
    tx.platformChartOfAccount.findUnique({
      where: { code: PLATFORM_CHART_AGGREGATOR_WAVE_CLEARING },
    }),
    tx.platformChartOfAccount.findUnique({
      where: { code: PLATFORM_CHART_SELF_SETTLEMENT_PAYOUTS },
    }),
    tx.platformChartOfAccount.findUnique({
      where: { code: PLATFORM_CHART_SELF_SETTLEMENT_WITHHOLD },
    }),
    tx.business.findUnique({
      where: { id: row.businessId },
      select: { name: true },
    }),
  ]);

  if (!clearing || !payoutCost || !withholdRevenue) {
    throw new Error("Platform chart accounts missing for Wave self-settlement.");
  }

  const receive = money(row.receiveAmount);
  const fee = parseWaveFee(row.fee);
  const payoutTotal = receive.plus(fee);
  const withhold = money(row.withholdAmount);
  if (payoutTotal.lte(0) && withhold.lte(0)) {
    return null;
  }

  const label = business?.name?.trim() || row.businessId;
  const lines: Array<{
    chartOfAccountId: string;
    debitAmount: Prisma.Decimal;
    creditAmount: Prisma.Decimal;
    description: string;
  }> = [];
  const zero = new Prisma.Decimal(0);

  if (payoutTotal.gt(0)) {
    lines.push(
      {
        chartOfAccountId: payoutCost.id,
        debitAmount: payoutTotal,
        creditAmount: zero,
        description: `Self-settlement payout — ${label}`,
      },
      {
        chartOfAccountId: clearing.id,
        debitAmount: zero,
        creditAmount: payoutTotal,
        description: `Wave wallet out — ${label}`,
      },
    );
  }
  if (withhold.gt(0)) {
    lines.push(
      {
        chartOfAccountId: clearing.id,
        debitAmount: withhold,
        creditAmount: zero,
        description: `Withhold retained — ${label}`,
      },
      {
        chartOfAccountId: withholdRevenue.id,
        debitAmount: zero,
        creditAmount: withhold,
        description: `Self-settlement withhold — ${label}`,
      },
    );
  }

  const entry = await tx.platformJournalEntry.create({
    data: {
      postedAt: new Date(),
      memo: `Wave self-settlement — ${label} (${row.currency})`,
      reference: row.paymentId,
      sourceType: PlatformJournalSourceType.WAVE_SELF_SETTLEMENT,
      sourceId: row.id,
      businessId: row.businessId,
      lines: { create: lines },
    },
    select: { id: true },
  });

  return entry.id;
}
