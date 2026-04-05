import { z } from "zod";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { decryptJsonPayload, encryptJsonPayload } from "../utils/field-encryption.js";

import {
  CHECKOUT_ADAPTER_WAVE_GAMBIA,
  CHECKOUT_ADAPTER_YONNA_WALLET,
  getPaymentGatewayByCode,
  listEnabledPaymentGateways,
} from "./payment-gateway.service.js";

/** Partial save: omit a field to keep the previous encrypted value (when updating). */
const walletFeeRateFieldSchema = z.union([z.number().min(0).max(1), z.null()]).optional();

const waveSecretsInputSchema = z.object({
  bearerToken: z.string().optional(),
  webhookSecret: z.string().optional(),
  /** Fraction 0–1 (e.g. 0.01 = 1%) estimated wallet fee on customer QR payments. Omit to keep; null clears. */
  customerWalletFeeRate: walletFeeRateFieldSchema,
});

const yonnaSecretsInputSchema = z.object({
  secretKey: z.string().optional(),
  clientId: z.string().optional(),
  webhookSecret: z.string().optional(),
  /** E.164-style wallet number used for in-store QR checkout (e.g. +2207XXXXXXX). */
  defaultPayerPhone: z.string().optional(),
  customerWalletFeeRate: walletFeeRateFieldSchema,
});

export type WaveGatewaySecrets = {
  bearerToken: string;
  /** Same role as env `WAVE_WEBHOOK_SECRET` for merchant webhooks. */
  webhookSecret?: string;
  /** Estimated provider fee on gross customer wallet takings (orders/POS), fraction 0–1. */
  customerWalletFeeRate?: number;
};

/** Stored per business; API base URL comes from env `YONNA_FOREX_API_URL` only. */
export type YonnaGatewaySecrets = {
  /** Same role as env `YONNA_FOREX_SECRET_KEY`. */
  secretKey: string;
  /** Same role as env `YONNA_FOREX_CLIENT_ID`. */
  clientId: string;
  webhookSecret?: string;
  /** Default customer wallet MSISDN for POS/order QR checkout when not sent per request. */
  defaultPayerPhone?: string;
  customerWalletFeeRate?: number;
};

function loadExistingSecrets(
  iv: string,
  ciphertext: string,
): Record<string, unknown> | null {
  try {
    return decryptJsonPayload<Record<string, unknown>>(iv, ciphertext);
  } catch {
    return null;
  }
}

function nonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function mergeWaveSecrets(
  existing: WaveGatewaySecrets | null,
  input: z.infer<typeof waveSecretsInputSchema>,
): WaveGatewaySecrets {
  const bearerToken =
    input.bearerToken !== undefined && input.bearerToken.trim().length > 0
      ? input.bearerToken.trim()
      : existing?.bearerToken;
  let webhookSecret: string | undefined;
  if (input.webhookSecret === undefined) {
    webhookSecret = existing?.webhookSecret;
  } else {
    const t = input.webhookSecret.trim();
    webhookSecret = t.length > 0 ? t : undefined;
  }
  if (!bearerToken) {
    throw new HttpError(
      400,
      "Bearer token is required (maps to checkout API key; env name WAVE_CHECKOUT_BEARER).",
    );
  }
  let customerWalletFeeRate: number | undefined;
  if (input.customerWalletFeeRate === undefined) {
    customerWalletFeeRate = existing?.customerWalletFeeRate;
  } else if (input.customerWalletFeeRate === null) {
    customerWalletFeeRate = undefined;
  } else {
    customerWalletFeeRate = input.customerWalletFeeRate;
  }
  return { bearerToken, webhookSecret, customerWalletFeeRate };
}

