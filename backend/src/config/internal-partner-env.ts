/**
 * Server-to-server integration for an internal partner app (e.g. field booking).
 * Set INTERNAL_PARTNER_API_SECRET to enable POST /api/internal-partner/v1/* routes.
 */
export function internalPartnerApiSecret(): string | null {
  const s = process.env.INTERNAL_PARTNER_API_SECRET?.trim();
  return s ? s : null;
}

export function internalPartnerWebhookUrlFromEnv(): string | null {
  const s = process.env.INTERNAL_PARTNER_WEBHOOK_URL?.trim();
  return s ? s : null;
}

export function internalPartnerWebhookSigningSecretFromEnv(): string | null {
  const s = process.env.INTERNAL_PARTNER_WEBHOOK_SECRET?.trim();
  return s ? s : null;
}
