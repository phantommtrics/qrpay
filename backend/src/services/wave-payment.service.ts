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

export type WaveBusinessType = "fintech" | "other";

export interface WaveAggregatedMerchantRequest {
  name: string;
  business_description: string;
  business_type: WaveBusinessType;
  business_registration_identifier?: string | null;
  business_sector?: string | null;
  website_url?: string | null;
  manager_name?: string | null;
}

export interface WaveAggregatedMerchant {
  id: string;
  name: string;
  business_registration_id?: string | null;
  business_sector?: string | null;
  business_type: WaveBusinessType;
  website_url?: string | null;
  payout_fee_structure_name?: string;
  checkout_fee_structure_name?: string;
  business_description: string;
  manager_name?: string | null;
  is_locked: boolean;
  when_created: string;
}

export interface WavePageInfo {
  has_next_page: boolean;
  end_cursor?: string | null;
}

export interface WavePaginatedAggregatedMerchants {
  page_info: WavePageInfo;
  items: WaveAggregatedMerchant[];
}

export interface WaveCheckoutSessionRequest {
  amount: string;
  currency: string;
  success_url: string;
  error_url: string;
  client_reference?: string | null;
  restrict_payer_mobile?: string;
  aggregated_merchant_id?: string;
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

export interface WaveBalance {
  amount: string;
  currency: string;
}

export interface WaveTransaction {
  timestamp: string;
  transaction_id: string;
  amount: string;
  fee: string;
  currency: string;
  counterparty_name?: string;
  counterparty_mobile?: string;
  is_reversal?: boolean;
}

export interface WaveTransactionsResponse {
  page_info: {
    start_cursor?: string | null;
    end_cursor?: string | null;
    has_next_page: boolean;
  };
  date: string;
  items: WaveTransaction[];
}

export interface WavePayoutRequest {
  currency: string;
  receive_amount: string;
  name: string;
  mobile: string;
  client_reference?: string;
  aggregated_merchant_id?: string;
}

export type WavePayoutStatus = "processing" | "succeeded" | "failed";

export interface WavePayoutError {
  error_code: string;
  error_message: string;
}

export interface WavePayout {
  id: string;
  currency: string;
  receive_amount: string;
  fee?: string;
  mobile: string;
  name: string;
  status: WavePayoutStatus;
  timestamp?: string;
  client_reference?: string;
  aggregated_merchant_id?: string;
  payout_error?: WavePayoutError;
}

export interface WavePayoutBatch {
  id: string;
  status: "processing" | "complete";
  payouts: WavePayout[];
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

  private withIdempotency(idempotencyKey: string) {
    return { headers: { "idempotency-key": idempotencyKey } };
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

  async createAggregatedMerchant(
    payload: WaveAggregatedMerchantRequest,
  ): Promise<WaveAggregatedMerchant> {
    try {
      const res = await this.api.post<WaveAggregatedMerchant>(
        "/v1/aggregated_merchants",
        payload,
      );
      return res.data;
    } catch (e) {
      rethrowWaveAxiosError(e, "Wave create aggregated merchant");
    }
  }

  async updateAggregatedMerchant(
    id: string,
    payload: WaveAggregatedMerchantRequest,
  ): Promise<WaveAggregatedMerchant> {
    try {
      const res = await this.api.put<WaveAggregatedMerchant>(
        `/v1/aggregated_merchants/${encodeURIComponent(id)}`,
        payload,
      );
      return res.data;
    } catch (e) {
      rethrowWaveAxiosError(e, "Wave update aggregated merchant");
    }
  }

  async getAggregatedMerchant(id: string): Promise<WaveAggregatedMerchant> {
    try {
      const res = await this.api.get<WaveAggregatedMerchant>(
        `/v1/aggregated_merchants/${encodeURIComponent(id)}`,
      );
      return res.data;
    } catch (e) {
      rethrowWaveAxiosError(e, "Wave get aggregated merchant");
    }
  }

  async deleteAggregatedMerchant(id: string): Promise<void> {
    try {
      await this.api.delete(`/v1/aggregated_merchants/${encodeURIComponent(id)}`);
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        return;
      }
      rethrowWaveAxiosError(e, "Wave delete aggregated merchant");
    }
  }

