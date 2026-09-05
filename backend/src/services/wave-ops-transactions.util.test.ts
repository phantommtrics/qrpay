import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HttpError } from "../lib/http-error.js";
import type { WaveTransaction, WaveTransactionsResponse } from "./wave-payment.service.js";
import {
  WAVE_UNASSIGNED_MERCHANT_ID,
  clientReferencesForWaveReversals,
  collectAllWaveOpsTransactions,
  collectWaveOpsTransactionPage,
  decodeWaveOpsTxCursor,
  encodeWaveOpsTxCursor,
  isWaveTransactionReversal,
  matchesWaveOpsMerchant,
  resolveWaveOpsTxRange,
  waveTransactionDescription,
} from "./wave-ops-transactions.util.js";

function tx(
  partial: Partial<WaveTransaction> & Pick<WaveTransaction, "transaction_id">,
): WaveTransaction {
  return {
    timestamp: "2026-09-01T10:00:00Z",
    amount: "100",
    fee: "1",
    currency: "GMD",
    ...partial,
  };
}

function page(
  items: WaveTransaction[],
  opts?: { hasNext?: boolean; endCursor?: string | null; date?: string },
): WaveTransactionsResponse {
  return {
    date: opts?.date ?? "2026-09-01",
    items,
    page_info: {
      has_next_page: Boolean(opts?.hasNext),
      end_cursor: opts?.endCursor ?? null,
    },
  };
}

describe("resolveWaveOpsTxRange", () => {
  it("uses date as both ends", () => {
    assert.deepEqual(resolveWaveOpsTxRange({ date: "2026-09-01" }), {
      from: "2026-09-01",
      to: "2026-09-01",
    });
  });

  it("prefers from/to over date", () => {
    assert.deepEqual(resolveWaveOpsTxRange({ date: "2026-09-01", from: "2026-09-02", to: "2026-09-04" }), {
      from: "2026-09-02",
      to: "2026-09-04",
    });
  });

  it("rejects missing range", () => {
    assert.throws(() => resolveWaveOpsTxRange({}), (e) => e instanceof HttpError && e.statusCode === 400);
  });
});

describe("wave ops transaction cursor", () => {
  it("round-trips date-only and date+after", () => {
    assert.equal(encodeWaveOpsTxCursor({ date: "2026-09-01" }), "2026-09-01");
    assert.deepEqual(decodeWaveOpsTxCursor("2026-09-01"), { date: "2026-09-01" });
    assert.equal(encodeWaveOpsTxCursor({ date: "2026-09-01", after: "abc" }), "2026-09-01:abc");
    assert.deepEqual(decodeWaveOpsTxCursor("2026-09-01:abc:def"), {
      date: "2026-09-01",
      after: "abc:def",
    });
  });

  it("rejects malformed cursors", () => {
    assert.throws(() => decodeWaveOpsTxCursor("nope"), (e) => e instanceof HttpError);
  });
});

describe("matchesWaveOpsMerchant", () => {
  it("matches all, assigned, and unassigned", () => {
    const assigned = tx({ transaction_id: "a", aggregated_merchant_id: "am_1" });
    const unassigned = tx({ transaction_id: "b" });
    assert.equal(matchesWaveOpsMerchant(assigned), true);
    assert.equal(matchesWaveOpsMerchant(assigned, "am_1"), true);
    assert.equal(matchesWaveOpsMerchant(assigned, "am_2"), false);
    assert.equal(matchesWaveOpsMerchant(unassigned, WAVE_UNASSIGNED_MERCHANT_ID), true);
    assert.equal(matchesWaveOpsMerchant(assigned, WAVE_UNASSIGNED_MERCHANT_ID), false);
  });
});

describe("wave transaction reversals", () => {
  it("detects is_reversal and refund/reversal types", () => {
    assert.equal(isWaveTransactionReversal(tx({ transaction_id: "a", is_reversal: true })), true);
    assert.equal(
      isWaveTransactionReversal(tx({ transaction_id: "b", transaction_type: "api_checkout_refund" })),
      true,
    );
    assert.equal(
      isWaveTransactionReversal(tx({ transaction_id: "c", transaction_type: "api_payout_reversal" })),
      true,
    );
    assert.equal(
      isWaveTransactionReversal(tx({ transaction_id: "d", transaction_type: "api_checkout" })),
      false,
    );
  });

  it("uses the original client_reference when the reversal row omits it", () => {
    assert.deepEqual(
      clientReferencesForWaveReversals([
        tx({
          transaction_id: "T_1",
          client_reference: "order_1",
          transaction_type: "api_checkout",
        }),
        tx({
          transaction_id: "T_1",
          is_reversal: true,
          amount: "-100",
        }),
        tx({
          transaction_id: "T_2",
          client_reference: "inv_2",
          transaction_type: "api_checkout_refund",
        }),
      ]),
      ["order_1", "inv_2"],
    );
  });
});

