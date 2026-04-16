import { Prisma } from "@prisma/client";

import { PaymentProvider, type PaymentProviderType } from "../lib/prisma-sales-enums.js";

/**
 * Default merchant-side wallet/processor fee when the business has no (or zero)
 * `customerWalletFeeRate` on {@link BusinessGatewayCredential} for that gateway.
 * Fraction of gross payment (0–1). Examples: 0.01 = 1%, 0 = none.
 *
 * Per provider (Wave / Yonna / APS). Subscription checkout uses SUBSCRIPTION_CHECKOUT_* instead.
 */
function parseRate(raw: string | undefined, fallback: string, envKey: string): Prisma.Decimal {
  const s = raw?.trim();
  const src = s && s.length > 0 ? s : fallback;
  let d: Prisma.Decimal;
  try {
    d = new Prisma.Decimal(src);
  } catch {
    return new Prisma.Decimal(fallback);
  }
  if (!d.isFinite() || d.isNegative() || d.gt(1)) {
    console.warn(
      `[${envKey}] invalid value "${src}" (expected 0–1, e.g. 0.01 for 1%). Using default ${fallback}.`,
    );
    return new Prisma.Decimal(fallback);
  }
  return d;
}

const waveRate = parseRate(
  process.env.MERCHANT_CHECKOUT_WAVE_WALLET_FEE_RATE,
  "0",
  "MERCHANT_CHECKOUT_WAVE_WALLET_FEE_RATE",
);

const yonnaRate = parseRate(
  process.env.MERCHANT_CHECKOUT_YONNA_WALLET_FEE_RATE,
  "0",
  "MERCHANT_CHECKOUT_YONNA_WALLET_FEE_RATE",
);

const apsRate = parseRate(
  process.env.MERCHANT_CHECKOUT_APS_WALLET_FEE_RATE,
  "0",
  "MERCHANT_CHECKOUT_APS_WALLET_FEE_RATE",
);

export function merchantCheckoutDefaultWalletFeeRateForProvider(
  provider: PaymentProviderType | string,
): Prisma.Decimal {
  const pk = String(provider).trim().toUpperCase();
  if (pk === PaymentProvider.WAVE_GAMBIA) {
    return waveRate;
  }
  if (pk === PaymentProvider.YONNA_WALLET) {
    return yonnaRate;
  }
  if (pk === PaymentProvider.APS_WALLET) {
    return apsRate;
  }
  return new Prisma.Decimal(0);
}
