import type { Request } from "express";

import { HttpError } from "../lib/http-error.js";

/** Paths where EasyPay listens for provider → server webhooks (POST). */
export const PAYMENT_WEBHOOK_HTTP_PATHS = {
  wave: "/api/webhooks/wave",
  yonnaForex: "/api/webhooks/yonna-forex",
} as const;

function normalizeToHttpsOrigin(raw: string): string {
  let appBase = raw.replace(/\/$/, "");
  if (appBase.startsWith("http://")) {
    appBase = appBase.replace("http://", "https://");
  }
  if (!appBase.startsWith("https://")) {
    throw new HttpError(
      500,
      "Public app base must be a valid HTTPS origin (set APP_PUBLIC_BASE_URL).",
    );
  }
  return appBase;
}

/**
 * Base URL used to build provider webhook URLs. Uses **only** `APP_PUBLIC_BASE_URL`
 * so Wave/Yonna dashboards match where this API is reachable (same host must route `/api/webhooks/*` here).
 */
export function appPublicBaseUrlForWebhooks(): string {
  const raw = (process.env.APP_PUBLIC_BASE_URL || "").trim();
  if (!raw) {
    throw new HttpError(
      503,
      "APP_PUBLIC_BASE_URL is not set. Providers cannot target webhook URLs until it is configured.",
    );
  }
  return normalizeToHttpsOrigin(raw);
}

/** Same as {@link appPublicBaseUrlForWebhooks} but returns null if unset or invalid. */
export function tryAppPublicBaseUrlForWebhooks(): string | null {
  const raw = (process.env.APP_PUBLIC_BASE_URL || "").trim();
  if (!raw) {
    return null;
  }
  try {
    return normalizeToHttpsOrigin(raw);
  } catch {
    return null;
  }
}

export type PaymentWebhookEndpoints = {
  wave: string;
  yonnaForex: string;
};

/** Absolute URLs providers should call (POST) for subscription checkout updates. */
export function getPaymentWebhookEndpoints(): PaymentWebhookEndpoints | null {
  const base = tryAppPublicBaseUrlForWebhooks();
  if (!base) {
    return null;
  }
  return {
    wave: `${base}${PAYMENT_WEBHOOK_HTTP_PATHS.wave}`,
    yonnaForex: `${base}${PAYMENT_WEBHOOK_HTTP_PATHS.yonnaForex}`,
  };
}

/**
 * Public origin for **browser** return URLs after checkout. Prefers `APP_PUBLIC_BASE_URL`, then request origin, then fallbacks.
 */
export function resolveAppPublicBaseForBrowserReturns(req: Request): string {
  const env = process.env.APP_PUBLIC_BASE_URL?.trim();
  if (env) {
    return normalizeToHttpsOrigin(env);
  }

  const rawBase =
    (req.headers.origin as string) ||
    process.env.CLIENT_BASE_URL ||
    process.env.WEB_APP_URL ||
    process.env.FRONTEND_BASE_URL ||
    "";
  let appBase = rawBase ? rawBase.replace(/\/$/, "") : "";
  if (appBase.startsWith("http://")) {
    appBase = appBase.replace("http://", "https://");
  }
  if (!appBase || !appBase.startsWith("https://")) {
    throw new HttpError(
      500,
      "APP_PUBLIC_BASE_URL must be set to a public HTTPS origin for payment return URLs.",
    );
  }
  return appBase;
}