describe("waveTransactionDescription", () => {
  it("prefers payment_reason over transaction type", () => {
    assert.equal(
      waveTransactionDescription(
        tx({
          transaction_id: "a",
          payment_reason: "Invoice INV-9",
          transaction_type: "api_checkout",
        }),
      ),
      "Invoice INV-9",
    );
    assert.equal(
      waveTransactionDescription(tx({ transaction_id: "b", transaction_type: "api_payout" })),
      "Payout",
    );
    assert.equal(waveTransactionDescription(tx({ transaction_id: "c" })), "");
  });
});

describe("collectWaveOpsTransactionPage", () => {
  it("returns one Wave page and a next-day cursor when the day is exhausted", async () => {
    const calls: Array<{ date: string; after?: string }> = [];
    const result = await collectWaveOpsTransactionPage({
      dates: ["2026-09-01", "2026-09-02"],
      startDate: "2026-09-01",
      fetchPage: async (date, after) => {
        calls.push({ date, after });
        return page([tx({ transaction_id: "t1" })], { date, hasNext: false });
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(result.items[0]?.transaction_id, "t1");
    assert.equal(result.hasNext, true);
    assert.equal(result.endCursor, "2026-09-02");
  });

  it("skips empty merchant-filtered pages until a match", async () => {
    const result = await collectWaveOpsTransactionPage({
      dates: ["2026-09-01", "2026-09-02"],
      startDate: "2026-09-01",
      merchant: "am_1",
      fetchPage: async (date) => {
        if (date === "2026-09-01") {
          return page([tx({ transaction_id: "skip" })], { date });
        }
        return page([tx({ transaction_id: "hit", aggregated_merchant_id: "am_1" })], { date });
      },
    });
    assert.deepEqual(
      result.items.map((t) => t.transaction_id),
      ["hit"],
    );
    assert.equal(result.hasNext, false);
  });

  it("continues Wave cursor on the same day", async () => {
    const result = await collectWaveOpsTransactionPage({
      dates: ["2026-09-01"],
      startDate: "2026-09-01",
      fetchPage: async (_date, after) => {
        if (!after) {
          return page([tx({ transaction_id: "p1" })], { hasNext: true, endCursor: "c1" });
        }
        return page([tx({ transaction_id: "p2" })], { hasNext: false, endCursor: null });
      },
    });
    assert.equal(result.items[0]?.transaction_id, "p1");
    assert.equal(result.hasNext, true);
    assert.equal(result.endCursor, "2026-09-01:c1");
  });
});

describe("collectAllWaveOpsTransactions", () => {
  it("walks every day and Wave page, then filters", async () => {
    const result = await collectAllWaveOpsTransactions({
      dates: ["2026-09-01", "2026-09-02"],
      merchant: "am_1",
      fetchPage: async (date, after) => {
        if (date === "2026-09-01" && !after) {
          return page(
            [tx({ transaction_id: "a", aggregated_merchant_id: "am_1" }), tx({ transaction_id: "b" })],
            { hasNext: true, endCursor: "n1", date },
          );
        }
        if (date === "2026-09-01") {
          return page([tx({ transaction_id: "c", aggregated_merchant_id: "am_2" })], { date });
        }
        return page([tx({ transaction_id: "d", aggregated_merchant_id: "am_1" })], { date });
      },
    });
    assert.deepEqual(
      result.items.map((t) => t.transaction_id),
      ["a", "d"],
    );
    assert.equal(result.hasNext, false);
  });

  it("continues from a mid-range cursor", async () => {
    const datesCalled: string[] = [];
    const result = await collectAllWaveOpsTransactions({
      dates: ["2026-09-01", "2026-09-02", "2026-09-03"],
      startDate: "2026-09-02",
      startAfter: "c2",
      fetchPage: async (date, after) => {
        datesCalled.push(`${date}:${after ?? ""}`);
        return page([tx({ transaction_id: `${date}-${after || "start"}` })], { date });
      },
    });
    assert.deepEqual(datesCalled, ["2026-09-02:c2", "2026-09-03:"]);
    assert.deepEqual(
      result.items.map((t) => t.transaction_id),
      ["2026-09-02-c2", "2026-09-03-start"],
    );
  });
});
