import { Prisma } from "@prisma/client";

import type { WaveGatewaySecrets } from "./business-gateway-credential.service.js";
import { waveOwnAccountBearer } from "./business-gateway-credential.service.js";

export function roundMoney2(n: Prisma.Decimal): Prisma.Decimal {
  return n.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Wave GMD fees: 0.50 and up → 1, below 0.50 → 0 (half-up to whole dalasis). */
export function roundWaveFeeToWhole(n: Prisma.Decimal): Prisma.Decimal {
  if (n.lte(0)) {
    return new Prisma.Decimal(0);
  }
  return n.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

export type WaveSelfSettlementAmounts = {
  withholdAmount: Prisma.Decimal;
  requestedReceiveAmount: Prisma.Decimal;
  receiveAmount: Prisma.Decimal;
  clamped: boolean;
  checkoutFeeAmount: Prisma.Decimal;
  payoutFeeAmount: Prisma.Decimal;
};

/**
 * Wave `receive_amount` is net to the recipient; Wave then debits receive + payout fee
 * from the aggregated merchant sub-balance. Both Wave fees are whole GMD (half-up).
 *
 * checkoutFee = roundWhole(G × checkoutFeeRate)
 * withhold X = round2(G × percentRate) + fixedAmount
 * available = G − checkoutFee − X
 * receive is the largest amount with receive + roundWhole(receive × payoutFeeRate) ≤ available
 */
function receiveNetOfPayoutFee(
  available: Prisma.Decimal,
  payoutRate: Prisma.Decimal,
): { receive: Prisma.Decimal; payoutFee: Prisma.Decimal } {
  const zero = new Prisma.Decimal(0);
  if (available.lte(0)) {
    return { receive: zero, payoutFee: zero };
  }
  if (payoutRate.lte(0)) {
    const receive = roundMoney2(available);
    return { receive, payoutFee: zero };
  }
  const step = new Prisma.Decimal("0.01");
  let lo = zero;
  let hi = roundMoney2(available);
  let bestReceive = zero;
  let bestFee = roundWaveFeeToWhole(zero);
  while (lo.lte(hi)) {
    const mid = roundMoney2(lo.plus(hi).div(2));
    const fee = roundWaveFeeToWhole(mid.mul(payoutRate));
    if (mid.plus(fee).lte(available)) {
      bestReceive = mid;
      bestFee = fee;
      lo = mid.plus(step);
    } else {
      hi = mid.minus(step);
    }
  }
  return { receive: bestReceive, payoutFee: bestFee };
}

export function computeWaveSelfSettlementAmounts(input: {
  gross: Prisma.Decimal | string | number;
  feeRate: number;
  feeFixed: number;
  checkoutFeeRate: Prisma.Decimal | string | number;
  payoutFeeRate?: Prisma.Decimal | string | number;
}): WaveSelfSettlementAmounts {
  const gross = new Prisma.Decimal(String(input.gross));
  const rate = new Prisma.Decimal(String(input.feeRate || 0));
  const fixed = new Prisma.Decimal(String(input.feeFixed || 0));
  const checkoutRate = new Prisma.Decimal(String(input.checkoutFeeRate));
  const payoutRate = new Prisma.Decimal(String(input.payoutFeeRate ?? 0));

  const withholdAmount = roundMoney2(gross.mul(rate).plus(fixed));
  const requestedReceiveAmount = roundMoney2(gross.minus(withholdAmount));
  const checkoutFeeAmount = roundWaveFeeToWhole(gross.mul(checkoutRate));
  const netAfterCheckout = roundMoney2(gross.minus(checkoutFeeAmount));
  const available = roundMoney2(netAfterCheckout.minus(withholdAmount));

  const { receive: receiveAmount, payoutFee: payoutFeeAmount } = receiveNetOfPayoutFee(
    available,
    payoutRate,
  );

  let clamped = receiveAmount.lt(requestedReceiveAmount) || receiveAmount.lte(0);
  if (requestedReceiveAmount.lt(0) && receiveAmount.lte(0)) {
    clamped = true;
  }

  return {
    withholdAmount,
    requestedReceiveAmount,
    receiveAmount,
    clamped,
    checkoutFeeAmount,
    payoutFeeAmount,
  };
}

export type WaveSelfSettlementSkipReason =
  | "own_account"
  | "no_aggregated_merchant"
  | "disabled"
  | "missing_mobile"
  | "non_positive_payout";

export function waveSelfSettlementSkipReason(input: {
  secrets: WaveGatewaySecrets | null | undefined;
  receiveAmount: Prisma.Decimal | string | number;
}): WaveSelfSettlementSkipReason | null {
  if (waveOwnAccountBearer(input.secrets)) {
    return "own_account";
  }
  if (!input.secrets?.aggregatedMerchantId?.trim()) {
    return "no_aggregated_merchant";
  }
  if (input.secrets.selfSettlementEnabled !== true) {
    return "disabled";
  }
  if (!input.secrets.selfSettlementMobile?.trim()) {
    return "missing_mobile";
  }
  const receive = new Prisma.Decimal(String(input.receiveAmount));
  if (receive.lte(0)) {
    return "non_positive_payout";
  }
  return null;
}

export function settlementFeeRateFromSecrets(secrets: WaveGatewaySecrets | null | undefined): number {
  const n = secrets?.selfSettlementFeeRate;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

export function settlementFeeFixedFromSecrets(secrets: WaveGatewaySecrets | null | undefined): number {
  const n = secrets?.selfSettlementFeeFixed;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}
