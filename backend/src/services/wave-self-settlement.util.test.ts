import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Prisma } from "@prisma/client";

import {
  computeWaveSelfSettlementAmounts,
  waveSelfSettlementSkipReason,
} from "./wave-self-settlement.util.js";

describe("computeWaveSelfSettlementAmounts", () => {
  it("combines percent and fixed withhold: 2% + 10 on 2200 → payout 2146", () => {
    const r = computeWaveSelfSettlementAmounts({
      gross: 2200,
      feeRate: 0.02,
      feeFixed: 10,
      checkoutFeeRate: 0.01,
    });
    assert.equal(r.withholdAmount.toFixed(2), "54.00");
    assert.equal(r.requestedReceiveAmount.toFixed(2), "2146.00");
    assert.equal(r.receiveAmount.toFixed(2), "2146.00");
    assert.equal(r.clamped, false);
  });

  it("clamps payout to estimated Wave net when withhold is below checkout fee", () => {
    const r = computeWaveSelfSettlementAmounts({
      gross: 2200,
      feeRate: 0,
      feeFixed: 10,
      checkoutFeeRate: 0.01,
    });
    assert.equal(r.withholdAmount.toFixed(2), "10.00");
    assert.equal(r.requestedReceiveAmount.toFixed(2), "2190.00");
    assert.equal(r.receiveAmount.toFixed(2), "2178.00");
    assert.equal(r.clamped, true);
  });

  it("clamps a zero-withhold payout to 99% of gross", () => {
    const r = computeWaveSelfSettlementAmounts({
      gross: 2200,
      feeRate: 0,
      feeFixed: 0,
      checkoutFeeRate: 0.01,
    });
    assert.equal(r.requestedReceiveAmount.toFixed(2), "2200.00");
    assert.equal(r.receiveAmount.toFixed(2), "2178.00");
    assert.equal(r.clamped, true);
  });

  it("returns zero receive when withhold exceeds gross", () => {
    const r = computeWaveSelfSettlementAmounts({
      gross: 100,
      feeRate: 1,
      feeFixed: 10,
      checkoutFeeRate: 0.01,
    });
    assert.equal(r.requestedReceiveAmount.toFixed(2), "-10.00");
    assert.equal(r.receiveAmount.toFixed(2), "0.00");
    assert.equal(r.clamped, true);
  });

  it("uses percent only when fixed is zero", () => {
    const r = computeWaveSelfSettlementAmounts({
      gross: "1000",
      feeRate: 0.05,
      feeFixed: 0,
      checkoutFeeRate: 0.01,
    });
    assert.equal(r.withholdAmount.toFixed(2), "50.00");
    assert.equal(r.receiveAmount.toFixed(2), "950.00");
    assert.equal(r.clamped, false);
  });
});

describe("waveSelfSettlementSkipReason", () => {
  const receive = new Prisma.Decimal("2100");

  it("skips own-account (BYOK) merchants", () => {
    assert.equal(
      waveSelfSettlementSkipReason({
        secrets: { aggregatedMerchantId: "am_1", bearerToken: "wave-key", selfSettlementEnabled: true, selfSettlementMobile: "+220111" },
        receiveAmount: receive,
      }),
      "own_account",
    );
  });

  it("skips when aggregated merchant id is missing", () => {
    assert.equal(
      waveSelfSettlementSkipReason({
        secrets: { selfSettlementEnabled: true, selfSettlementMobile: "+220111" },
        receiveAmount: receive,
      }),
      "no_aggregated_merchant",
    );
  });

  it("skips when settlement is disabled", () => {
    assert.equal(
      waveSelfSettlementSkipReason({
        secrets: { aggregatedMerchantId: "am_1", selfSettlementMobile: "+220111" },
        receiveAmount: receive,
      }),
      "disabled",
    );
  });

  it("skips when Wave customer number is missing", () => {
    assert.equal(
      waveSelfSettlementSkipReason({
        secrets: { aggregatedMerchantId: "am_1", selfSettlementEnabled: true },
        receiveAmount: receive,
      }),
      "missing_mobile",
    );
  });

  it("skips non-positive payout amounts", () => {
    assert.equal(
      waveSelfSettlementSkipReason({
        secrets: {
          aggregatedMerchantId: "am_1",
          selfSettlementEnabled: true,
          selfSettlementMobile: "+220111",
        },
        receiveAmount: 0,
      }),
      "non_positive_payout",
    );
  });

  it("does not skip a ready aggregator settlement", () => {
    assert.equal(
      waveSelfSettlementSkipReason({
        secrets: {
          aggregatedMerchantId: "am_1",
          selfSettlementEnabled: true,
          selfSettlementMobile: "+220111",
        },
        receiveAmount: receive,
      }),
      null,
    );
  });
});
