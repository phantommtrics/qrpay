import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseExistingWave,
  waveOwnAccountBearer,
  waveSelfSettlementFieldsFrom,
} from "./business-gateway-credential.service.js";

describe("parseExistingWave", () => {
  it("reads aggregator-only secrets", () => {
    const secrets = parseExistingWave({
      aggregatedMerchantId: "am_123",
      customerWalletFeeRate: 0.01,
    });
    assert.equal(secrets?.aggregatedMerchantId, "am_123");
    assert.equal(secrets?.bearerToken, undefined);
    assert.equal(waveOwnAccountBearer(secrets), null);
  });

  it("reads self-settlement fields on aggregator secrets", () => {
    const secrets = parseExistingWave({
      aggregatedMerchantId: "am_123",
      selfSettlementEnabled: true,
      selfSettlementMobile: "+2201234567",
      selfSettlementFeeRate: 0.02,
      selfSettlementFeeFixed: 10,
    });
    assert.equal(secrets?.selfSettlementEnabled, true);
    assert.equal(secrets?.selfSettlementMobile, "+2201234567");
    assert.equal(secrets?.selfSettlementFeeRate, 0.02);
    assert.equal(secrets?.selfSettlementFeeFixed, 10);
  });

  it("reads own-account secrets without an aggregated merchant", () => {
    const secrets = parseExistingWave({
      bearerToken: " wave-key ",
      webhookSecret: " whsec ",
    });
    assert.equal(secrets?.aggregatedMerchantId, undefined);
    assert.equal(secrets?.bearerToken, "wave-key");
    assert.equal(secrets?.webhookSecret, "whsec");
    assert.equal(waveOwnAccountBearer(secrets), "wave-key");
  });

  it("keeps both aggregator id and own-account key", () => {
    const secrets = parseExistingWave({
      aggregatedMerchantId: "am_123",
      bearerToken: "wave-key",
    });
    assert.equal(secrets?.aggregatedMerchantId, "am_123");
    assert.equal(waveOwnAccountBearer(secrets), "wave-key");
  });

  it("returns null when neither aggregator id nor own-account key is present", () => {
    assert.equal(parseExistingWave({ customerWalletFeeRate: 0.02 }), null);
    assert.equal(parseExistingWave(null), null);
  });
});

describe("waveSelfSettlementFieldsFrom", () => {
  it("preserves settlement fields across own-account clear-style copies", () => {
    const existing = parseExistingWave({
      aggregatedMerchantId: "am_123",
      bearerToken: "wave-key",
      selfSettlementEnabled: true,
      selfSettlementMobile: "+2201234567",
      selfSettlementFeeRate: 0.01,
      selfSettlementFeeFixed: 5,
    });
    const kept = waveSelfSettlementFieldsFrom(existing);
    assert.deepEqual(kept, {
      selfSettlementEnabled: true,
      selfSettlementMobile: "+2201234567",
      selfSettlementFeeRate: 0.01,
      selfSettlementFeeFixed: 5,
    });
    const cleared = {
      aggregatedMerchantId: existing?.aggregatedMerchantId,
      customerWalletFeeRate: existing?.customerWalletFeeRate,
      ...kept,
    };
    assert.equal(cleared.aggregatedMerchantId, "am_123");
    assert.equal("bearerToken" in cleared, false);
    assert.equal(cleared.selfSettlementEnabled, true);
    assert.equal(cleared.selfSettlementMobile, "+2201234567");
  });
});
