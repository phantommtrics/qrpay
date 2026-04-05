import { HttpError } from "../lib/http-error.js";

/** Wave API host; merchant and platform checkout share this (per-business bearer is stored encrypted). */
export function waveApiBaseUrl(): string {
  return (process.env.WAVE_API_BASE_URL?.trim() || "https://api.wave.com").replace(/\/+$/, "");
}

/**
 * Yonna Forex API host from server env only (not per business).
 * Per-business values are client ID, secret key, and optional webhook secret.
 */
export function yonnaForexApiBaseUrl(): string {
  const baseUrl = (process.env.YONNA_FOREX_API_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new HttpError(
      503,
      "YONNA_FOREX_API_URL is not set in the server environment.",
    );
  }
  return baseUrl;
}
