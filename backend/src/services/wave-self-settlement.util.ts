import { Prisma } from "@prisma/client";

import type { WaveGatewaySecrets } from "./business-gateway-credential.service.js";
import { waveOwnAccountBearer } from "./business-gateway-credential.service.js";

export function roundMoney2(n: Prisma.Decimal): Prisma.Decimal {
  return n.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export type WaveSelfSettlementAmounts = {
  withholdAmount: Prisma.Decimal;
  requestedReceiveAmount: Prisma.Decimal;
  receiveAmount: Prisma.Decimal;
  clamped: boolean;
};

/**
 * X = round2(G × percentRate) + fixedAmount
 * requested = G − X
 * receiveAmount is clamped to estimated Wave net G × (1 − checkoutFeeRate) so we
 * do not overdraw the aggregated merchant sub-balance after Wave's checkout fee.
 */
export function computeWaveSelfSettlementAmounts(input: {
  gross: Prisma.Decimal | string | number;
  feeRate: number;
  feeFixed: number;
  checkoutFeeRate: Prisma.Decimal | string | number;
}): WaveSelfSettlementAmounts {
  const gross = new Prisma.Decimal(String(input.gross));
  const rate = new Prisma.Decimal(String(input.feeRate || 0));
  const fixed = new Prisma.Decimal(String(input.feeFixed || 0));
  const checkoutRate = new Prisma.Decimal(String(input.checkoutFeeRate));

  const withholdAmount = roundMoney2(gross.mul(rate).plus(fixed));
  const requestedReceiveAmount = roundMoney2(gross.minus(withholdAmount));
  const estimatedNet = roundMoney2(gross.mul(new Prisma.Decimal(1).minus(checkoutRate)));

  let receiveAmount = requestedReceiveAmount;
  let clamped = false;
  if (receiveAmount.gt(estimatedNet)) {
    receiveAmount = estimatedNet;
    clamped = true;
  }
  if (receiveAmount.lt(0)) {
    receiveAmount = new Prisma.Decimal(0);
    clamped = true;
  }

  return { withholdAmount, requestedReceiveAmount, receiveAmount, clamped };
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
