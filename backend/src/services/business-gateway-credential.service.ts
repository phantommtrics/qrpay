import { z } from "zod";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { decryptJsonPayload, encryptJsonPayload } from "../utils/field-encryption.js";

import { isApsWalletApiBaseConfigured } from "../config/aps-wallet-env.js";
import {
  CHECKOUT_ADAPTER_APS_WALLET,
  CHECKOUT_ADAPTER_WAVE_GAMBIA,
  CHECKOUT_ADAPTER_YONNA_WALLET,
  GATEWAY_CODE_WAVE_GAMBIA,
  getPaymentGatewayByCode,
  listEnabledPaymentGateways,
} from "./payment-gateway.service.js";
import { isPlatformWaveCheckoutConfigured } from "./wave-client-env.js";
import {
  deleteWaveAggregatedMerchantIfPresent,
  provisionWaveAggregatedMerchantForBusiness,
} from "./wave-aggregated-merchant.service.js";
import { WaveAggregatedMerchantProvisionTrigger } from "@prisma/client";

/** Partial save: omit a field to keep the previous encrypted value (when updating). */
const walletFeeRateFieldSchema = z.union([z.number().min(0).max(1), z.null()]).optional();

const yonnaSecretsInputSchema = z.object({
  secretKey: z.string().optional(),
  clientId: z.string().optional(),
  webhookSecret: z.string().optional(),
  customerWalletFeeRate: walletFeeRateFieldSchema,
});

const apsSecretsInputSchema = z.object({
  /** Merchant login id (sent as `username` and `mobile` on APS login). */
  username: z.string().optional(),
  password: z.string().optional(),
  customerWalletFeeRate: walletFeeRateFieldSchema,
});

/** Own-account Wave fields only. Aggregated merchant id is never set from this form. */
const waveSecretsInputSchema = z.object({
  bearerToken: z.string().optional(),
  webhookSecret: z.string().optional(),
  customerWalletFeeRate: walletFeeRateFieldSchema,
  /** Drop stored API key + webhook secret; keep aggregated merchant id and fee. */
  clearOwnAccount: z.boolean().optional(),
});

export type WaveGatewaySecrets = {
  /** Wave aggregated merchant id (from Aggregated Merchants API). */
  aggregatedMerchantId?: string;
  /** Own Wave Business API key; when set, sales checkout does not use the platform aggregator. */
  bearerToken?: string;
  /** Own Wave webhook HMAC secret (same URL as aggregated merchants). */
  webhookSecret?: string;
  /** Estimated provider fee on gross customer wallet takings (orders/POS), fraction 0–1. */
  customerWalletFeeRate?: number;
};

export function waveOwnAccountBearer(secrets: WaveGatewaySecrets | null | undefined): string | null {
  const token = secrets?.bearerToken?.trim();
  return token ? token : null;
}

/** Stored per business; API base URL and access channel come from server env only. */
export type ApsGatewaySecrets = {
  username: string;
  password: string;
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
  let customerWalletFeeRate: number | undefined;
  if (input.customerWalletFeeRate === undefined || input.customerWalletFeeRate === null) {
    customerWalletFeeRate = undefined;
  } else {
    customerWalletFeeRate = input.customerWalletFeeRate;
  }
  return { secretKey, clientId, webhookSecret, customerWalletFeeRate };
}

function replaceApsSecrets(input: z.infer<typeof apsSecretsInputSchema>): ApsGatewaySecrets {
  const username = input.username?.trim();
  const password = input.password;
  if (!username) {
    throw new HttpError(400, "APS merchant username is required.");
  }
  if (!password?.trim()) {
    throw new HttpError(400, "APS merchant password is required.");
  }
  let customerWalletFeeRate: number | undefined;
  if (input.customerWalletFeeRate === undefined || input.customerWalletFeeRate === null) {
    customerWalletFeeRate = undefined;
  } else {
    customerWalletFeeRate = input.customerWalletFeeRate;
  }
  return { username, password: password.trim(), customerWalletFeeRate };
}

