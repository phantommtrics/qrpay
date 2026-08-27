import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HttpError } from "../lib/http-error.js";
import type { WaveTransaction } from "./wave-payment.service.js";
import {
  WAVE_UNASSIGNED_MERCHANT_ID,
  addMoney,
  assignLocalAggsToMerchants,
  emptyLocalTotals,
  emptyWaveTotals,
  groupWaveTransactionsForDate,
  inclusiveYmdRange,
  localTotalsFromAgg,
  mergeMerchantTransactionSummary,
  merchantIdFromWaveTx,
  putLocalDay,
  putWaveDay,
} from "./wave-merchant-tx-summary.util.js";

function tx(partial: Partial<WaveTransaction> & Pick<WaveTransaction, "transaction_id">): WaveTransaction {
  return {
    timestamp: "2026-08-27T10:00:00Z",
    amount: "100",
    fee: "1",
    currency: "GMD",
    ...partial,
  };
}

describe("inclusiveYmdRange", () => {
  it("returns inclusive UTC days", () => {
    assert.deepEqual(inclusiveYmdRange("2026-08-01", "2026-08-03"), [
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });

  it("rejects inverted range and ranges over 31 days", () => {
    assert.throws(() => inclusiveYmdRange("2026-08-03", "2026-08-01"), HttpError);
    assert.throws(() => inclusiveYmdRange("2026-07-01", "2026-08-02"), HttpError);
  });
});

describe("groupWaveTransactionsForDate", () => {
  it("groups assigned merchants and unassigned rows separately", () => {
    const grouped = groupWaveTransactionsForDate([
      tx({
        transaction_id: "T1",
        amount: "99",
        fee: "1",
        aggregated_merchant_id: "am-a",
        aggregated_merchant_name: "Kaira",
      }),
      tx({
        transaction_id: "T2",
        amount: "50",
        fee: "2",
        aggregated_merchant_id: "am-a",
        aggregated_merchant_name: "Kaira",
      }),
      tx({
        transaction_id: "T3",
        amount: "-30",
        fee: "1",
      }),
    ]);

    const assigned = grouped.get("am-a");
    assert.ok(assigned);
    assert.equal(assigned.name, "Kaira");
    assert.equal(assigned.totals.count, 2);
    assert.equal(assigned.totals.totalAmount, "149.00");
    assert.equal(assigned.totals.totalFee, "3.00");

    const unassigned = grouped.get(WAVE_UNASSIGNED_MERCHANT_ID);
    assert.ok(unassigned);
    assert.equal(unassigned.totals.count, 1);
    assert.equal(unassigned.totals.totalAmount, "-30.00");
    assert.equal(merchantIdFromWaveTx(tx({ transaction_id: "x" })), WAVE_UNASSIGNED_MERCHANT_ID);
  });
});

describe("assignLocalAggsToMerchants", () => {
  it("maps linked businesses and keeps unlinked aggs", () => {
    const { byMerchant, unlinked } = assignLocalAggsToMerchants(
      [
        { businessId: "b1", saleDate: "2026-08-27", count: 3, totalAmount: "300", currency: "GMD" },
        { businessId: "b2", saleDate: "2026-08-27", count: 1, totalAmount: "40", currency: "GMD" },
      ],
      new Map([["b1", "am-a"]]),
    );

    assert.equal(byMerchant.get("am-a")?.length, 1);
    assert.equal(byMerchant.get("am-a")?.[0].count, 3);
    assert.equal(unlinked.length, 1);
    assert.equal(unlinked[0].businessId, "b2");
  });
});

describe("mergeMerchantTransactionSummary", () => {
  it("merges wave and local buckets, plus unassigned and unlinked", () => {
    const waveByMerchantDate = new Map<string, Map<string, ReturnType<typeof emptyWaveTotals>>>();
    putWaveDay(waveByMerchantDate, "am-a", "2026-08-27", {
      count: 2,
      totalAmount: "149.00",
      totalFee: "3.00",
      currency: "GMD",
    });

    const localByMerchantDate = new Map<string, Map<string, ReturnType<typeof emptyLocalTotals>>>();
    putLocalDay(
      localByMerchantDate,
      "am-a",
      "2026-08-27",
      localTotalsFromAgg({
        businessId: "b1",
        saleDate: "2026-08-27",
        count: 3,
        totalAmount: "300",
        currency: "GMD",
      }),
    );

    const unassignedWaveByDate = new Map([
      [
        "2026-08-27",
        { count: 1, totalAmount: "-30.00", totalFee: "1.00", currency: "GMD" },
      ],
    ]);
    const unlinkedLocalByDate = new Map([
      ["2026-08-26", { count: 1, totalAmount: "40.00", currency: "GMD" }],
    ]);

    const summary = mergeMerchantTransactionSummary({
      from: "2026-08-26",
      to: "2026-08-27",
      dates: ["2026-08-26", "2026-08-27"],
      merchants: [
        {
          id: "am-a",
          name: "Kaira",
          business: { id: "b1", name: "Kaira Fuels", slug: "kaira", ownerEmail: "a@b.c" },
        },
        { id: "am-zero", name: "Quiet Shop", business: null },
      ],
      waveByMerchantDate,
      waveMerchantNames: new Map([["am-a", "Kaira"]]),
      localByMerchantDate,
      unassignedWaveByDate,
      unlinkedLocalByDate,
      unlinkedLocalBusinesses: [
        { id: "b2", name: "Orphan Biz", slug: "orphan", ownerEmail: "o@b.c" },
      ],
    });

    const kaira = summary.merchants.find((m) => m.id === "am-a");
    assert.ok(kaira);
    assert.equal(kaira.days.length, 1);
    assert.equal(kaira.days[0].date, "2026-08-27");
    assert.equal(kaira.waveTotals.count, 2);
    assert.equal(kaira.localTotals.count, 3);
    assert.equal(kaira.localTotals.totalAmount, "300.00");

    const quiet = summary.merchants.find((m) => m.id === "am-zero");
    assert.ok(quiet);
    assert.equal(quiet.days.length, 0);
    assert.equal(quiet.waveTotals.count, 0);

    assert.equal(summary.unassignedWave.totals.count, 1);
    assert.equal(summary.unassignedWave.totals.totalAmount, "-30.00");
    assert.equal(summary.unlinkedLocal.totals.count, 1);
    assert.equal(summary.unlinkedLocal.businesses[0].id, "b2");
    assert.equal(addMoney("10.50", "0.50"), "11.00");
  });
});