  async listAggregatedMerchants(params?: {
    first?: number;
    after?: string;
  }): Promise<WavePaginatedAggregatedMerchants> {
    try {
      const res = await this.api.get<WavePaginatedAggregatedMerchants>(
        "/v1/aggregated_merchants",
        { params },
      );
      return res.data;
    } catch (e) {
      rethrowWaveAxiosError(e, "Wave list aggregated merchants");
    }
  }

  async getBalance(): Promise<WaveBalance> {
    try {
      const res = await this.api.get<WaveBalance>("/v1/balance");
      return res.data;
    } catch (e) {
      rethrowWaveAxiosError(e, "Wave get balance");
    }
  }

  async listTransactions(params: {
    date: string;
    after?: string;
  }): Promise<WaveTransactionsResponse> {
    try {
      const res = await this.api.get<WaveTransactionsResponse>("/v1/transactions", {
        params: {
          date: params.date,
          ...(params.after ? { after: params.after } : {}),
        },
      });
      return res.data;
    } catch (e) {
      rethrowWaveAxiosError(e, "Wave list transactions");
    }
  }

  async refundTransaction(transactionId: string, idempotencyKey: string): Promise<void> {
    try {
      await this.api.post(
        `/v1/transactions/${encodeURIComponent(transactionId)}/refund`,
        {},
        this.withIdempotency(idempotencyKey),
      );
    } catch (e) {
      rethrowWaveAxiosError(e, "Wave refund transaction");
    }
  }

  async createPayout(payload: WavePayoutRequest, idempotencyKey: string): Promise<WavePayout> {
    try {
      const res = await this.api.post<WavePayout>(
        "/v1/payout",
        payload,
        this.withIdempotency(idempotencyKey),
      );
      return res.data;
    } catch (e) {
      rethrowWaveAxiosError(e, "Wave create payout");
    }
  }

  async getPayout(payoutId: string): Promise<WavePayout> {
    try {
      const res = await this.api.get<WavePayout>(`/v1/payout/${encodeURIComponent(payoutId)}`);
      return res.data;
    } catch (e) {
      rethrowWaveAxiosError(e, "Wave get payout");
    }
  }

  async searchPayouts(params: { client_reference: string }): Promise<WavePayout[]> {
    try {
      const res = await this.api.get<WavePayout[] | { result?: WavePayout[]; items?: WavePayout[] }>(
        "/v1/payouts/search",
        { params: { client_reference: params.client_reference } },
      );
      const data = res.data;
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.result)) return data.result;
      if (data && Array.isArray(data.items)) return data.items;
      return [];
    } catch (e) {
      rethrowWaveAxiosError(e, "Wave search payouts");
    }
  }

  async createPayoutBatch(
    payouts: WavePayoutRequest[],
    idempotencyKey: string,
  ): Promise<WavePayoutBatch> {
    try {
      const res = await this.api.post<WavePayoutBatch>(
        "/v1/payout-batch",
        { payouts },
        this.withIdempotency(idempotencyKey),
      );
      return res.data;
    } catch (e) {
      rethrowWaveAxiosError(e, "Wave create payout batch");
    }
  }

  async getPayoutBatch(batchId: string): Promise<WavePayoutBatch> {
    try {
      const res = await this.api.get<WavePayoutBatch>(
        `/v1/payout-batch/${encodeURIComponent(batchId)}`,
      );
      return res.data;
    } catch (e) {
      rethrowWaveAxiosError(e, "Wave get payout batch");
    }
  }

  async reversePayout(payoutId: string, idempotencyKey: string): Promise<void> {
    try {
      await this.api.post(
        `/v1/payout/${encodeURIComponent(payoutId)}/reverse`,
        {},
        this.withIdempotency(idempotencyKey),
      );
    } catch (e) {
      rethrowWaveAxiosError(e, "Wave reverse payout");
    }
  }
}
