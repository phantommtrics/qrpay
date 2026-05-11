/**
 * Server-to-server integration for an internal partner app (e.g. field booking).
 * Set INTERNAL_PARTNER_API_SECRET to enable POST /api/internal-partner/v1/* routes.
 * Comma-separated values = multiple accepted secrets (e.g. one key per partner app); any match authorizes.
 *
 * Outbound payment webhooks: comma-separated INTERNAL_PARTNER_WEBHOOK_URL values.
 * Signing: INTERNAL_PARTNER_WEBHOOK_SECRET applies to every URL, or set INTERNAL_PARTNER_WEBHOOK_SECRETS
 * with one value (same HMAC key for all URLs) or N values paired to N URLs (isolated keys per partner).
 * Per-business webhookUrl overrides still use INTERNAL_PARTNER_WEBHOOK_SECRET unless the URL matches
 * a configured env pair (then that pair's secret is used).
 */
export function internalPartnerApiSecrets(): readonly string[] | null {
  const list = splitCommaList(process.env.INTERNAL_PARTNER_API_SECRET);
  return list.length > 0 ? list : null;
}

/** First configured API secret, or null (prefer internalPartnerApiSecrets for auth). */
export function internalPartnerApiSecret(): string | null {
  return internalPartnerApiSecrets()?.[0] ?? null;
}

let warnedInvalidWebhookSecrets = false;

function splitCommaList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type InternalPartnerWebhookTarget = {
  url: string;
  secret: string;
};

let cachedTargets: InternalPartnerWebhookTarget[] | null | undefined;

function parseInternalPartnerWebhookTargets(): InternalPartnerWebhookTarget[] | null {
  const urls = splitCommaList(process.env.INTERNAL_PARTNER_WEBHOOK_URL);
  if (urls.length === 0) {
    return null;
  }

  const secretsCsv = process.env.INTERNAL_PARTNER_WEBHOOK_SECRETS?.trim();
  const globalSecret = process.env.INTERNAL_PARTNER_WEBHOOK_SECRET?.trim();

  if (secretsCsv) {
    const secrets = splitCommaList(secretsCsv);
    if (secrets.length === 1) {
      return urls.map((url) => ({ url, secret: secrets[0]! }));
    }
    if (secrets.length === urls.length) {
      return urls.map((url, i) => ({ url, secret: secrets[i]! }));
    }
    if (!warnedInvalidWebhookSecrets) {
      warnedInvalidWebhookSecrets = true;
      console.warn(
        "[internal-partner] INTERNAL_PARTNER_WEBHOOK_SECRETS must have either 1 value (same key for all URLs) or the same count as comma-separated INTERNAL_PARTNER_WEBHOOK_URL; webhook targets ignored.",
      );
    }
    return null;
  }

  if (globalSecret) {
    return urls.map((url) => ({ url, secret: globalSecret }));
  }

  return null;
}

/**
 * Parsed default webhook destinations (URL + HMAC key). Null when not configured or when
 * INTERNAL_PARTNER_WEBHOOK_SECRETS length does not match URL count (unless exactly one secret is set).
 */
export function internalPartnerWebhookTargetsFromEnv(): InternalPartnerWebhookTarget[] | null {
  if (cachedTargets === undefined) {
    cachedTargets = parseInternalPartnerWebhookTargets();
  }
  return cachedTargets;
}

/** First default webhook URL, or null (backward compatible helper). */
export function internalPartnerWebhookUrlFromEnv(): string | null {
  const targets = internalPartnerWebhookTargetsFromEnv();
  return targets?.[0]?.url ?? null;
}

/** Global signing secret for per-business webhook overrides and legacy single-URL setups. */
export function internalPartnerWebhookSigningSecretFromEnv(): string | null {
  const s = process.env.INTERNAL_PARTNER_WEBHOOK_SECRET?.trim();
  return s ? s : null;
}

/**
 * HMAC key for POSTs to this webhook URL. Uses the env URL↔secret pair when the URL matches;
 * otherwise falls back to INTERNAL_PARTNER_WEBHOOK_SECRET (required for arbitrary per-business URLs).
 */
export function internalPartnerWebhookSigningSecretForOutboundUrl(webhookUrl: string): string | null {
  const trimmed = webhookUrl.trim();
  if (!trimmed) {
    return null;
  }
  const targets = internalPartnerWebhookTargetsFromEnv();
  if (targets) {
    for (const t of targets) {
      if (t.url === trimmed) {
        return t.secret;
      }
    }
  }
  return internalPartnerWebhookSigningSecretFromEnv();
}