/** Full replace: only values from the request are stored (no merge with existing). Omitted optional fields are cleared. */
function replaceWaveSecrets(input: z.infer<typeof waveSecretsInputSchema>): WaveGatewaySecrets {
  const bearerToken = input.bearerToken?.trim();
  if (!bearerToken) {
    throw new HttpError(
      400,
      "Bearer token is required (maps to checkout API key; env name WAVE_CHECKOUT_BEARER).",
    );
  }
  let webhookSecret: string | undefined;
  if (input.webhookSecret !== undefined) {
    const t = input.webhookSecret.trim();
    webhookSecret = t.length > 0 ? t : undefined;
  } else {
    webhookSecret = undefined;
  }
  let customerWalletFeeRate: number | undefined;
  if (input.customerWalletFeeRate === undefined || input.customerWalletFeeRate === null) {
    customerWalletFeeRate = undefined;
  } else {
    customerWalletFeeRate = input.customerWalletFeeRate;
  }
  return { bearerToken, webhookSecret, customerWalletFeeRate };
}

function replaceYonnaSecrets(input: z.infer<typeof yonnaSecretsInputSchema>): YonnaGatewaySecrets {
  const secretKey = input.secretKey?.trim();
  const clientId = input.clientId?.trim();
  if (!secretKey) {
    throw new HttpError(400, "Secret key is required (env name YONNA_FOREX_SECRET_KEY).");
  }
  if (!clientId) {
    throw new HttpError(400, "Client ID is required (env name YONNA_FOREX_CLIENT_ID).");
  }
  let webhookSecret: string | undefined;
  if (input.webhookSecret !== undefined) {
    const t = input.webhookSecret.trim();
    webhookSecret = t.length > 0 ? t : undefined;
  } else {
    webhookSecret = undefined;
  }
  let defaultPayerPhone: string | undefined;
  if (input.defaultPayerPhone !== undefined) {
    const t = input.defaultPayerPhone.trim();
    defaultPayerPhone = t.length > 0 ? t : undefined;
  } else {
    defaultPayerPhone = undefined;
  }
  let customerWalletFeeRate: number | undefined;
  if (input.customerWalletFeeRate === undefined || input.customerWalletFeeRate === null) {
    customerWalletFeeRate = undefined;
  } else {
    customerWalletFeeRate = input.customerWalletFeeRate;
  }
  return { secretKey, clientId, webhookSecret, defaultPayerPhone, customerWalletFeeRate };
}

function mergeYonnaSecrets(
  existing: YonnaGatewaySecrets | null,
  input: z.infer<typeof yonnaSecretsInputSchema>,
): YonnaGatewaySecrets {
  const secretKey =
    input.secretKey !== undefined && input.secretKey.trim().length > 0
      ? input.secretKey.trim()
      : existing?.secretKey;
  const clientId =
    input.clientId !== undefined && input.clientId.trim().length > 0
      ? input.clientId.trim()
      : existing?.clientId;
  let webhookSecret: string | undefined;
  if (input.webhookSecret === undefined) {
    webhookSecret = existing?.webhookSecret;
  } else {
    const t = input.webhookSecret.trim();
    webhookSecret = t.length > 0 ? t : undefined;
  }
  let defaultPayerPhone: string | undefined;
  if (input.defaultPayerPhone === undefined) {
    defaultPayerPhone = existing?.defaultPayerPhone;
  } else {
    const t = input.defaultPayerPhone.trim();
    defaultPayerPhone = t.length > 0 ? t : undefined;
  }
  if (!secretKey) {
    throw new HttpError(400, "Secret key is required (env name YONNA_FOREX_SECRET_KEY).");
  }
  if (!clientId) {
    throw new HttpError(400, "Client ID is required (env name YONNA_FOREX_CLIENT_ID).");
  }
  let customerWalletFeeRate: number | undefined;
  if (input.customerWalletFeeRate === undefined) {
    customerWalletFeeRate = existing?.customerWalletFeeRate;
  } else if (input.customerWalletFeeRate === null) {
    customerWalletFeeRate = undefined;
  } else {
    customerWalletFeeRate = input.customerWalletFeeRate;
  }
  return { secretKey, clientId, webhookSecret, defaultPayerPhone, customerWalletFeeRate };
}

function parseWalletFeeRate(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    return undefined;
  }
  return n;
}

