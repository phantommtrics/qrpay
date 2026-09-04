import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Prisma } from "@prisma/client";

import {
  computeWaveSelfSettlementAmounts,
  roundWaveFeeToWhole,
  waveSelfSettlementSkipReason,
} from "./wave-self-settlement.util.js";

describe("roundWaveFeeToWhole", () => {
  it("rounds 0.52 up to 1 and 0.4 down to 0", () => {
    assert.equal(roundWaveFeeToWhole(new Prisma.Decimal("0.52")).toFixed(0), "1");
    assert.equal(roundWaveFeeToWhole(new Prisma.Decimal("0.4")).toFixed(0), "0");
    assert.equal(roundWaveFeeToWhole(new Prisma.Decimal("0.49")).toFixed(0), "0");
    assert.equal(roundWaveFeeToWhole(new Prisma.Decimal("0.5")).toFixed(0), "1");
  });
});

describe("computeWaveSelfSettlementAmounts", () => {
  it("52 GMD buy, 2 withhold: checkout 0.52→1, payout 0.49→0, receive 49", () => {
    const r = computeWaveSelfSettlementAmounts({
      gross: 52,
      feeRate: 0,
      feeFixed: 2,
      checkoutFeeRate: 0.01,
      payoutFeeRate: 0.01,
    });
    assert.equal(r.withholdAmount.toFixed(2), "2.00");
    assert.equal(r.checkoutFeeAmount.toFixed(2), "1.00");
    assert.equal(r.requestedReceiveAmount.toFixed(2), "50.00");
    assert.equal(r.payoutFeeAmount.toFixed(2), "0.00");
    assert.equal(r.receiveAmount.toFixed(2), "49.00");
    assert.equal(r.clamped, true);
    const wallet =
      Number(r.checkoutFeeAmount) +
      Number(r.withholdAmount) +
      Number(r.payoutFeeAmount) +
      Number(r.receiveAmount);
    assert.equal(wallet.toFixed(2), "52.00");
  });

  it("40 GMD buy: checkout 0.40→0 so no checkout fee is reserved", () => {
    const r = computeWaveSelfSettlementAmounts({
      gross: 40,
      feeRate: 0,
      feeFixed: 0,
      checkoutFeeRate: 0.01,
      payoutFeeRate: 0.01,
    });
    assert.equal(r.checkoutFeeAmount.toFixed(2), "0.00");
    assert.equal(r.payoutFeeAmount.toFixed(2), "0.00");
    assert.equal(r.receiveAmount.toFixed(2), "40.00");
    assert.equal(r.clamped, false);
  });

  it("combines percent and fixed withhold then backs out whole-GMD Wave fees", () => {
    const r = computeWaveSelfSettlementAmounts({
      gross: 2200,
      feeRate: 0.02,
      feeFixed: 10,
      checkoutFeeRate: 0.01,
      payoutFeeRate: 0.01,
    });
    assert.equal(r.withholdAmount.toFixed(2), "54.00");
    assert.equal(r.checkoutFeeAmount.toFixed(2), "22.00");
    assert.equal(r.requestedReceiveAmount.toFixed(2), "2146.00");
    assert.equal(r.receiveAmount.toFixed(2), "2103.00");
    assert.equal(r.payoutFeeAmount.toFixed(2), "21.00");
    assert.equal(r.clamped, true);
  });

  it("still leaves withhold in the wallet when withhold is below checkout+payout fees", () => {
    const r = computeWaveSelfSettlementAmounts({
      gross: 2200,
      feeRate: 0,
      feeFixed: 10,
      checkoutFeeRate: 0.01,
      payoutFeeRate: 0.01,
    });
    assert.equal(r.withholdAmount.toFixed(2), "10.00");
    assert.equal(r.requestedReceiveAmount.toFixed(2), "2190.00");
    assert.equal(r.receiveAmount.toFixed(2), "2147.00");
    assert.equal(r.payoutFeeAmount.toFixed(2), "21.00");
    assert.equal(r.clamped, true);
  });

  it("zero platform withhold still subtracts whole-GMD checkout and payout fees", () => {
    const r = computeWaveSelfSettlementAmounts({
      gross: 2200,
      feeRate: 0,
      feeFixed: 0,
      checkoutFeeRate: 0.01,
      payoutFeeRate: 0.01,
    });
    assert.equal(r.requestedReceiveAmount.toFixed(2), "2200.00");
    assert.equal(r.receiveAmount.toFixed(2), "2156.00");
    assert.equal(r.payoutFeeAmount.toFixed(2), "22.00");
    assert.equal(r.clamped, true);
  });

  it("returns zero receive when withhold exceeds net after checkout", () => {
    const r = computeWaveSelfSettlementAmounts({
      gross: 100,
      feeRate: 1,
      feeFixed: 10,
      checkoutFeeRate: 0.01,
      payoutFeeRate: 0.01,
    });
    assert.equal(r.requestedReceiveAmount.toFixed(2), "-10.00");
    assert.equal(r.receiveAmount.toFixed(2), "0.00");
    assert.equal(r.clamped, true);
  });

  it("uses percent withhold and both Wave fees", () => {
    const r = computeWaveSelfSettlementAmounts({
      gross: "1000",
      feeRate: 0.05,
      feeFixed: 0,
      checkoutFeeRate: 0.01,
      payoutFeeRate: 0.01,
    });
    assert.equal(r.withholdAmount.toFixed(2), "50.00");
    assert.equal(r.checkoutFeeAmount.toFixed(2), "10.00");
    assert.equal(r.receiveAmount.toFixed(2), "931.00");
    assert.equal(r.payoutFeeAmount.toFixed(2), "9.00");
    assert.equal(r.clamped, true);
  });

  it("with payout fee rate 0 only subtracts whole-GMD checkout fee", () => {
    const r = computeWaveSelfSettlementAmounts({
      gross: 2200,
      feeRate: 0,
      feeFixed: 10,
      checkoutFeeRate: 0.01,
      payoutFeeRate: 0,
    });
    assert.equal(r.receiveAmount.toFixed(2), "2168.00");
    assert.equal(r.payoutFeeAmount.toFixed(2), "0.00");
    assert.equal(r.clamped, true);
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
