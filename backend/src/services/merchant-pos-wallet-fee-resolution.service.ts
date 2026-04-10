import { Prisma } from "@prisma/client";

import type {
  ApsGatewaySecrets,
  WaveGatewaySecrets,
  YonnaGatewaySecrets,
} from "./business-gateway-credential.service.js";

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

export function customerWalletFeeRateFromGatewaySecrets(
  secrets: WaveGatewaySecrets | YonnaGatewaySecrets | ApsGatewaySecrets | null | undefined,
): Prisma.Decimal {
  if (!secrets) {
    return new Prisma.Decimal(0);
  }
  const n = coerceWalletFeeRateFraction(
    (secrets as { customerWalletFeeRate?: unknown }).customerWalletFeeRate,
  );
  if (n === null) {
    return new Prisma.Decimal(0);
  }
  return new Prisma.Decimal(String(n));
}