function parseExistingWave(raw: Record<string, unknown> | null): WaveGatewaySecrets | null {
  if (!raw || typeof raw.bearerToken !== "string") {
    return null;
  }
  return {
    bearerToken: raw.bearerToken,
    webhookSecret: typeof raw.webhookSecret === "string" ? raw.webhookSecret : undefined,
    customerWalletFeeRate: parseWalletFeeRate(raw.customerWalletFeeRate),
  };
}

function parseExistingYonna(raw: Record<string, unknown> | null): YonnaGatewaySecrets | null {
  if (!raw || typeof raw.secretKey !== "string" || typeof raw.clientId !== "string") {
    return null;
  }
  return {
    secretKey: raw.secretKey,
    clientId: raw.clientId,
    webhookSecret: typeof raw.webhookSecret === "string" ? raw.webhookSecret : undefined,
    defaultPayerPhone:
      typeof raw.defaultPayerPhone === "string" ? raw.defaultPayerPhone : undefined,
    customerWalletFeeRate: parseWalletFeeRate(raw.customerWalletFeeRate),
  };
}

export type GatewayCredentialFieldStatus = {
  /** Wave: checkout bearer on file. */
  apiBearer?: boolean;
  webhookSecret?: boolean;
  /** Wave/Yonna: estimated customer wallet fee rate (0–1) configured for accounting. */
  customerWalletFeeRate?: boolean;
  /** Yonna: client ID on file. */
  clientId?: boolean;
  /** Yonna: API secret key on file. */
  secretKey?: boolean;
  /** Yonna: default wallet phone for QR checkout on file. */
  defaultPayerPhone?: boolean;
};

function fieldStatusFromDecrypted(
  raw: Record<string, unknown> | null,
  adapter: string,
): { fieldStatus: GatewayCredentialFieldStatus; checkoutConfigured: boolean } | null {
  if (!raw) {
    return null;
  }
  if (adapter === CHECKOUT_ADAPTER_WAVE_GAMBIA) {
    const apiBearer = nonEmptyString(raw.bearerToken);
    const webhookSecret = nonEmptyString(raw.webhookSecret);
    const rate = parseWalletFeeRate(raw.customerWalletFeeRate);
    const customerWalletFeeRate = rate !== undefined && rate > 0;
    return {
      fieldStatus: { apiBearer, webhookSecret, customerWalletFeeRate },
      checkoutConfigured: apiBearer,
    };
  }
  if (adapter === CHECKOUT_ADAPTER_YONNA_WALLET) {
    const clientId = nonEmptyString(raw.clientId);
    const secretKey = nonEmptyString(raw.secretKey);
    const webhookSecret = nonEmptyString(raw.webhookSecret);
    const defaultPayerPhone = nonEmptyString(raw.defaultPayerPhone);
    const rate = parseWalletFeeRate(raw.customerWalletFeeRate);
    const customerWalletFeeRate = rate !== undefined && rate > 0;
    return {
      fieldStatus: { clientId, secretKey, webhookSecret, defaultPayerPhone, customerWalletFeeRate },
      checkoutConfigured: clientId && secretKey,
    };
  }
  return {
    fieldStatus: {},
    checkoutConfigured: true,
  };
}

