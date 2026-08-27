import { HttpError } from "../lib/http-error.js";
import type { WaveTransaction } from "./wave-payment.service.js";

export const WAVE_UNASSIGNED_MERCHANT_ID = "__unassigned__";
export const LOCAL_UNLINKED_MERCHANT_ID = "__local_unlinked__";
export const MAX_SUMMARY_RANGE_DAYS = 31;
const DEFAULT_CURRENCY = "GMD";
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export type WaveLinkedBusiness = {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
};

export type WaveMoneyTotals = {
  count: number;
  totalAmount: string;
  totalFee: string;
  currency: string;
};

export type LocalMoneyTotals = {
  count: number;
  totalAmount: string;
  currency: string;
};

export type MerchantDayBucket = {
  date: string;
  wave: WaveMoneyTotals;
  local: LocalMoneyTotals;
};

export type WaveMerchantSummaryRow = {
  id: string;
  name: string;
  business: WaveLinkedBusiness | null;
  days: MerchantDayBucket[];
  waveTotals: WaveMoneyTotals;
  localTotals: LocalMoneyTotals;
};

export type WaveMerchantTransactionSummary = {
  from: string;
  to: string;
  merchants: WaveMerchantSummaryRow[];
  unassignedWave: {
    days: Array<{ date: string; wave: WaveMoneyTotals }>;
    totals: WaveMoneyTotals;
  };
  unlinkedLocal: {
    days: Array<{ date: string; local: LocalMoneyTotals }>;
    totals: LocalMoneyTotals;
    businesses: WaveLinkedBusiness[];
  };
};

export type LocalPaymentDayAgg = {
  businessId: string;
  saleDate: string;
  count: number;
  totalAmount: string;
  currency: string;
};

export type MerchantIdentity = {
  id: string;
  name: string;
  business: WaveLinkedBusiness | null;
};

