import { HttpError } from "../lib/http-error.js";
import { waveApiBaseUrl } from "../config/payment-provider-env.js";
import { WavePaymentService } from "./wave-payment.service.js";

/** True when the single Wave portal checkout key is configured. */
export function isPlatformWaveCheckoutConfigured(): boolean {
  return Boolean((process.env.WAVE_CHECKOUT_BEARER || "").trim());
}

/**
 * Wave API client using `WAVE_CHECKOUT_BEARER` (one portal key for all checkouts).
 * Sales sessions must call `createSalesCheckoutSession` (aggregated merchant).
 * Platform subscription invoices must call `createPlatformCheckoutSession` (no aggregated merchant).
 */
export function waveServiceFromEnv(): WavePaymentService {
  const baseUrl = waveApiBaseUrl();
  const bearer = (process.env.WAVE_CHECKOUT_BEARER || "").trim();
  if (!bearer) {
    throw new HttpError(503, "Online checkout is not configured (WAVE_CHECKOUT_BEARER).");
  }
  return new WavePaymentService({ baseUrl, bearerToken: bearer });
}
