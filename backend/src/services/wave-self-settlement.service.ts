import { createHash } from "node:crypto";

import {
  PaymentProvider,
  PaymentStatus,
  Prisma,
  WaveSelfSettlementPayoutStatus,
} from "@prisma/client";
import { z } from "zod";

import { waveSelfSettlementCheckoutFeeRate } from "../config/wave-self-settlement-env.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { encryptJsonPayload } from "../utils/field-encryption.js";
import {
  getDecryptedGatewaySecrets,
  parseExistingWave,
  waveOwnAccountBearer,
  waveSelfSettlementFieldsFrom,
  type WaveGatewaySecrets,
} from "./business-gateway-credential.service.js";
import { GATEWAY_CODE_WAVE_GAMBIA, getPaymentGatewayByCode } from "./payment-gateway.service.js";
import { isPlatformWaveCheckoutConfigured, waveServiceFromEnv } from "./wave-client-env.js";
import { normalizeWaveMobile } from "./wave-ops.service.js";
import type { WavePayoutRequest } from "./wave-payment.service.js";
import {
  computeWaveSelfSettlementAmounts,
  settlementFeeFixedFromSecrets,
  settlementFeeRateFromSecrets,
  waveSelfSettlementSkipReason,
} from "./wave-self-settlement.util.js";

const BACKOFF_MS = [
  30_000, 120_000, 300_000, 900_000, 3_600_000, 7_200_000, 14_400_000, 28_800_000,
];

const PROCESSING_STALE_MS = 2 * 60 * 1000;

let workerStarted = false;
let drainScheduled = false;

