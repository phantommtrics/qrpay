import axios from "axios";

import { HttpError } from "../lib/http-error.js";
import { apsWalletApiBaseUrl, apsWalletMerchantCredentials } from "../config/aps-wallet-env.js";

type JsonRecord = Record<string, unknown>;

function pickString(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") {
    return undefined;
  }
  const r = obj as JsonRecord;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  const data = r.data;
  if (data && typeof data === "object") {
    for (const k of keys) {
      const v = (data as JsonRecord)[k];
      if (typeof v === "string" && v.trim()) {
        return v.trim();
      }
    }
  }
  return undefined;
}

function errorMessageFromBody(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "APS Wallet request failed.";
  }
  const r = data as JsonRecord;
  const msg =
    (typeof r.message === "string" && r.message) ||
    (typeof r.error === "string" && r.error) ||
    (typeof r.errors === "string" && r.errors);
  if (msg) {
    return String(msg);
  }
  if (Array.isArray(r.errors) && r.errors.length > 0) {
    const first = r.errors[0];
    if (typeof first === "string") {
      return first;
    }
    if (first && typeof first === "object" && "message" in first && typeof first.message === "string") {
      return first.message;
    }
  }
  return "APS Wallet request failed.";
}

/** Find first non-empty string for any of keys, walking nested objects (typical API envelopes). */
function pickStringDeep(obj: unknown, keys: string[], maxDepth = 6): string | undefined {
  if (maxDepth <= 0 || obj == null) {
    return undefined;
  }
  if (typeof obj !== "object") {
    return undefined;
  }
  const r = obj as JsonRecord;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  for (const v of Object.values(r)) {
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      const found = pickStringDeep(v, keys, maxDepth - 1);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function assertSuccessPayload(raw: unknown, context: string): void {
  if (!raw || typeof raw !== "object") {
    return;
  }
  const r = raw as JsonRecord;
  if (r.success === false || r.status === "error" || r.status === "failed") {
    const msg =
      pickStringDeep(r, ["message", "error", "msg", "description"]) ||
      `${context} was not accepted by APS Wallet.`;
    throw new Error(msg);
  }
}

let cachedMerchantToken: { token: string; expiresAtMs: number } | null = null;
const TOKEN_REFRESH_SKEW_MS = 60_000;
const DEFAULT_TOKEN_TTL_MS = 50 * 60 * 1000;

/**
 * Axios only rejects when there is no HTTP response (DNS, TCP, TLS handshake, timeout).
 * With validateStatus: () => true, 4xx/5xx still resolve with a response object.
 */
function throwIfApsUnreachable(error: unknown, what: string): never {
  if (axios.isAxiosError(error) && !error.response) {
    const code = error.code ? String(error.code) : "";
    const msg = error.message || "Request failed";
    throw new HttpError(
      503,
      [
        `Cannot connect to APS Wallet (${what}).`,
        code ? `Network: ${code}.` : "",
        msg,
        "Check APS_WALLET_BASE_URL, firewall/VPN, and TLS access to the host.",
        "If Windows curl shows schannel/TLS errors, try WSL/Git Bash curl or test from another network — Node may still work if OpenSSL handshakes succeed.",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  throw error;
}

async function postJson(
  path: string,
  body: JsonRecord,
  bearer: string,
): Promise<unknown> {
  const base = apsWalletApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  let response;
  try {
    response = await axios.post(url, body, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      timeout: 45_000,
      validateStatus: () => true,
    });
  } catch (e) {
    throwIfApsUnreachable(e, `POST ${path}`);
  }
  if (response.status === 401) {
    cachedMerchantToken = null;
  }
  if (response.status < 200 || response.status >= 300) {
    const msg = errorMessageFromBody(response.data);
    throw new Error(response.status === 401 ? `Unauthorized: ${msg}` : msg);
  }
  return response.data;
}

export async function apsWalletLoginFresh(): Promise<string> {
  const { mobile, password, accessChannel } = apsWalletMerchantCredentials();
  const base = apsWalletApiBaseUrl();
  const url = `${base}/api/v1/login`;
  let response;
  try {
    response = await axios.post(
      url,
      { mobile, password, access_channel: accessChannel },
      {
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        timeout: 45_000,
        validateStatus: () => true,
      },
    );
  } catch (e) {
    throwIfApsUnreachable(e, "POST /api/v1/login");
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(errorMessageFromBody(response.data));
  }
  const data = response.data;
  const token = pickStringDeep(data, ["token", "access_token", "accessToken", "bearer", "jwt"]);
  if (!token) {
    throw new Error("APS Wallet login did not return a token. Check APS_WALLET_MOBILE / APS_WALLET_PASSWORD and API response shape.");
  }
  const exp =
    typeof data === "object" && data && typeof (data as JsonRecord).expires_in === "number"
      ? Date.now() + Number((data as JsonRecord).expires_in) * 1000
      : Date.now() + DEFAULT_TOKEN_TTL_MS;
  cachedMerchantToken = { token, expiresAtMs: exp };
  return token;
}

export async function apsWalletMerchantBearer(): Promise<string> {
  const now = Date.now();
  if (
    cachedMerchantToken &&
    now < cachedMerchantToken.expiresAtMs - TOKEN_REFRESH_SKEW_MS
  ) {
    return cachedMerchantToken.token;
  }
  return apsWalletLoginFresh();
}

export async function apsWalletAuthorizeCustomer(mobile: string): Promise<string> {
  const bearer = await apsWalletMerchantBearer();
  const normalized = mobile.trim().replace(/\s+/g, "");
  const raw = await postJson(
    "/api/v1/payment-gateway/wallet/authorize-customer",
    { mobile: normalized },
    bearer,
  );
  assertSuccessPayload(raw, "Authorize customer");
  const requestToken = pickStringDeep(raw, [
    "request_token",
    "requestToken",
    "request_id",
    "requestId",
    "otp_request_token",
    "token",
  ]);
  if (!requestToken) {
    const preview =
      raw && typeof raw === "object"
        ? JSON.stringify(raw).slice(0, 280)
        : String(raw);
    throw new Error(
      `APS Wallet did not return a request token for OTP. Check authorize-customer response keys. Body (truncated): ${preview}`,
    );
  }
  return requestToken;
}

export async function apsWalletConfirmCustomer(
  otp: string,
  requestToken: string,
): Promise<string> {
  const bearer = await apsWalletMerchantBearer();
  const raw = await postJson(
    "/api/v1/payment-gateway/wallet/confirm-customer",
    {
      otp: otp.trim(),
      request_token: requestToken,
    },
    bearer,
  );
  assertSuccessPayload(raw, "Confirm customer");
  const authorized = pickStringDeep(raw, [
    "authorized_token",
    "authorizedToken",
    "authorization_token",
    "auth_token",
    "token",
  ]);
  if (!authorized) {
    throw new Error("APS Wallet did not return an authorized token after OTP confirmation.");
  }
  return authorized;
}

export async function apsWalletProcessPayment(
  amount: string,
  authorizedToken: string,
): Promise<{ raw: unknown; reference?: string }> {
  const bearer = await apsWalletMerchantBearer();
  const raw = await postJson(
    "/api/v1/payment-gateway/wallet/process-payment",
    {
      amount: amount.trim(),
      authorized_token: authorizedToken,
    },
    bearer,
  );
  assertSuccessPayload(raw, "Process payment");
  const reference = pickStringDeep(raw, [
    "reference",
    "transaction_id",
    "transactionId",
    "id",
    "payment_id",
    "paymentId",
  ]);
  return { raw, reference };
}
