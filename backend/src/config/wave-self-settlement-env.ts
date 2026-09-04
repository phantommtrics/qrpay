import { Prisma } from "@prisma/client";

/**
 * Wave incoming checkout fee used to estimate remaining aggregated-merchant
 * balance after Wave takes its cut. Not the merchant GL `customerWalletFeeRate`.
 * Fraction 0–1. Default 0.01 (1%).
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

const checkoutFeeRate = parseRate(
  process.env.WAVE_SELF_SETTLEMENT_CHECKOUT_FEE_RATE,
  "0.01",
  "WAVE_SELF_SETTLEMENT_CHECKOUT_FEE_RATE",
);

export function waveSelfSettlementCheckoutFeeRate(): Prisma.Decimal {
  return checkoutFeeRate;
}
