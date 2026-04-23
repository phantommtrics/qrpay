import axios, { type AxiosInstance } from "axios";

import { HttpError } from "../lib/http-error.js";

function waveErrorMessageFromResponseData(data: unknown): string {
  if (data == null) {
    return "Empty response body.";
  }
  if (typeof data === "string") {
    return data.slice(0, 500);
  }
  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["message", "error", "detail", "description"] as const) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) {
        return v.trim().slice(0, 500);
      }
    }
  }
  try {
    return JSON.stringify(data).slice(0, 500);
  } catch {
    return "Unparseable error body.";
  }
}

/** Maps Wave HTTP API failures to {@link HttpError} so partners do not see a generic 500. */
export function rethrowWaveAxiosError(error: unknown, context: string): never {
  if (axios.isAxiosError(error) && error.response) {
    const status = error.response.status;
    const waveMsg = waveErrorMessageFromResponseData(error.response.data);
    const suffix = waveMsg ? `: ${waveMsg}` : "";
    if (status === 401 || status === 403) {
      throw new HttpError(502, `${context}: Wave API rejected credentials (${status})${suffix}`);
    }
    if (status >= 400 && status < 500) {
      throw new HttpError(502, `${context}: Wave API request rejected (${status})${suffix}`);
    }
    throw new HttpError(502, `${context}: Wave API error (${status})${suffix}`);
  }
  if (axios.isAxiosError(error)) {
    const code = error.code ? String(error.code) : "";
    const hint = code ? ` (${code})` : "";
    throw new HttpError(
      503,
      `${context}: Cannot reach Wave API${hint}. ${error.message || "Network error"}`,
    );
  }
  throw error;
}

export interface WaveCheckoutSessionRequest {
  amount: string;
  currency: string;
  success_url: string;
  error_url: string;
  client_reference?: string | null;
  restrict_payer_mobile?: string;
}

export interface WaveCheckoutSession {
  id: string;
  amount: string;
  checkout_status: "open" | "complete" | "expired";
  client_reference?: string | null;
  currency: string;
  error_url: string;
  last_payment_error?: {
    code: string;
    message: string;
  } | null;
  business_name?: string;
  payment_status: "processing" | "cancelled" | "succeeded";
  transaction_id?: string;
  aggregated_merchant_id?: string;
  restrict_payer_mobile?: string;
  success_url: string;
  wave_launch_url: string;
  when_completed?: string | null;
  when_created: string;
  when_expires: string;
}

export interface WaveConfig {
  baseUrl: string;
  bearerToken: string;
}

export class WavePaymentService {
  private api: AxiosInstance;
  private baseUrl: string;

  constructor(config: WaveConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.api = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${config.bearerToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 30000,
    });
  }

  async createCheckoutSession(payload: WaveCheckoutSessionRequest): Promise<WaveCheckoutSession> {
    try {
      const res = await this.api.post<WaveCheckoutSession>("/v1/checkout/sessions", payload);
      return res.data;
    } catch (e) {
      rethrowWaveAxiosError(e, "Wave checkout session");
    }
  }

  async getCheckoutSession(sessionId: string): Promise<WaveCheckoutSession> {
    try {
      const res = await this.api.get<WaveCheckoutSession>(`/v1/checkout/sessions/${sessionId}`);
      return res.data;
    } catch (e) {
      rethrowWaveAxiosError(e, "Wave get checkout session");
    }
  }
}
