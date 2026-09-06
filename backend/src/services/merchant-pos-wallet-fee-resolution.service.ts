import { Prisma } from "@prisma/client";

import { merchantCheckoutDefaultWalletFeeRateForProvider } from "../config/merchant-checkout-wallet-fee-env.js";
import { waveSelfSettlementCheckoutFeeRate } from "../config/wave-self-settlement-env.js";
import { PaymentProvider, type PaymentProviderType } from "../lib/prisma-sales-enums.js";
import type {
  ApsGatewaySecrets,
  WaveGatewaySecrets,
  YonnaGatewaySecrets,
} from "./business-gateway-credential.service.js";
import { waveOwnAccountBearer } from "./business-gateway-credential.service.js";
import { roundWaveFeeToWhole } from "./wave-self-settlement.util.js";

/**
 * Rate from encrypted gateway credentials (fraction 0–1). Missing or invalid → 0 (no fee journal).
 */
function coerceWalletFeeRateFraction(raw: unknown): number | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw.trim())
        : NaN;
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  if (n > 1) {
    return 1;
  }
  return n;
}

export function customerWalletFeeRateFromGatewaySecretsOrNull(
  secrets: WaveGatewaySecrets | YonnaGatewaySecrets | ApsGatewaySecrets | null | undefined,
): Prisma.Decimal | null {
  if (!secrets) {
    return null;
  }
  const n = coerceWalletFeeRateFraction(
    (secrets as { customerWalletFeeRate?: unknown }).customerWalletFeeRate,
  );
  if (n === null) {
    return null;
  }
  return new Prisma.Decimal(String(n));
}

export function customerWalletFeeRateFromGatewaySecrets(
  secrets: WaveGatewaySecrets | YonnaGatewaySecrets | ApsGatewaySecrets | null | undefined,
): Prisma.Decimal {
  return customerWalletFeeRateFromGatewaySecretsOrNull(secrets) ?? new Prisma.Decimal(0);
}

function isWaveAggregatedMerchant(
  secrets: WaveGatewaySecrets | YonnaGatewaySecrets | ApsGatewaySecrets | null | undefined,
  provider: PaymentProviderType | string,
): secrets is WaveGatewaySecrets {
  if (String(provider).trim().toUpperCase() !== PaymentProvider.WAVE_GAMBIA) {
    return false;
  }
  const wave = secrets as WaveGatewaySecrets | null | undefined;
  return Boolean(wave?.aggregatedMerchantId?.trim()) && !waveOwnAccountBearer(wave);
}

/**
 * Wave fee reserved in self-settlement payout math (fraction 0–1).
 * Uses `selfSettlementCheckoutFeeRate` when set, else {@link waveSelfSettlementCheckoutFeeRate} (default 1%).
 */
export function resolveWaveSelfSettlementCheckoutFeeRate(
  secrets: WaveGatewaySecrets | null | undefined,
): Prisma.Decimal {
  const n = coerceWalletFeeRateFraction(secrets?.selfSettlementCheckoutFeeRate);
  if (n !== null) {
    return new Prisma.Decimal(String(n));
  }
  return waveSelfSettlementCheckoutFeeRate();
}

/** @deprecated Use {@link resolveWaveSelfSettlementCheckoutFeeRate}. */
export function resolveWaveAggregatedCheckoutFeeRate(
  secrets: WaveGatewaySecrets | null | undefined,
): Prisma.Decimal {
  return resolveWaveSelfSettlementCheckoutFeeRate(secrets);
}

/**
 * Effective fee rate for merchant POS / invoice wallet checkout:
 * 1) `customerWalletFeeRate` on {@link BusinessGatewayCredential} (decrypted secrets) when set
 *    (Wave aggregated: any saved rate including 0; other gateways: only when &gt; 0)
 * 2) Wave aggregated merchants: `MERCHANT_CHECKOUT_WAVE_WALLET_FEE_RATE` when &gt; 0, else 1%
 * 3) Else {@link merchantCheckoutDefaultWalletFeeRateForProvider} from env (`MERCHANT_CHECKOUT_*_WALLET_FEE_RATE`)
 */
export function isWaveGambiaProvider(provider: PaymentProviderType | string): boolean {
  const p = String(provider).trim().toUpperCase().replace(/-/g, "_");
  return p === PaymentProvider.WAVE_GAMBIA;
}

/**
 * Apply a fee rate to a payment. Wave charges are whole GMD (0.4 → 0, 0.5 → 1),
 * so 50 at 1% is 1, not 0.50. Other providers stay at 2 decimal places.
 */
export function computeWalletFeeAmount(
  gross: Prisma.Decimal | string | number,
  rate: Prisma.Decimal | string | number,
  provider: PaymentProviderType | string,
): Prisma.Decimal {
  const raw = new Prisma.Decimal(String(gross)).mul(new Prisma.Decimal(String(rate)));
  if (isWaveGambiaProvider(provider)) {
    return roundWaveFeeToWhole(raw);
  }
  return raw.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function resolveMerchantWalletFeeRate(
  secrets: WaveGatewaySecrets | YonnaGatewaySecrets | ApsGatewaySecrets | null | undefined,
  provider: PaymentProviderType | string,
): Prisma.Decimal {
  const fromCredential = customerWalletFeeRateFromGatewaySecretsOrNull(secrets);
  const aggregatedWave = isWaveAggregatedMerchant(secrets, provider);
  if (fromCredential !== null && (aggregatedWave || fromCredential.gt(0))) {
    return fromCredential;
  }
  if (aggregatedWave) {
    const envGl = merchantCheckoutDefaultWalletFeeRateForProvider(provider);
    return envGl.gt(0) ? envGl : new Prisma.Decimal("0.01");
  }
  return merchantCheckoutDefaultWalletFeeRateForProvider(provider);
}
