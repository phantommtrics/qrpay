import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseExistingWave,
  waveOwnAccountBearer,
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