/** Enabled gateways with a checkout adapter (from `PaymentGateway` table). */
export async function listIntegrableGatewaysForCredentialUi() {
  const rows = await listEnabledPaymentGateways();
  return rows
    .filter((g) => Boolean(g.checkoutAdapter?.trim()))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function listBusinessGatewayCredentialStatus(businessId: string) {
  const gateways = await listIntegrableGatewaysForCredentialUi();

  const credRows = await prisma.businessGatewayCredential.findMany({
    where: { businessId },
  });
  const credByGateway = new Map(credRows.map((r) => [r.gatewayId, r]));

  return gateways.map((g) => {
    const row = credByGateway.get(g.id);
    const adapter = g.checkoutAdapter?.trim() || "";
    let fieldStatus: GatewayCredentialFieldStatus | null = null;
    let checkoutConfigured = false;

    if (row) {
      const raw = loadExistingSecrets(row.iv, row.ciphertext);
      const built = fieldStatusFromDecrypted(raw, adapter);
      if (built) {
        fieldStatus = built.fieldStatus;
        checkoutConfigured = built.checkoutConfigured;
      } else {
        fieldStatus = {};
        checkoutConfigured = false;
      }
    }

    return {
      gatewayId: g.id,
      code: g.code,
      name: g.name,
      checkoutAdapter: g.checkoutAdapter,
      hasCredential: Boolean(row),
      checkoutConfigured,
      fieldStatus,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  });
}

export async function upsertBusinessGatewayCredential(input: {
  businessId: string;
  gatewayCode: string;
  secrets: unknown;
  /** When true, stored secrets are replaced entirely from the request (no “leave blank to keep”). */
  replaceSecrets?: boolean;
}) {
  const code = input.gatewayCode.trim().toLowerCase();
  const gateway = await getPaymentGatewayByCode(code);
  if (!gateway || !gateway.isEnabled) {
    throw new HttpError(400, "This payment gateway is not available.");
  }
  const adapter = gateway.checkoutAdapter?.trim() || "";
  if (!adapter) {
    throw new HttpError(400, "This gateway is not set up for checkout integration.");
  }

  const existingRow = await prisma.businessGatewayCredential.findUnique({
    where: {
      businessId_gatewayId: { businessId: input.businessId, gatewayId: gateway.id },
    },
  });

  let existingPayload: Record<string, unknown> | null = null;
  if (existingRow) {
    existingPayload = loadExistingSecrets(existingRow.iv, existingRow.ciphertext);
  }

  let payload: WaveGatewaySecrets | YonnaGatewaySecrets;
  const replace = Boolean(input.replaceSecrets);

  if (adapter === CHECKOUT_ADAPTER_WAVE_GAMBIA) {
    const parsed = waveSecretsInputSchema.parse(input.secrets);
    payload = replace
      ? replaceWaveSecrets(parsed)
      : mergeWaveSecrets(parseExistingWave(existingPayload), parsed);
  } else if (adapter === CHECKOUT_ADAPTER_YONNA_WALLET) {
    const parsed = yonnaSecretsInputSchema.parse(input.secrets);
    payload = replace
      ? replaceYonnaSecrets(parsed)
      : mergeYonnaSecrets(parseExistingYonna(existingPayload), parsed);
  } else {
    throw new HttpError(
      400,
      `Credential storage is not implemented for checkout adapter "${adapter}".`,
    );
  }

  let enc: { iv: string; ciphertext: string };
  try {
    enc = encryptJsonPayload(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Encryption failed.";
    throw new HttpError(503, msg);
  }

  return prisma.businessGatewayCredential.upsert({
    where: {
      businessId_gatewayId: { businessId: input.businessId, gatewayId: gateway.id },
    },
    create: {
      businessId: input.businessId,
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
}

export async function deleteBusinessGatewayCredential(businessId: string, gatewayCode: string) {
  const code = gatewayCode.trim().toLowerCase();
  const gateway = await getPaymentGatewayByCode(code);
  if (!gateway) {
    throw new HttpError(404, "Unknown payment gateway.");
  }
  await prisma.businessGatewayCredential.deleteMany({
    where: { businessId, gatewayId: gateway.id },
  });
}

/** Decrypts stored secrets for server-side checkout; never expose to clients. */
export async function getDecryptedGatewaySecrets<T>(
  businessId: string,
  gatewayCode: string,
): Promise<T | null> {
  const gateway = await getPaymentGatewayByCode(gatewayCode.trim().toLowerCase());
  if (!gateway) {
    return null;
  }
  const row = await prisma.businessGatewayCredential.findUnique({
    where: {
      businessId_gatewayId: { businessId, gatewayId: gateway.id },
    },
  });
  if (!row) {
    return null;
  }
  try {
    return decryptJsonPayload<T>(row.iv, row.ciphertext);
  } catch {
    return null;
  }
}