function settlementIdempotencyKey(paymentId: string): string {
  const hex = createHash("sha256").update(`wave-self-settle:${paymentId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function isPermanentWavePayoutError(e: unknown): boolean {
  if (e instanceof HttpError) {
    return e.statusCode >= 400 && e.statusCode < 500 && e.statusCode !== 429;
  }
  return false;
}

function scheduleDrain(): void {
  if (drainScheduled) {
    return;
  }
  drainScheduled = true;
  setImmediate(() => {
    drainScheduled = false;
    void processWaveSelfSettlementJobs(10).catch((err) => {
      console.error("[wave-self-settlement] drain error:", err);
    });
  });
}

export type WaveSelfSettlementConfig = {
  enabled: boolean;
  mobile: string | null;
  feeRate: number;
  feeFixed: number;
  aggregatedMerchantId: string | null;
  ownAccountActive: boolean;
  checkoutFeeRate: number;
};

export async function getWaveSelfSettlementConfig(businessId: string): Promise<WaveSelfSettlementConfig> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  });
  if (!business) {
    throw new HttpError(404, "Business not found.");
  }
  const secrets = await getDecryptedGatewaySecrets<WaveGatewaySecrets>(
    businessId,
    GATEWAY_CODE_WAVE_GAMBIA,
  );
  const parsed = secrets ? parseExistingWave(secrets as unknown as Record<string, unknown>) : null;
  const checkout = waveSelfSettlementCheckoutFeeRate();
  return {
    enabled: parsed?.selfSettlementEnabled === true,
    mobile: parsed?.selfSettlementMobile?.trim() || null,
    feeRate: settlementFeeRateFromSecrets(parsed),
    feeFixed: settlementFeeFixedFromSecrets(parsed),
    aggregatedMerchantId: parsed?.aggregatedMerchantId?.trim() || null,
    ownAccountActive: Boolean(waveOwnAccountBearer(parsed)),
    checkoutFeeRate: Number(checkout.toString()),
  };
}

const updateSelfSettlementSchema = z.object({
  enabled: z.boolean(),
  mobile: z.string().trim().max(32).nullable().optional(),
  feeRate: z.number().min(0).max(1),
  feeFixed: z.number().min(0),
});

export async function updateWaveSelfSettlementConfig(
  businessId: string,
  raw: unknown,
): Promise<WaveSelfSettlementConfig> {
  const input = updateSelfSettlementSchema.parse(raw);
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  });
  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

  const gateway = await getPaymentGatewayByCode(GATEWAY_CODE_WAVE_GAMBIA);
  if (!gateway) {
    throw new HttpError(404, "Wave gateway is not available.");
  }

  const existingRow = await prisma.businessGatewayCredential.findUnique({
    where: { businessId_gatewayId: { businessId, gatewayId: gateway.id } },
  });
  let existing: WaveGatewaySecrets | null = null;
  if (existingRow) {
    try {
      const { decryptJsonPayload } = await import("../utils/field-encryption.js");
      existing = parseExistingWave(
        decryptJsonPayload<Record<string, unknown>>(existingRow.iv, existingRow.ciphertext),
      );
    } catch {
      existing = null;
    }
  }

  if (waveOwnAccountBearer(existing)) {
    throw new HttpError(
      409,
      "Self-settlement is not used when this business has its own Wave API key.",
    );
  }
  const aggregatedMerchantId = existing?.aggregatedMerchantId?.trim();
  if (!aggregatedMerchantId) {
    throw new HttpError(409, "Provision a Wave aggregated merchant before configuring self-settlement.");
  }

  let mobile: string | undefined;
  const mobileRaw = input.mobile?.trim() ?? "";
  if (mobileRaw) {
    const normalized = normalizeWaveMobile(mobileRaw);
    if (!normalized) {
      throw new HttpError(
        400,
        "Wave customer number must be an international mobile number (e.g. +220…).",
      );
    }
    mobile = normalized;
  }
  if (input.enabled && !mobile) {
    throw new HttpError(400, "Wave customer number is required when self-settlement is enabled.");
  }

  const payload: WaveGatewaySecrets = {
    aggregatedMerchantId,
    customerWalletFeeRate: existing?.customerWalletFeeRate,
    bearerToken: existing?.bearerToken,
    webhookSecret: existing?.webhookSecret,
    ...waveSelfSettlementFieldsFrom(existing),
    selfSettlementEnabled: input.enabled,
    selfSettlementFeeRate: input.feeRate,
    selfSettlementFeeFixed: Math.round(input.feeFixed * 100) / 100,
    ...(mobile ? { selfSettlementMobile: mobile } : { selfSettlementMobile: undefined }),
  };

  if (!mobile) {
    delete payload.selfSettlementMobile;
  }

  let enc: { iv: string; ciphertext: string };
  try {
    enc = encryptJsonPayload(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Encryption failed.";
    throw new HttpError(503, msg);
  }

  await prisma.businessGatewayCredential.upsert({
    where: { businessId_gatewayId: { businessId, gatewayId: gateway.id } },
    create: {
      businessId,
      gatewayId: gateway.id,
      iv: enc.iv,
      ciphertext: enc.ciphertext,
      keyVersion: 1,
    },
    update: {
      iv: enc.iv,
      ciphertext: enc.ciphertext,
      keyVersion: 1,
    },
  });

  return getWaveSelfSettlementConfig(businessId);
}

/**
 * Persist a pending payout after a successful aggregator checkout webhook.
 * Does not call Wave; a worker sends the payout after the webhook HTTP 200.
 */
export async function enqueueWaveSelfSettlementForPayment(paymentId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { business: { select: { name: true } } },
  });
  if (!payment) {
    return;
  }
  if (payment.provider !== PaymentProvider.WAVE_GAMBIA) {
    return;
  }
  if (payment.status !== PaymentStatus.COMPLETED) {
    console.warn(
      `[wave-self-settlement] skip payment ${payment.id}: status is ${payment.status}, expected COMPLETED`,
    );
    return;
  }

  const existing = await prisma.waveSelfSettlementPayout.findUnique({
    where: { paymentId: payment.id },
  });
  if (existing) {
    console.info("[wave-self-settlement] already queued", {
      paymentId: payment.id,
      businessId: payment.businessId,
      payoutId: existing.id,
      status: existing.status,
    });
    if (existing.status === WaveSelfSettlementPayoutStatus.PENDING) {
      scheduleDrain();
    }
    return;
  }

  const secrets = await getDecryptedGatewaySecrets<WaveGatewaySecrets>(
    payment.businessId,
    payment.gatewayCode?.trim() || GATEWAY_CODE_WAVE_GAMBIA,
  );
  const parsedWave = secrets
    ? parseExistingWave(secrets as unknown as Record<string, unknown>)
    : null;
  const parsed: WaveGatewaySecrets | null | undefined = parsedWave
    ? { ...parsedWave, ...waveSelfSettlementFieldsFrom(secrets) }
    : secrets;

  const amounts = computeWaveSelfSettlementAmounts({
    gross: payment.amount,
    feeRate: settlementFeeRateFromSecrets(parsed),
    feeFixed: settlementFeeFixedFromSecrets(parsed),
    checkoutFeeRate: waveSelfSettlementCheckoutFeeRate(),
  });

  const skip = waveSelfSettlementSkipReason({
    secrets: parsed,
    receiveAmount: amounts.receiveAmount,
  });
  if (skip) {
    console.warn("[wave-self-settlement] skip", {
      paymentId: payment.id,
      businessId: payment.businessId,
      reason: skip,
      enabled: parsed?.selfSettlementEnabled === true,
      hasMobile: Boolean(parsed?.selfSettlementMobile?.trim()),
      hasAggregatedMerchant: Boolean(parsed?.aggregatedMerchantId?.trim()),
      ownAccount: Boolean(waveOwnAccountBearer(parsed)),
      receiveAmount: amounts.receiveAmount.toFixed(2),
    });
  }
  if (skip === "own_account" || skip === "no_aggregated_merchant" || skip === "disabled" || skip === "missing_mobile") {
    return;
  }

  const aggregatedMerchantId = parsed?.aggregatedMerchantId?.trim();
  const mobile = parsed?.selfSettlementMobile?.trim();
  if (!aggregatedMerchantId || !mobile) {
    return;
  }

  const name = payment.business.name.trim().slice(0, 255) || "Merchant";
  const status =
    skip === "non_positive_payout"
      ? WaveSelfSettlementPayoutStatus.SKIPPED
      : WaveSelfSettlementPayoutStatus.PENDING;

  try {
    await prisma.waveSelfSettlementPayout.create({
      data: {
        paymentId: payment.id,
        businessId: payment.businessId,
        aggregatedMerchantId,
        mobile,
        name,
        currency: (payment.currency || "GMD").toUpperCase(),
        grossAmount: payment.amount,
        withholdAmount: amounts.withholdAmount,
        requestedReceiveAmount: amounts.requestedReceiveAmount,
        receiveAmount: amounts.receiveAmount,
        clamped: amounts.clamped,
        status,
        skipReason: skip === "non_positive_payout" ? skip : null,
        clientReference: payment.id,
        idempotencyKey: settlementIdempotencyKey(payment.id),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }

  console.info("[wave-self-settlement] enqueued", {
    paymentId: payment.id,
    businessId: payment.businessId,
    status,
    receiveAmount: amounts.receiveAmount.toFixed(2),
    withholdAmount: amounts.withholdAmount.toFixed(2),
    mobile,
  });

  if (status === WaveSelfSettlementPayoutStatus.PENDING) {
    scheduleDrain();
  }
}

async function sendSettlementPayout(row: {
  id: string;
  receiveAmount: Prisma.Decimal;
  currency: string;
  name: string;
  mobile: string;
  clientReference: string | null;
  aggregatedMerchantId: string;
  idempotencyKey: string;
}): Promise<void> {
  if (!isPlatformWaveCheckoutConfigured()) {
    throw new HttpError(503, "Wave is not configured (WAVE_CHECKOUT_BEARER).");
  }
  const wave = waveServiceFromEnv();
  const payload: WavePayoutRequest = {
    currency: row.currency,
    receive_amount: row.receiveAmount.toFixed(2),
    name: row.name,
    mobile: row.mobile,
    aggregated_merchant_id: row.aggregatedMerchantId,
    ...(row.clientReference ? { client_reference: row.clientReference } : {}),
  };
  console.info("[wave-self-settlement] sending payout", {
    payoutId: row.id,
    receiveAmount: row.receiveAmount.toFixed(2),
    mobile: row.mobile,
    aggregatedMerchantId: row.aggregatedMerchantId,
  });
  const result = await wave.createPayout(payload, row.idempotencyKey);
  console.info("[wave-self-settlement] payout result", {
    payoutId: row.id,
    wavePayoutId: result.id,
    status: result.status,
    error: result.payout_error?.error_message ?? null,
  });
  await prisma.waveSelfSettlementPayout.update({
    where: { id: row.id },
    data: {
      status: result.status === "failed" ? WaveSelfSettlementPayoutStatus.FAILED : WaveSelfSettlementPayoutStatus.SUCCEEDED,
      wavePayoutId: result.id,
      fee: result.fee ?? null,
      errorCode: result.payout_error?.error_code ?? null,
      errorMessage: result.payout_error?.error_message ?? null,
      waveTimestamp: result.timestamp ? new Date(result.timestamp) : new Date(),
    },
  });
}

export async function processWaveSelfSettlementJobs(limit = 10): Promise<number> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_STALE_MS);
  const rows = await prisma.waveSelfSettlementPayout.findMany({
    where: {
      OR: [
        { status: WaveSelfSettlementPayoutStatus.PENDING, nextAttemptAt: { lte: now } },
        { status: WaveSelfSettlementPayoutStatus.PROCESSING, updatedAt: { lte: staleBefore } },
      ],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: Math.min(Math.max(limit, 1), 50),
  });

  let touched = 0;
  for (const row of rows) {
    const claimed = await prisma.waveSelfSettlementPayout.updateMany({
      where: {
        id: row.id,
        status: { in: [WaveSelfSettlementPayoutStatus.PENDING, WaveSelfSettlementPayoutStatus.PROCESSING] },
      },
      data: {
        status: WaveSelfSettlementPayoutStatus.PROCESSING,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      continue;
    }
    touched += 1;

    const attemptNumber = row.attempts + 1;
    try {
      await sendSettlementPayout(row);
    } catch (e) {
      const message = e instanceof HttpError ? e.message : e instanceof Error ? e.message : "Wave payout failed.";
      const errorCode = e instanceof HttpError ? String(e.statusCode) : null;
      const permanent = isPermanentWavePayoutError(e);
      const exhausted = permanent || attemptNumber >= row.maxAttempts;
      const delay = BACKOFF_MS[Math.min(attemptNumber - 1, BACKOFF_MS.length - 1)] ?? 30_000;
      await prisma.waveSelfSettlementPayout.update({
        where: { id: row.id },
        data: {
          status: exhausted ? WaveSelfSettlementPayoutStatus.FAILED : WaveSelfSettlementPayoutStatus.PENDING,
          errorCode,
          errorMessage: message,
          nextAttemptAt: exhausted ? now : new Date(now.getTime() + delay),
        },
      });
      if (exhausted) {
        console.warn("[wave-self-settlement] payout failed:", row.id, message);
      }
    }
  }

  return touched;
}

export function startWaveSelfSettlementWorker(): void {
  if (workerStarted) {
    return;
  }
  workerStarted = true;
  const raw = Number(process.env.WAVE_SELF_SETTLEMENT_WORKER_MS ?? "15000");
  const ms = Number.isFinite(raw) && raw >= 5000 ? raw : 15_000;
  void processWaveSelfSettlementJobs(25).catch((err) => {
    console.error("[wave-self-settlement] worker initial run error:", err);
  });
  setInterval(() => {
    void processWaveSelfSettlementJobs(25).catch((err) => {
      console.error("[wave-self-settlement] worker error:", err);
    });
  }, ms);
}
