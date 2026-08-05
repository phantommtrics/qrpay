import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { decryptJsonPayload, encryptJsonPayload } from "../utils/field-encryption.js";
import {
  internalPartnerWebhookSigningSecretFromEnv,
  internalPartnerWebhookTargetsFromEnv,
  type InternalPartnerWebhookTarget,
} from "../config/internal-partner-env.js";

type StoredSigningSecret = {
  signingSecret: string;
};

let cachedTargets: InternalPartnerWebhookTarget[] | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

export function invalidatePartnerWebhookTargetCache(): void {
  cachedTargets = null;
  cacheLoadedAt = 0;
}

function normalizeWebhookUrl(raw: string): string {
  const url = raw.trim();
  if (!url) {
    throw new HttpError(400, "Webhook URL is required.");
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new HttpError(400, "Webhook URL must use http or https.");
    }
    return url;
  } catch (e) {
    if (e instanceof HttpError) {
      throw e;
    }
    throw new HttpError(400, "Webhook URL is invalid.");
  }
}

function decryptSigningSecret(iv: string, ciphertext: string): string | null {
  try {
    const payload = decryptJsonPayload<StoredSigningSecret>(iv, ciphertext);
    const secret = payload.signingSecret?.trim();
    return secret || null;
  } catch {
    return null;
  }
}

async function loadPartnerWebhookTargetsFromDb(): Promise<InternalPartnerWebhookTarget[]> {
  const rows = await prisma.partnerWebhookEndpoint.findMany({
    where: { isEnabled: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const targets: InternalPartnerWebhookTarget[] = [];
  for (const row of rows) {
    const secret = decryptSigningSecret(row.iv, row.ciphertext);
    if (!secret) {
      console.warn(
        `[internal-partner] Skipping partner webhook endpoint ${row.id}: could not decrypt signing secret.`,
      );
      continue;
    }
    targets.push({ url: row.webhookUrl, secret });
  }
  return targets;
}

/**
 * Active outbound webhook destinations. DB rows take precedence; env vars are fallback when DB is empty.
 */
export async function loadPartnerWebhookTargets(): Promise<InternalPartnerWebhookTarget[]> {
  if (cachedTargets && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedTargets;
  }
  const fromDb = await loadPartnerWebhookTargetsFromDb();
  if (fromDb.length > 0) {
    cachedTargets = fromDb;
  } else {
    cachedTargets = internalPartnerWebhookTargetsFromEnv() ?? [];
  }
  cacheLoadedAt = Date.now();
  return cachedTargets;
}

/** HMAC signing key for POSTs to this webhook URL (DB endpoint, env pair, or global env secret). */
export async function partnerWebhookSigningSecretForUrl(webhookUrl: string): Promise<string | null> {
  const trimmed = webhookUrl.trim();
  if (!trimmed) {
    return null;
  }

  const row = await prisma.partnerWebhookEndpoint.findUnique({
    where: { webhookUrl: trimmed },
    select: { iv: true, ciphertext: true, isEnabled: true },
  });
  if (row?.isEnabled) {
    const secret = decryptSigningSecret(row.iv, row.ciphertext);
    if (secret) {
      return secret;
    }
  }

  const targets = await loadPartnerWebhookTargets();
  for (const t of targets) {
    if (t.url === trimmed) {
      return t.secret;
    }
  }

  return internalPartnerWebhookSigningSecretFromEnv();
}

export type PartnerWebhookEndpointRow = {
  id: string;
  label: string | null;
  webhookUrl: string;
  isEnabled: boolean;
  sortOrder: number;
  hasSigningSecret: boolean;
  createdAt: string;
  updatedAt: string;
};

function formatRow(row: {
  id: string;
  label: string | null;
  webhookUrl: string;
  iv: string;
  ciphertext: string;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): PartnerWebhookEndpointRow {
  return {
    id: row.id,
    label: row.label,
    webhookUrl: row.webhookUrl,
    isEnabled: row.isEnabled,
    sortOrder: row.sortOrder,
    hasSigningSecret: Boolean(decryptSigningSecret(row.iv, row.ciphertext)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listPartnerWebhookEndpoints(): Promise<PartnerWebhookEndpointRow[]> {
  const rows = await prisma.partnerWebhookEndpoint.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(formatRow);
}

export async function createPartnerWebhookEndpoint(input: {
  label?: string | null;
  webhookUrl: string;
  signingSecret: string;
  isEnabled?: boolean;
  sortOrder?: number;
}): Promise<PartnerWebhookEndpointRow> {
  const webhookUrl = normalizeWebhookUrl(input.webhookUrl);
  const signingSecret = input.signingSecret.trim();
  if (!signingSecret) {
    throw new HttpError(400, "Signing secret is required.");
  }

  const enc = encryptJsonPayload({ signingSecret } satisfies StoredSigningSecret);
  try {
    const row = await prisma.partnerWebhookEndpoint.create({
      data: {
        label: input.label?.trim() || null,
        webhookUrl,
        iv: enc.iv,
        ciphertext: enc.ciphertext,
        isEnabled: input.isEnabled ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    invalidatePartnerWebhookTargetCache();
    return formatRow(row);
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      throw new HttpError(409, "A partner webhook with this URL already exists.");
    }
    throw e;
  }
}

export async function updatePartnerWebhookEndpoint(
  id: string,
  input: {
    label?: string | null;
    webhookUrl?: string;
    signingSecret?: string;
    isEnabled?: boolean;
    sortOrder?: number;
  },
): Promise<PartnerWebhookEndpointRow> {
  const existing = await prisma.partnerWebhookEndpoint.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Partner webhook endpoint not found.");
  }

  let webhookUrl = existing.webhookUrl;
  if (input.webhookUrl !== undefined) {
    webhookUrl = normalizeWebhookUrl(input.webhookUrl);
  }

  let iv = existing.iv;
  let ciphertext = existing.ciphertext;
  if (input.signingSecret !== undefined) {
    const signingSecret = input.signingSecret.trim();
    if (!signingSecret) {
      throw new HttpError(400, "Signing secret cannot be empty.");
    }
    const enc = encryptJsonPayload({ signingSecret } satisfies StoredSigningSecret);
    iv = enc.iv;
    ciphertext = enc.ciphertext;
  }

  try {
    const row = await prisma.partnerWebhookEndpoint.update({
      where: { id },
      data: {
        label: input.label !== undefined ? input.label?.trim() || null : undefined,
        webhookUrl,
        iv,
        ciphertext,
        isEnabled: input.isEnabled,
        sortOrder: input.sortOrder,
      },
    });
    invalidatePartnerWebhookTargetCache();
    return formatRow(row);
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      throw new HttpError(409, "A partner webhook with this URL already exists.");
    }
    throw e;
  }
}

export async function deletePartnerWebhookEndpoint(id: string): Promise<void> {
  const existing = await prisma.partnerWebhookEndpoint.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Partner webhook endpoint not found.");
  }
  await prisma.partnerWebhookEndpoint.delete({ where: { id } });
  invalidatePartnerWebhookTargetCache();
}
