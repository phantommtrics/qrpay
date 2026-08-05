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

/** Normalize webhook URLs so stored values and per-business overrides match reliably. */
export function canonicalPartnerWebhookUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function webhookUrlsMatch(a: string, b: string): boolean {
  const ca = canonicalPartnerWebhookUrl(a);
  const cb = canonicalPartnerWebhookUrl(b);
  return ca === cb || a.trim() === b.trim();
}

function normalizeWebhookUrl(raw: string): string {
  const url = canonicalPartnerWebhookUrl(raw);
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

async function findEnabledPartnerWebhookEndpointByUrl(webhookUrl: string) {
  const rows = await prisma.partnerWebhookEndpoint.findMany({
    where: { isEnabled: true },
    select: { id: true, webhookUrl: true, iv: true, ciphertext: true },
  });
  for (const row of rows) {
    if (webhookUrlsMatch(row.webhookUrl, webhookUrl)) {
      return row;
    }
  }
  return null;
}

async function loadPartnerWebhookTargetsFromDb(): Promise<{
  targets: InternalPartnerWebhookTarget[];
  totalRows: number;
  enabledRows: number;
  skippedDecrypt: number;
}> {
  const rows = await prisma.partnerWebhookEndpoint.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const targets: InternalPartnerWebhookTarget[] = [];
  let skippedDecrypt = 0;
  for (const row of rows) {
    if (!row.isEnabled) {
      continue;
    }
    const secret = decryptSigningSecret(row.iv, row.ciphertext);
    if (!secret) {
      skippedDecrypt += 1;
      console.warn(
        `[internal-partner] Skipping partner webhook endpoint ${row.id} (${row.webhookUrl}): could not decrypt signing secret (check APP_SECRET_ENCRYPTION_KEY and re-save the secret in Partnership config).`,
      );
      continue;
    }
    targets.push({ url: row.webhookUrl, secret });
  }
  return {
    targets,
    totalRows: rows.length,
    enabledRows: rows.filter((r) => r.isEnabled).length,
    skippedDecrypt,
  };
}

/**
 * Active outbound webhook destinations. DB rows take precedence; env vars are fallback when DB is empty.
 */
export async function loadPartnerWebhookTargets(): Promise<InternalPartnerWebhookTarget[]> {
  if (cachedTargets && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedTargets;
  }

  const db = await loadPartnerWebhookTargetsFromDb();
  const fromEnv = internalPartnerWebhookTargetsFromEnv() ?? [];

  if (db.targets.length > 0) {
    cachedTargets = db.targets;
  } else if (fromEnv.length > 0) {
    if (db.totalRows > 0) {
      console.warn(
        `[internal-partner] ${db.totalRows} partnership webhook endpoint(s) in DB (${db.enabledRows} enabled, ${db.skippedDecrypt} undecryptable) — using ${fromEnv.length} env fallback target(s).`,
      );
    }
    cachedTargets = fromEnv;
  } else {
    if (db.totalRows > 0) {
      console.warn(
        `[internal-partner] ${db.totalRows} partnership webhook endpoint(s) in DB (${db.enabledRows} enabled, ${db.skippedDecrypt} undecryptable) but none are deliverable.`,
      );
    }
    cachedTargets = [];
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

  const row = await findEnabledPartnerWebhookEndpointByUrl(trimmed);
  if (row) {
    const secret = decryptSigningSecret(row.iv, row.ciphertext);
    if (secret) {
      return secret;
    }
  }

  const envTargets = internalPartnerWebhookTargetsFromEnv() ?? [];
  for (const t of envTargets) {
    if (webhookUrlsMatch(t.url, trimmed)) {
      return t.secret;
    }
  }

  return internalPartnerWebhookSigningSecretFromEnv();
}

/**
 * Resolves outbound webhook URLs for a partner business.
 * Per-business webhookUrl sends only to that URL when a signing secret exists; otherwise falls back to global endpoints.
 */
export async function resolvePartnerWebhookUrlsForBusiness(
  internalPartnerWebhookUrl: string | null | undefined,
): Promise<string[]> {
  const globalTargets = await loadPartnerWebhookTargets();
  const globalUrls = globalTargets.map((t) => t.url);

  const perBiz = internalPartnerWebhookUrl?.trim();
  if (perBiz) {
    const secret = await partnerWebhookSigningSecretForUrl(perBiz);
    if (secret) {
      const row = await findEnabledPartnerWebhookEndpointByUrl(perBiz);
      return [row?.webhookUrl ?? canonicalPartnerWebhookUrl(perBiz)];
    }
    console.warn(
      `[internal-partner] Per-business webhookUrl has no signing secret (${perBiz}); falling back to ${globalUrls.length} global partnership endpoint(s). Add this URL in Platform → Security → Partnership config with its signing secret.`,
    );
  }

  return globalUrls;
}

export type PartnerWebhookEndpointRow = {
  id: string;
  label: string | null;
  webhookUrl: string;
  isEnabled: boolean;
  sortOrder: number;
  hasSigningSecret: boolean;
  deliverable: boolean;
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
  const hasSigningSecret = Boolean(decryptSigningSecret(row.iv, row.ciphertext));
  return {
    id: row.id,
    label: row.label,
    webhookUrl: row.webhookUrl,
    isEnabled: row.isEnabled,
    sortOrder: row.sortOrder,
    hasSigningSecret,
    deliverable: row.isEnabled && hasSigningSecret,
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
