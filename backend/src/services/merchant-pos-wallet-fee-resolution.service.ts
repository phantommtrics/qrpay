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
 * Wave checkout fee on an aggregated-merchant payment (fraction 0–1).
 * Per-merchant `customerWalletFeeRate` when set, else {@link waveSelfSettlementCheckoutFeeRate} (default 1%).
 */
export function resolveWaveAggregatedCheckoutFeeRate(
  secrets: WaveGatewaySecrets | null | undefined,
): Prisma.Decimal {
  const fromCredential = customerWalletFeeRateFromGatewaySecretsOrNull(secrets);
  if (fromCredential !== null) {
    return fromCredential;
  }
  return waveSelfSettlementCheckoutFeeRate();
}

/**
 * Effective fee rate for merchant POS / invoice wallet checkout:
 * 1) `customerWalletFeeRate` on {@link BusinessGatewayCredential} (decrypted secrets) when set
 *    (Wave aggregated: any saved rate including 0; other gateways: only when &gt; 0)
 * 2) Wave aggregated merchants: {@link waveSelfSettlementCheckoutFeeRate} (default 1%)
 * 3) Else {@link merchantCheckoutDefaultWalletFeeRateForProvider} from env (`MERCHANT_CHECKOUT_*_WALLET_FEE_RATE`)
 */
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
    return waveSelfSettlementCheckoutFeeRate();
  }
  return merchantCheckoutDefaultWalletFeeRateForProvider(provider);
}
