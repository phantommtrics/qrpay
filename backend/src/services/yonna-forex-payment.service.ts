import axios from "axios";
import crypto from "node:crypto";

export interface YonnaForexPaymentRequest {
  amount: number;
  phone: string;
  currency: string;
  fee: number;
  transactionId: string;
  countryCode: string;
  description?: string;
  orderId?: string;
  appTransactionId?: string;
}

export interface YonnaForexPaymentResponse {
  success: boolean;
  transactionId: string;
  paymentUrl?: string;
  paymentHtml?: string;
  status: "pending" | "completed" | "failed";
  message?: string;
  error?: string;
}

export interface YonnaForexConfig {
  baseUrl: string;
  secretKey: string;
  clientId: string;
}

export interface YonnaForexRequestData {
  client_id: string;
  data: Record<string, unknown>;
  timestamp: number;
  signature?: string;
}

export class YonnaForexPaymentService {
  private config: YonnaForexConfig;

  constructor(config: YonnaForexConfig) {
    this.config = config;
  }

  async processPayment(paymentRequest: YonnaForexPaymentRequest): Promise<YonnaForexPaymentResponse> {
    try {
      const { amount, phone, currency, fee, transactionId, countryCode, appTransactionId } =
        paymentRequest;

      const trimmedPhone = (phone || "").replace(/\s+/g, "");
      const trimmedCode = (countryCode || "").replace(/\s+/g, "");
      let fullPhone = trimmedPhone;
      if (trimmedPhone.startsWith("+")) {
        fullPhone = trimmedPhone;
      } else if (trimmedPhone.startsWith(trimmedCode.replace(/^\+/, ""))) {
        fullPhone = trimmedCode.startsWith("+")
          ? `+${trimmedPhone}`.replace(/^\+\+/, "+")
          : `+${trimmedPhone}`;
      } else if (trimmedCode) {
        const cc = trimmedCode.startsWith("+") ? trimmedCode : `+${trimmedCode}`;
        fullPhone = `${cc}${trimmedPhone}`;
      } else {
        fullPhone = trimmedPhone.startsWith("+") ? trimmedPhone : `+${trimmedPhone}`;
      }

      const timestamp = Math.floor(Date.now() / 1000);

      const dataObject: Record<string, unknown> = {
        amount,
        phone: fullPhone,
        transactionId:
          transactionId || `YF_${timestamp}_${Math.random().toString(36).slice(2, 11).toUpperCase()}`,
        description: "",
        fee,
        currency,
        appTransactionId: appTransactionId ?? undefined,
      };

      const requestData: YonnaForexRequestData = {
        client_id: this.config.clientId,
        data: dataObject,
        timestamp,
      };

      const dataString = JSON.stringify(dataObject);
      const stringToSign = `${this.config.clientId}|${timestamp}|${dataString}`;
      const signature = crypto.createHmac("sha256", this.config.secretKey).update(stringToSign).digest("hex");
      requestData.signature = signature;

      const response = await axios.post(this.config.baseUrl, requestData, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 30_000,
      });

      if (response.status === 401) {
        const errorMsg = String(
          (response.data as { error?: string; message?: string })?.error ||
            (response.data as { message?: string })?.message ||
            "Authentication failed",
        );
        if (errorMsg.includes("Invalid signature")) {
          return {
            success: false,
            transactionId: paymentRequest.transactionId,
            status: "failed",
            error: "Invalid API credentials.",
            message: "Payment service configuration error",
          };
        }
        if (errorMsg.toLowerCase().includes("invalid client")) {
          return {
            success: false,
            transactionId: paymentRequest.transactionId,
            status: "failed",
            error: "Invalid client credentials (client_id).",
            message: "Payment service authentication failed",
          };
        }
        if (errorMsg.includes("Missing parameters")) {
          return {
            success: false,
            transactionId: paymentRequest.transactionId,
            status: "failed",
            error: "API format error.",
            message: "Payment service configuration error",
          };
        }
      }

      if (response.status === 200) {
        const contentType = String(response.headers["content-type"] || "");
        if (typeof response.data === "string" && contentType.includes("text/html")) {
          const html: string = response.data;
          let deeplinkUrl: string | undefined;
          const varLinkMatch = html.match(/var\s+link\s*=\s*"([^"]+)"/);
          if (varLinkMatch?.[1]) {
            deeplinkUrl = varLinkMatch[1];
          } else {
            const varLinkMatchSingle = html.match(/var\s+link\s*=\s*'([^']+)'/);
            if (varLinkMatchSingle?.[1]) {
              deeplinkUrl = varLinkMatchSingle[1];
            } else {
              const urlMatch = html.match(/https?:\/\/[^"']+\/corporate\?[^"']+/);
              if (urlMatch?.[0]) {
                deeplinkUrl = urlMatch[0];
              }
            }
          }
          return {
            success: true,
            transactionId,
            status: "pending",
            message: "Scan the QR code to complete payment",
            paymentHtml: html,
            ...(deeplinkUrl ? { paymentUrl: deeplinkUrl } : {}),
          };
        }

        return {
          success: true,
          transactionId,
          status: "pending",
          message: "Payment initiated. Awaiting customer confirmation",
        };
      }

      return {
        success: false,
        transactionId,
        status: "failed",
        error: "Payment processing failed",
        message: (response.data as { message?: string })?.message || "Unknown error occurred",
      };
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      const apiError = err?.response?.data ?? err?.message ?? error;
      const msg =
        typeof apiError === "object" && apiError !== null && "message" in apiError
          ? String((apiError as { message: unknown }).message)
          : String(apiError);
      return {
        success: false,
        transactionId: paymentRequest.transactionId,
        status: "failed",
        error: msg || "Payment processing failed",
        message: "Unable to process payment at this time",
      };
    }
  }

  generateTransactionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `YF_${timestamp}_${random}`.toUpperCase();
  }
}
