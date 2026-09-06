import { Prisma } from "@prisma/client";

/**
 * Wave fee rates used to estimate remaining aggregated-merchant balance.
 * `WAVE_SELF_SETTLEMENT_CHECKOUT_FEE_RATE` is also the fallback when a merchant
 * has no per-business `customerWalletFeeRate`. Fraction 0–1.
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

const payoutFeeRate = parseRate(
  process.env.WAVE_SELF_SETTLEMENT_PAYOUT_FEE_RATE,
  "0.01",
  "WAVE_SELF_SETTLEMENT_PAYOUT_FEE_RATE",
);

/** Wave incoming checkout fee (typically ~1%). Default 0.01. */
export function waveSelfSettlementCheckoutFeeRate(): Prisma.Decimal {
  return checkoutFeeRate;
}

/**
 * Wave `POST /v1/payout` fee on top of `receive_amount` (Wave's receive_amount is net to the
 * recipient). Default 0.01.
 */
export function waveSelfSettlementPayoutFeeRate(): Prisma.Decimal {
  return payoutFeeRate;
}