function mergeApsSecrets(
  existing: ApsGatewaySecrets | null,
  input: z.infer<typeof apsSecretsInputSchema>,
): ApsGatewaySecrets {
  const username =
    input.username !== undefined && input.username.trim().length > 0
      ? input.username.trim()
      : existing?.username;
  const password =
    input.password !== undefined && input.password.trim().length > 0
      ? input.password.trim()
      : existing?.password;
  if (!username) {
    throw new HttpError(400, "APS merchant username is required.");
  }
  if (!password) {
    throw new HttpError(400, "APS merchant password is required.");
  }
  let customerWalletFeeRate: number | undefined;
  if (input.customerWalletFeeRate === undefined) {
    customerWalletFeeRate = existing?.customerWalletFeeRate;
  } else if (input.customerWalletFeeRate === null) {
    customerWalletFeeRate = undefined;
  } else {
    customerWalletFeeRate = input.customerWalletFeeRate;
  }
  return { username, password, customerWalletFeeRate };
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
  return { secretKey, clientId, webhookSecret, customerWalletFeeRate };
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

function optionalTrimmedSecret(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const t = raw.trim();
  return t.length > 0 ? t : undefined;
}

export function parseExistingWave(raw: Record<string, unknown> | null): WaveGatewaySecrets | null {
  if (!raw) {
    return null;
  }
  const aggregatedMerchantId =
    typeof raw.aggregatedMerchantId === "string"
      ? raw.aggregatedMerchantId.trim()
      : "";
  const bearerToken = optionalTrimmedSecret(raw.bearerToken);
  const webhookSecret = optionalTrimmedSecret(raw.webhookSecret);
  if (!aggregatedMerchantId && !bearerToken) {
    return null;
  }
  return {
    aggregatedMerchantId: aggregatedMerchantId || undefined,
    bearerToken,
    webhookSecret,
    customerWalletFeeRate: parseWalletFeeRate(raw.customerWalletFeeRate),
  };
}

function mergeWaveFeeRate(
  existing: WaveGatewaySecrets | null,
  input: z.infer<typeof waveSecretsInputSchema>,
): number | undefined {
  if (input.customerWalletFeeRate === undefined) {
    return existing?.customerWalletFeeRate;
  }
  if (input.customerWalletFeeRate === null) {
    return undefined;
  }
  return input.customerWalletFeeRate;
}

function clearWaveOwnAccountSecrets(existing: WaveGatewaySecrets | null): WaveGatewaySecrets {
  const aggregatedMerchantId = existing?.aggregatedMerchantId?.trim();
  return {
    aggregatedMerchantId: aggregatedMerchantId || undefined,
    customerWalletFeeRate: existing?.customerWalletFeeRate,
  };
}

function replaceWaveOwnAccountSecrets(
  existing: WaveGatewaySecrets | null,
  input: z.infer<typeof waveSecretsInputSchema>,
): WaveGatewaySecrets {
  const bearerToken = input.bearerToken?.trim();
  if (!bearerToken) {
    throw new HttpError(400, "Wave Business API key is required.");
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
  return {
    aggregatedMerchantId: existing?.aggregatedMerchantId?.trim() || undefined,
    bearerToken,
    webhookSecret,
    customerWalletFeeRate,
  };
}

function mergeWaveOwnAccountSecrets(
  existing: WaveGatewaySecrets | null,
  input: z.infer<typeof waveSecretsInputSchema>,
): WaveGatewaySecrets {
  const bearerToken =
    input.bearerToken !== undefined && input.bearerToken.trim().length > 0
      ? input.bearerToken.trim()
      : existing?.bearerToken?.trim();
  if (!bearerToken) {
    throw new HttpError(400, "Wave Business API key is required.");
  }
  let webhookSecret: string | undefined;
  if (input.webhookSecret === undefined) {
    webhookSecret = existing?.webhookSecret;
  } else {
    const t = input.webhookSecret.trim();
    webhookSecret = t.length > 0 ? t : undefined;
  }
  return {
    aggregatedMerchantId: existing?.aggregatedMerchantId?.trim() || undefined,
    bearerToken,
    webhookSecret,
    customerWalletFeeRate: mergeWaveFeeRate(existing, input),
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
    customerWalletFeeRate: parseWalletFeeRate(raw.customerWalletFeeRate),
  };
}

function parseExistingAps(raw: Record<string, unknown> | null): ApsGatewaySecrets | null {
  if (!raw || typeof raw.username !== "string" || typeof raw.password !== "string") {
    return null;
  }
  return {
    username: raw.username,
    password: raw.password,
    customerWalletFeeRate: parseWalletFeeRate(raw.customerWalletFeeRate),
  };
}

export type GatewayCredentialFieldStatus = {
  /** Wave: aggregated merchant provisioned and platform bearer configured. */
  aggregatedMerchant?: boolean;
  /** Wave: platform `WAVE_CHECKOUT_BEARER` is set on the server. */
  platformWaveBearer?: boolean;
  /** Wave: this business stored its own Wave Business API key. */
  ownAccountBearer?: boolean;
  /** Wave: this business stored its own Wave webhook HMAC secret. */
  ownAccountWebhookSecret?: boolean;
  webhookSecret?: boolean;
  /** Wave/Yonna/APS: estimated customer wallet fee rate (0–1) configured for accounting. */
  customerWalletFeeRate?: boolean;
  /** Yonna: client ID on file. */
  clientId?: boolean;
  /** Yonna: API secret key on file. */
  secretKey?: boolean;
  /** APS: merchant login username on file. */
  apsUsername?: boolean;
  /** APS: merchant password on file. */
  apsPassword?: boolean;
  /** Server has APS_WALLET_BASE_URL (required for any APS checkout). */
  apsApiBase?: boolean;
};

function fieldStatusFromDecrypted(
  raw: Record<string, unknown> | null,
  adapter: string,
): { fieldStatus: GatewayCredentialFieldStatus; checkoutConfigured: boolean } | null {
  if (!raw) {
    return null;
  }
  if (adapter === CHECKOUT_ADAPTER_WAVE_GAMBIA) {
    const platformWaveBearer = isPlatformWaveCheckoutConfigured();
    const aggregatedMerchant = nonEmptyString(raw.aggregatedMerchantId);
    const ownAccountBearer = nonEmptyString(raw.bearerToken);
    const ownAccountWebhookSecret = nonEmptyString(raw.webhookSecret);
    const rate = parseWalletFeeRate(raw.customerWalletFeeRate);
    const customerWalletFeeRate = rate !== undefined && rate > 0;
    return {
      fieldStatus: {
        aggregatedMerchant,
        platformWaveBearer,
        ownAccountBearer,
        ownAccountWebhookSecret,
        customerWalletFeeRate,
      },
      checkoutConfigured: Boolean(ownAccountBearer || (platformWaveBearer && aggregatedMerchant)),
    };
  }
  if (adapter === CHECKOUT_ADAPTER_YONNA_WALLET) {
    const clientId = nonEmptyString(raw.clientId);
    const secretKey = nonEmptyString(raw.secretKey);
    const webhookSecret = nonEmptyString(raw.webhookSecret);
    const rate = parseWalletFeeRate(raw.customerWalletFeeRate);
    const customerWalletFeeRate = rate !== undefined && rate > 0;
    return {
      fieldStatus: { clientId, secretKey, webhookSecret, customerWalletFeeRate },
      checkoutConfigured: clientId && secretKey,
    };
  }
  if (adapter === CHECKOUT_ADAPTER_APS_WALLET) {
    const apsUsername = nonEmptyString(raw.username);
    const apsPassword = nonEmptyString(raw.password);
    const apsApiBase = isApsWalletApiBaseConfigured();
    const rate = parseWalletFeeRate(raw.customerWalletFeeRate);
    const customerWalletFeeRate = rate !== undefined && rate > 0;
    return {
      fieldStatus: { apsUsername, apsPassword, apsApiBase, customerWalletFeeRate },
      checkoutConfigured: Boolean(apsUsername && apsPassword && apsApiBase),
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

  const credentialStatus = gateways.map((g) => {
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
    } else if (adapter === CHECKOUT_ADAPTER_WAVE_GAMBIA) {
      fieldStatus = {
        aggregatedMerchant: false,
        platformWaveBearer: isPlatformWaveCheckoutConfigured(),
        ownAccountBearer: false,
        ownAccountWebhookSecret: false,
      };
      checkoutConfigured = false;
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

  return {
    credentialStatus,
    platformWaveConfigured: isPlatformWaveCheckoutConfigured(),
  };
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

  let payload: WaveGatewaySecrets | YonnaGatewaySecrets | ApsGatewaySecrets;
  const replace = Boolean(input.replaceSecrets);

  if (adapter === CHECKOUT_ADAPTER_WAVE_GAMBIA) {
    const parsed = waveSecretsInputSchema.parse(input.secrets);
    if (parsed.clearOwnAccount) {
      payload = clearWaveOwnAccountSecrets(parseExistingWave(existingPayload));
    } else {
      payload = replace
        ? replaceWaveOwnAccountSecrets(parseExistingWave(existingPayload), parsed)
        : mergeWaveOwnAccountSecrets(parseExistingWave(existingPayload), parsed);
    }
  } else if (adapter === CHECKOUT_ADAPTER_YONNA_WALLET) {
    const parsed = yonnaSecretsInputSchema.parse(input.secrets);
    payload = replace
      ? replaceYonnaSecrets(parsed)
      : mergeYonnaSecrets(parseExistingYonna(existingPayload), parsed);
  } else if (adapter === CHECKOUT_ADAPTER_APS_WALLET) {
    const parsed = apsSecretsInputSchema.parse(input.secrets);
    payload = replace
      ? replaceApsSecrets(parsed)
      : mergeApsSecrets(parseExistingAps(existingPayload), parsed);
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

/**
 * Creates a Wave aggregated merchant after organization creation (best-effort; signup not blocked).
 */
export async function provisionDefaultWaveGatewayCredentialForBusiness(
  businessId: string,
  trigger: WaveAggregatedMerchantProvisionTrigger = WaveAggregatedMerchantProvisionTrigger.ORGANIZATION_CREATED,
): Promise<void> {
  try {
    await provisionWaveAggregatedMerchantForBusiness({ businessId, trigger });
  } catch (e) {
    console.error(
      `[wave] Auto-provision aggregated merchant failed for business ${businessId}:`,
      e,
    );
  }
}

export async function deleteBusinessGatewayCredential(businessId: string, gatewayCode: string) {
  const code = gatewayCode.trim().toLowerCase();
  const gateway = await getPaymentGatewayByCode(code);
  if (!gateway) {
    throw new HttpError(404, "Unknown payment gateway.");
  }

  const adapter = gateway.checkoutAdapter?.trim() || "";
  if (adapter === CHECKOUT_ADAPTER_WAVE_GAMBIA) {
    await deleteWaveAggregatedMerchantIfPresent(businessId, code);
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
