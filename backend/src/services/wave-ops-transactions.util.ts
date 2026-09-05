import { HttpError } from "../lib/http-error.js";
import {
  inclusiveYmdRange,
  merchantIdFromWaveTx,
  WAVE_UNASSIGNED_MERCHANT_ID,
} from "./wave-merchant-tx-summary.util.js";
import type { WaveTransaction, WaveTransactionsResponse } from "./wave-payment.service.js";

export { WAVE_UNASSIGNED_MERCHANT_ID };

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_INTERNAL_PAGES = 40;

export const WAVE_TX_TYPE_LABELS: Record<string, string> = {
  merchant_payment: "Merchant payment",
  merchant_payment_refund: "Merchant payment refund",
  api_checkout: "Checkout payment",
  api_checkout_refund: "Checkout refund",
  api_payout: "Payout",
  api_payout_reversal: "Payout reversal",
  bulk_payment: "Bulk payment",
  bulk_payment_reversal: "Bulk payment reversal",
  b2b_payment: "Business-to-business payment",
  b2b_payment_reversal: "Business-to-business reversal",
  merchant_sweep: "Merchant sweep",
};

export type WaveOpsTxCursor = {
  date: string;
  after?: string;
};

export type WaveOpsTxPage = {
  items: WaveTransaction[];
  endCursor: string | null;
  hasNext: boolean;
};

export function resolveWaveOpsTxRange(input: {
  date?: string;
  from?: string;
  to?: string;
}): { from: string; to: string } {
  const from = (input.from || input.date || "").trim();
  const to = (input.to || input.from || input.date || "").trim();
  if (!from || !to) {
    throw new HttpError(400, "from and to (or date) must be YYYY-MM-DD.");
  }
  return { from, to };
}

export function encodeWaveOpsTxCursor(cursor: WaveOpsTxCursor): string {
  const after = cursor.after?.trim() ?? "";
  return after ? `${cursor.date}:${after}` : cursor.date;
}

export function decodeWaveOpsTxCursor(raw: string): WaveOpsTxCursor {
  const t = raw.trim();
  const date = t.slice(0, 10);
  if (!YMD_RE.test(date)) {
    throw new HttpError(400, "Invalid pagination cursor.");
  }
  if (t.length === 10) {
    return { date };
  }
  if (t[10] !== ":") {
    throw new HttpError(400, "Invalid pagination cursor.");
  }
  const after = t.slice(11).trim();
  return after ? { date, after } : { date };
}

export function matchesWaveOpsMerchant(
  tx: WaveTransaction,
  merchant?: string | null,
): boolean {
  const wanted = merchant?.trim();
  if (!wanted) {
    return true;
  }
  return merchantIdFromWaveTx(tx) === wanted;
}

export function waveTransactionTypeLabel(type?: string | null): string {
  const key = type?.trim();
  if (!key) {
    return "";
  }
  return WAVE_TX_TYPE_LABELS[key] ?? key.replace(/_/g, " ");
}

/** Wave has no `description` field; use payment_reason, then transaction type. */
export function waveTransactionDescription(tx: WaveTransaction): string {
  const reason = tx.payment_reason?.trim();
  if (reason) {
    return reason;
  }
  return waveTransactionTypeLabel(tx.transaction_type);
}

export async function collectWaveOpsTransactionPage(opts: {
  dates: string[];
  startDate: string;
  startAfter?: string;
  merchant?: string;
  fetchPage: (date: string, after?: string) => Promise<WaveTransactionsResponse>;
  minItems?: number;
  maxInternalPages?: number;
}): Promise<WaveOpsTxPage> {
  const dates = opts.dates;
  const startIdx = dates.indexOf(opts.startDate);
  if (startIdx < 0) {
    throw new HttpError(400, "Pagination cursor is outside the selected date range.");
  }

  const minItems = opts.minItems ?? 1;
  const maxInternalPages = opts.maxInternalPages ?? MAX_INTERNAL_PAGES;
  const items: WaveTransaction[] = [];
  let dateIdx = startIdx;
  let waveAfter = opts.startAfter?.trim() || undefined;
  let internalPages = 0;

  while (dateIdx < dates.length && internalPages < maxInternalPages) {
    const date = dates[dateIdx];
    const res = await opts.fetchPage(date, waveAfter);
    internalPages += 1;
    items.push(...(res.items ?? []).filter((tx) => matchesWaveOpsMerchant(tx, opts.merchant)));

    const nextWaveCursor = res.page_info?.end_cursor?.trim() || "";
    const waveHasNext = Boolean(res.page_info?.has_next_page && nextWaveCursor);

    if (waveHasNext) {
      if (items.length >= minItems) {
        return {
          items,
          endCursor: encodeWaveOpsTxCursor({ date, after: nextWaveCursor }),
          hasNext: true,
        };
      }
      waveAfter = nextWaveCursor;
      continue;
    }

    const nextDate = dates[dateIdx + 1];
    if (nextDate) {
      if (items.length >= minItems) {
        return {
          items,
          endCursor: encodeWaveOpsTxCursor({ date: nextDate }),
          hasNext: true,
        };
      }
      dateIdx += 1;
      waveAfter = undefined;
      continue;
    }

    return { items, endCursor: null, hasNext: false };
  }

  if (dateIdx < dates.length) {
    const date = dates[dateIdx];
    return {
      items,
      endCursor: encodeWaveOpsTxCursor({ date, after: waveAfter }),
      hasNext: true,
    };
  }

  return { items, endCursor: null, hasNext: false };
}

export async function collectAllWaveOpsTransactions(opts: {
  dates: string[];
  merchant?: string;
  fetchPage: (date: string, after?: string) => Promise<WaveTransactionsResponse>;
  maxPagesPerDay?: number;
}): Promise<WaveTransaction[]> {
  const maxPagesPerDay = opts.maxPagesPerDay ?? 50;
  const items: WaveTransaction[] = [];
  for (const date of opts.dates) {
    let after: string | undefined;
    for (let page = 0; page < maxPagesPerDay; page += 1) {
      const res = await opts.fetchPage(date, after);
      items.push(...(res.items ?? []).filter((tx) => matchesWaveOpsMerchant(tx, opts.merchant)));
      if (!res.page_info?.has_next_page) {
        break;
      }
      const cursor = res.page_info.end_cursor?.trim();
      if (!cursor) {
        break;
      }
      after = cursor;
    }
  }
  return items;
}

export function waveOpsDatesForRange(from: string, to: string): string[] {
  return inclusiveYmdRange(from, to);
}
