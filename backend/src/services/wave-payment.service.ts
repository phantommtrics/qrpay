import axios, { type AxiosInstance } from "axios";

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
    const res = await this.api.post<WaveCheckoutSession>("/v1/checkout/sessions", payload);
    return res.data;
  }

  async getCheckoutSession(sessionId: string): Promise<WaveCheckoutSession> {
    const res = await this.api.get<WaveCheckoutSession>(`/v1/checkout/sessions/${sessionId}`);
    return res.data;
  }
}
