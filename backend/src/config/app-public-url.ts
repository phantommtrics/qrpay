import type { Request } from "express";

import { env } from "./env.js";
import { HttpError } from "../lib/http-error.js";

/** Paths where DirectPay listens for provider → server webhooks (POST). */
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
 * Base URL used to build provider webhook URLs (Wave integration, etc.). Uses **only**
 * `APP_PUBLIC_BASE_URL` so dashboards match where this API’s `/api/webhooks/*` is reachable.
 */
export function appPublicBaseUrlForWebhooks(): string {
  const raw = (env.APP_PUBLIC_BASE_URL ?? "").trim();
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
  const raw = (env.APP_PUBLIC_BASE_URL ?? "").trim();
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
 * Origin for absolute URLs of product images (`/uploads/products/*`).
 * Uses **`PLATFORM_URL`** (host only) so links match the web app; your reverse proxy should forward
 * `/uploads/*` from that host to this API (or serve the same static files).
 */
export function resolveUploadsPublicOrigin(_req: Request): string {
  try {
    const u = new URL(env.PLATFORM_URL);
    return u.origin;
  } catch {
    throw new HttpError(500, "PLATFORM_URL must be a valid URL for product image links.");
  }
}

export function resolveAppPublicBaseForBrowserReturns(req: Request): string {
  const appPublic = (env.APP_PUBLIC_BASE_URL ?? "").trim();
  if (appPublic) {
    return normalizeToHttpsOrigin(appPublic);
  }

  const platformUrl = env.PLATFORM_URL.replace(/\/$/, "");
  if (platformUrl.startsWith("http://")) {
    return platformUrl;
  }
  if (platformUrl.startsWith("https://")) {
    return normalizeToHttpsOrigin(platformUrl);
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
      "Set APP_PUBLIC_BASE_URL or PLATFORM_URL to a public origin for payment return URLs.",
    );
  }
  return appBase;
}
