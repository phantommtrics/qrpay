import { Prisma } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { loadWaveMerchantBusinessLinks } from "./wave-aggregated-merchant.service.js";
import { isPlatformWaveCheckoutConfigured, waveServiceFromEnv } from "./wave-client-env.js";
import { syncLocalWaveReversalsFromTransactions } from "./wave-merchant-payment-reversal.service.js";
import type { WaveAggregatedMerchant } from "./wave-payment.service.js";
import {
  WAVE_UNASSIGNED_MERCHANT_ID,
  addLocalTotals,
  assignLocalAggsToMerchants,
  groupWaveTransactionsForDate,
  inclusiveYmdRange,
  localTotalsFromAgg,
  mergeMerchantTransactionSummary,
  parseYmdUtc,
  endOfUtcDayFromYmd,
  putLocalDay,
  putWaveDay,
  type LocalPaymentDayAgg,
  type LocalMoneyTotals,
  type MerchantIdentity,
  type WaveLinkedBusiness,
  type WaveMerchantTransactionSummary,
  type WaveMoneyTotals,
} from "./wave-merchant-tx-summary.util.js";

export {
  WAVE_UNASSIGNED_MERCHANT_ID,
  LOCAL_UNLINKED_MERCHANT_ID,
  MAX_SUMMARY_RANGE_DAYS,
  addMoney,
  assignLocalAggsToMerchants,
  emptyLocalTotals,
  emptyWaveTotals,
  groupWaveTransactionsForDate,
  inclusiveYmdRange,
  mergeMerchantTransactionSummary,
  merchantIdFromWaveTx,
} from "./wave-merchant-tx-summary.util.js";
export type {
  LocalMoneyTotals,
  LocalPaymentDayAgg,
  MerchantDayBucket,
  MerchantIdentity,
  WaveLinkedBusiness,
  WaveMerchantSummaryRow,
  WaveMerchantTransactionSummary,
  WaveMoneyTotals,
} from "./wave-merchant-tx-summary.util.js";

const DEFAULT_CURRENCY = "GMD";

function ymdFromSqlDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return String(value ?? "").slice(0, 10);
}

type RawLocalAggRow = {
  businessId: string;
  saleDate: unknown;
  count: number | bigint;
  totalAmount: unknown;
  currency: string | null;
};

async function loadLocalWavePaymentAggs(fromYmd: string, toYmd: string): Promise<LocalPaymentDayAgg[]> {
  const from = parseYmdUtc(fromYmd, "from");
  const to = endOfUtcDayFromYmd(toYmd);
  const rows = await prisma.$queryRaw<RawLocalAggRow[]>(Prisma.sql`
    SELECT
      p."businessId" AS "businessId",
      (date_trunc('day', p."completedAt" AT TIME ZONE 'UTC'))::date AS "saleDate",
      COUNT(*)::int AS "count",
      COALESCE(SUM(p."amount"::numeric), 0) AS "totalAmount",
      MAX(p."currency") AS "currency"
    FROM "Payment" p
    WHERE p."provider" = 'WAVE_GAMBIA'::"PaymentProvider"
      AND p."status" = 'COMPLETED'::"PaymentStatus"
      AND p."completedAt" IS NOT NULL
      AND p."completedAt" >= ${from}
      AND p."completedAt" <= ${to}
    GROUP BY
      p."businessId",
      (date_trunc('day', p."completedAt" AT TIME ZONE 'UTC'))::date
  `);

  return rows.map((r) => ({
    businessId: r.businessId,
    saleDate: ymdFromSqlDate(r.saleDate),
    count: Number(r.count) || 0,
    totalAmount: String(r.totalAmount ?? "0"),
    currency: (r.currency || DEFAULT_CURRENCY).toUpperCase(),
  }));
}

async function loadBusinessesByIds(ids: string[]): Promise<WaveLinkedBusiness[]> {
  if (ids.length === 0) {
    return [];
  }
  return prisma.business.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, slug: true, ownerEmail: true },
    orderBy: { name: "asc" },
  });
}

export async function getWaveMerchantTransactionSummary(input: {
  from?: string;
  to?: string;
}): Promise<WaveMerchantTransactionSummary> {
  if (!isPlatformWaveCheckoutConfigured()) {
    throw new HttpError(503, "Wave is not configured (WAVE_CHECKOUT_BEARER).");
  }

  const today = new Date().toISOString().slice(0, 10);
  const from = (input.from ?? today).trim() || today;
  const to = (input.to ?? from).trim() || from;
  const dates = inclusiveYmdRange(from, to);

  const wave = waveServiceFromEnv();
  const [merchantsFromWave, links] = await Promise.all([
    wave.listAllAggregatedMerchants(),
    loadWaveMerchantBusinessLinks(),
  ]);

  const waveByMerchantDate = new Map<string, Map<string, WaveMoneyTotals>>();
  const waveMerchantNames = new Map<string, string>();
  const unassignedWaveByDate = new Map<string, WaveMoneyTotals>();

  for (const date of dates) {
    const items = await wave.listAllTransactionsForDate(date);
    await syncLocalWaveReversalsFromTransactions(items);
    const grouped = groupWaveTransactionsForDate(items);
    for (const [merchantId, { name, totals }] of grouped) {
      if (name) {
        waveMerchantNames.set(merchantId, name);
      }
      if (merchantId === WAVE_UNASSIGNED_MERCHANT_ID) {
        unassignedWaveByDate.set(date, totals);
        continue;
      }
      putWaveDay(waveByMerchantDate, merchantId, date, totals);
    }
  }

  const localAggs = await loadLocalWavePaymentAggs(from, to);
  const { byMerchant: localByMerchant, unlinked } = assignLocalAggsToMerchants(
    localAggs,
    links.merchantIdByBusinessId,
  );

  const localByMerchantDate = new Map<string, Map<string, LocalMoneyTotals>>();
  for (const [merchantId, aggs] of localByMerchant) {
    for (const agg of aggs) {
      putLocalDay(localByMerchantDate, merchantId, agg.saleDate, localTotalsFromAgg(agg));
    }
  }

  const unlinkedLocalByDate = new Map<string, LocalMoneyTotals>();
  const unlinkedBusinessIds = new Set<string>();
  for (const agg of unlinked) {
    unlinkedBusinessIds.add(agg.businessId);
    const existing = unlinkedLocalByDate.get(agg.saleDate);
    const piece = localTotalsFromAgg(agg);
    unlinkedLocalByDate.set(agg.saleDate, existing ? addLocalTotals(existing, piece) : piece);
  }

  const unlinkedLocalBusinesses = await loadBusinessesByIds([...unlinkedBusinessIds]);

  const merchants: MerchantIdentity[] = merchantsFromWave.map((m: WaveAggregatedMerchant) => ({
    id: m.id,
    name: m.name,
    business: links.businessByMerchantId.get(m.id) ?? null,
  }));

  return mergeMerchantTransactionSummary({
    from,
    to,
    dates,
    merchants,
    waveByMerchantDate,
    waveMerchantNames,
    localByMerchantDate,
    unassignedWaveByDate,
    unlinkedLocalByDate,
    unlinkedLocalBusinesses,
  });
}