export function parseYmdUtc(raw: string, label: string): Date {
  const t = raw.trim();
  if (!YMD_RE.test(t)) {
    throw new HttpError(400, `${label} must be YYYY-MM-DD.`);
  }
  const d = new Date(`${t}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t) {
    throw new HttpError(400, `Invalid ${label} date.`);
  }
  return d;
}

export function endOfUtcDayFromYmd(raw: string): Date {
  const d = parseYmdUtc(raw, "to");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/** Inclusive UTC calendar days, capped at {@link MAX_SUMMARY_RANGE_DAYS}. */
export function inclusiveYmdRange(
  fromRaw: string,
  toRaw: string,
  maxDays = MAX_SUMMARY_RANGE_DAYS,
): string[] {
  const from = parseYmdUtc(fromRaw, "from");
  const to = parseYmdUtc(toRaw, "to");
  if (from.getTime() > to.getTime()) {
    throw new HttpError(400, "From date must be on or before to date.");
  }
  const dates: string[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
    if (dates.length > maxDays) {
      throw new HttpError(400, `Date range cannot exceed ${maxDays} days.`);
    }
  }
  return dates;
}

export function emptyWaveTotals(currency = DEFAULT_CURRENCY): WaveMoneyTotals {
  return { count: 0, totalAmount: "0.00", totalFee: "0.00", currency };
}

export function emptyLocalTotals(currency = DEFAULT_CURRENCY): LocalMoneyTotals {
  return { count: 0, totalAmount: "0.00", currency };
}

function parseMoneyToCents(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.round(n * 100);
}

function centsToMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function addMoney(a: string, b: string): string {
  return centsToMoney(parseMoneyToCents(a) + parseMoneyToCents(b));
}

export function addWaveTotals(into: WaveMoneyTotals, add: WaveMoneyTotals): WaveMoneyTotals {
  return {
    count: into.count + add.count,
    totalAmount: addMoney(into.totalAmount, add.totalAmount),
    totalFee: addMoney(into.totalFee, add.totalFee),
    currency: add.count > 0 ? add.currency : into.currency,
  };
}

export function addLocalTotals(into: LocalMoneyTotals, add: LocalMoneyTotals): LocalMoneyTotals {
  return {
    count: into.count + add.count,
    totalAmount: addMoney(into.totalAmount, add.totalAmount),
    currency: add.count > 0 ? add.currency : into.currency,
  };
}

function waveTotalsFromTx(tx: WaveTransaction): WaveMoneyTotals {
  return {
    count: 1,
    totalAmount: centsToMoney(parseMoneyToCents(tx.amount)),
    totalFee: centsToMoney(parseMoneyToCents(tx.fee)),
    currency: (tx.currency || DEFAULT_CURRENCY).toUpperCase(),
  };
}

export function merchantIdFromWaveTx(tx: WaveTransaction): string {
  return tx.aggregated_merchant_id?.trim() || WAVE_UNASSIGNED_MERCHANT_ID;
}

/** Group one day's Wave parent-wallet rows by aggregated merchant (or unassigned). */
export function groupWaveTransactionsForDate(
  items: WaveTransaction[],
): Map<string, { name: string | null; totals: WaveMoneyTotals }> {
  const out = new Map<string, { name: string | null; totals: WaveMoneyTotals }>();
  for (const tx of items) {
    const id = merchantIdFromWaveTx(tx);
    const name = tx.aggregated_merchant_name?.trim() || null;
    const existing = out.get(id);
    const piece = waveTotalsFromTx(tx);
    if (!existing) {
      out.set(id, { name, totals: piece });
      continue;
    }
    out.set(id, {
      name: existing.name || name,
      totals: addWaveTotals(existing.totals, piece),
    });
  }
  return out;
}

export function assignLocalAggsToMerchants(
  aggs: LocalPaymentDayAgg[],
  merchantIdByBusinessId: Map<string, string>,
): {
  byMerchant: Map<string, LocalPaymentDayAgg[]>;
  unlinked: LocalPaymentDayAgg[];
} {
  const byMerchant = new Map<string, LocalPaymentDayAgg[]>();
  const unlinked: LocalPaymentDayAgg[] = [];
  for (const agg of aggs) {
    const merchantId = merchantIdByBusinessId.get(agg.businessId);
    if (!merchantId) {
      unlinked.push(agg);
      continue;
    }
    const list = byMerchant.get(merchantId);
    if (list) {
      list.push(agg);
    } else {
      byMerchant.set(merchantId, [agg]);
    }
  }
  return { byMerchant, unlinked };
}

export function localTotalsFromAgg(agg: LocalPaymentDayAgg): LocalMoneyTotals {
  return {
    count: agg.count,
    totalAmount: centsToMoney(parseMoneyToCents(agg.totalAmount)),
    currency: (agg.currency || DEFAULT_CURRENCY).toUpperCase(),
  };
}

function daysWithActivity(
  dates: string[],
  waveByDate: Map<string, WaveMoneyTotals>,
  localByDate: Map<string, LocalMoneyTotals>,
): MerchantDayBucket[] {
  const days: MerchantDayBucket[] = [];
  for (const date of dates) {
    const wave = waveByDate.get(date) ?? emptyWaveTotals();
    const local = localByDate.get(date) ?? emptyLocalTotals();
    if (wave.count === 0 && local.count === 0) {
      continue;
    }
    days.push({ date, wave, local });
  }
  return days;
}

function sumWaveDays(days: MerchantDayBucket[]): WaveMoneyTotals {
  return days.reduce((acc, d) => addWaveTotals(acc, d.wave), emptyWaveTotals());
}

function sumLocalDays(days: MerchantDayBucket[]): LocalMoneyTotals {
  return days.reduce((acc, d) => addLocalTotals(acc, d.local), emptyLocalTotals());
}

export function mergeMerchantTransactionSummary(input: {
  from: string;
  to: string;
  dates: string[];
  merchants: MerchantIdentity[];
  waveByMerchantDate: Map<string, Map<string, WaveMoneyTotals>>;
  waveMerchantNames: Map<string, string>;
  localByMerchantDate: Map<string, Map<string, LocalMoneyTotals>>;
  unassignedWaveByDate: Map<string, WaveMoneyTotals>;
  unlinkedLocalByDate: Map<string, LocalMoneyTotals>;
  unlinkedLocalBusinesses: WaveLinkedBusiness[];
}): WaveMerchantTransactionSummary {
  const seen = new Set(input.merchants.map((m) => m.id));
  const merchants: MerchantIdentity[] = [...input.merchants];

  for (const id of input.waveByMerchantDate.keys()) {
    if (id === WAVE_UNASSIGNED_MERCHANT_ID || seen.has(id)) {
      continue;
    }
    seen.add(id);
    merchants.push({
      id,
      name: input.waveMerchantNames.get(id) || id,
      business: null,
    });
  }
  for (const id of input.localByMerchantDate.keys()) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    merchants.push({
      id,
      name: input.waveMerchantNames.get(id) || id,
      business: null,
    });
  }

  const rows: WaveMerchantSummaryRow[] = merchants.map((m) => {
    const waveByDate = input.waveByMerchantDate.get(m.id) ?? new Map();
    const localByDate = input.localByMerchantDate.get(m.id) ?? new Map();
    const days = daysWithActivity(input.dates, waveByDate, localByDate);
    return {
      id: m.id,
      name: m.name,
      business: m.business,
      days,
      waveTotals: sumWaveDays(days),
      localTotals: sumLocalDays(days),
    };
  });

  rows.sort((a, b) => {
    const waveDelta =
      parseMoneyToCents(b.waveTotals.totalAmount) - parseMoneyToCents(a.waveTotals.totalAmount);
    if (waveDelta !== 0) {
      return waveDelta;
    }
    return a.name.localeCompare(b.name);
  });

  const unassignedDays = input.dates
    .map((date) => ({ date, wave: input.unassignedWaveByDate.get(date) ?? emptyWaveTotals() }))
    .filter((d) => d.wave.count > 0);
  const unlinkedDays = input.dates
    .map((date) => ({ date, local: input.unlinkedLocalByDate.get(date) ?? emptyLocalTotals() }))
    .filter((d) => d.local.count > 0);

  return {
    from: input.from,
    to: input.to,
    merchants: rows,
    unassignedWave: {
      days: unassignedDays,
      totals: unassignedDays.reduce((acc, d) => addWaveTotals(acc, d.wave), emptyWaveTotals()),
    },
    unlinkedLocal: {
      days: unlinkedDays,
      totals: unlinkedDays.reduce((acc, d) => addLocalTotals(acc, d.local), emptyLocalTotals()),
      businesses: input.unlinkedLocalBusinesses,
    },
  };
}

export function putWaveDay(
  waveByMerchantDate: Map<string, Map<string, WaveMoneyTotals>>,
  merchantId: string,
  date: string,
  totals: WaveMoneyTotals,
) {
  let byDate = waveByMerchantDate.get(merchantId);
  if (!byDate) {
    byDate = new Map();
    waveByMerchantDate.set(merchantId, byDate);
  }
  byDate.set(date, totals);
}

export function putLocalDay(
  localByMerchantDate: Map<string, Map<string, LocalMoneyTotals>>,
  merchantId: string,
  date: string,
  totals: LocalMoneyTotals,
) {
  let byDate = localByMerchantDate.get(merchantId);
  if (!byDate) {
    byDate = new Map();
    localByMerchantDate.set(merchantId, byDate);
  }
  const existing = byDate.get(date);
  byDate.set(date, existing ? addLocalTotals(existing, totals) : totals);
}
