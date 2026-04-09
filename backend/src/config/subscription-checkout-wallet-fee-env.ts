import { Prisma } from "@prisma/client";

/**
 * Fraction of gross subscription invoice amount recorded as platform wallet/processor fee
 * (billing WALLET_FEE + GL). Examples: 0.01 = 1%, 0 = none.
 */
function parseWalletFeeRate(raw: string | undefined, fallback: string, envKey: string): Prisma.Decimal {
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

const waveRate = parseWalletFeeRate(
  process.env.SUBSCRIPTION_CHECKOUT_WAVE_WALLET_FEE_RATE,
  "0.01",
  "SUBSCRIPTION_CHECKOUT_WAVE_WALLET_FEE_RATE",
);

const yonnaRate = parseWalletFeeRate(
  process.env.SUBSCRIPTION_CHECKOUT_YONNA_WALLET_FEE_RATE,
  "0",
  "SUBSCRIPTION_CHECKOUT_YONNA_WALLET_FEE_RATE",
);

const apsRate = parseWalletFeeRate(
  process.env.SUBSCRIPTION_CHECKOUT_APS_WALLET_FEE_RATE,
  "0",
  "SUBSCRIPTION_CHECKOUT_APS_WALLET_FEE_RATE",
);

export function subscriptionCheckoutWaveWalletFeeRate(): Prisma.Decimal {
  return waveRate;
}

export function subscriptionCheckoutYonnaWalletFeeRate(): Prisma.Decimal {
  return yonnaRate;
}

export function subscriptionCheckoutApsWalletFeeRate(): Prisma.Decimal {
  return apsRate;
}
