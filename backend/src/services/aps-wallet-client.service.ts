import axios from "axios";

import { HttpError } from "../lib/http-error.js";
import {
  apsWalletAccessChannel,
  apsWalletApiBaseUrl,
  apsWalletAuthorizeCustomerAlreadyLinkedMergeBody,
  apsWalletMerchantCredentials,
} from "../config/aps-wallet-env.js";

/**
 * APS Money Wallet API paths (must match APS docs). Full URL =
 * `${APS_WALLET_BASE_URL}` + path, e.g. https://uat-wallet.apsmoney.gm/api/v1/login
 *
 * TLS/SSL handshake failures happen before any URL path is sent; a wrong path returns HTTP 4xx
 * after TLS succeeds — not an SSL error.
 */
export const APS_WALLET_PATHS = {
  login: "/api/v1/login",
  authorizeCustomer: "/api/v1/payment-gateway/wallet/authorize-customer",
  confirmCustomer: "/api/v1/payment-gateway/wallet/confirm-customer",
  processPayment: "/api/v1/payment-gateway/wallet/process-payment",
  sendPayment: "/api/v1/payment-gateway/wallet/send-payment",
  transactionDetail: "/api/v1/payment-gateway/wallet/transaction",
  unlinkCustomer: "/api/v1/payment-gateway/wallet/unlink-customer",
} as const;

const LOG_PREFIX = "[APS Wallet]";

function maskPhoneTail(value: string, visible = 3): string {
  const t = value.replace(/\s/g, "");
  if (t.length <= visible) {
    return "(short)";
  }
  return `***${t.slice(-visible)}`;
}

function maskSecret(value: string, head = 4, tail = 4): string {
  const t = value.trim();
  if (t.length <= head + tail) {
    return `(len=${t.length})`;
  }
  return `${t.slice(0, head)}…${t.slice(-tail)}`;
}

/** Debug logs (no passwords, full tokens, or OTP digits). */
function logAps(step: string, detail: Record<string, string | number | boolean | undefined> = {}) {
  console.log(LOG_PREFIX, step, detail);
}

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
  const apsMsg =
    (typeof r.responseMessage === "string" && r.responseMessage.trim()) ||
    (typeof r.responseDescription === "string" &&
      r.responseDescription !== "fail" &&
      r.responseDescription.trim());
  if (apsMsg) {
    return String(apsMsg);
  }
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

const PLATFORM_MERCHANT_CACHE_KEY = "__aps_platform_env__";
const merchantBearerCache = new Map<string, { token: string; expiresAtMs: number }>();
const TOKEN_REFRESH_SKEW_MS = 60_000;
const DEFAULT_TOKEN_TTL_MS = 50 * 60 * 1000;

/**
 * Which merchant session to use for APS login + bearer calls.
 * - `platform_env`: subscription billing; uses APS_WALLET_MOBILE / APS_WALLET_PASSWORD from env.
 * - `business`: POS/orders/guest invoice; uses encrypted username/password per business + gateway.
 */
export type ApsWalletMerchantContext =
  | { scope: "platform_env" }
  | { scope: "business"; cacheKey: string; username: string; password: string };

function merchantCacheKey(ctx: ApsWalletMerchantContext): string {
  return ctx.scope === "platform_env" ? PLATFORM_MERCHANT_CACHE_KEY : ctx.cacheKey;
}

/** Bearer cache key is stable per business + gateway so concurrent merchants do not share tokens. */
export function apsWalletBusinessMerchantContext(input: {
  businessId: string;
  gatewayCode: string;
  username: string;
  password: string;
}): ApsWalletMerchantContext {
  const code = input.gatewayCode.trim().toLowerCase();
  return {
    scope: "business",
    cacheKey: `${input.businessId}:${code}`,
    username: input.username,
    password: input.password,
  };
}

/**
 * Axios only rejects when there is no HTTP response (DNS, TCP, TLS handshake, timeout).
 * With validateStatus: () => true, 4xx/5xx still resolve with a response object.
 */
function throwIfApsUnreachable(error: unknown, what: string): never {
  if (axios.isAxiosError(error) && !error.response) {
    logAps("network_error", { what, code: error.code ? String(error.code) : "?", message: error.message });
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
  merchantCtx: ApsWalletMerchantContext,
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
    merchantBearerCache.delete(merchantCacheKey(merchantCtx));
  }
  if (response.status < 200 || response.status >= 300) {
    const preview =
      response.data && typeof response.data === "object"
        ? JSON.stringify(response.data).slice(0, 400)
        : String(response.data ?? "").slice(0, 200);
    logAps("http_error", { path, status: response.status, bodyPreview: preview });
    const msg = errorMessageFromBody(response.data);
    throw new Error(response.status === 401 ? `Unauthorized: ${msg}` : msg);
  }
  return response.data;
}

/** True when APS indicates the customer wallet is already linked (e.g. repeat payment / new OTP needed). */
function isApsAccountAlreadyLinkedPayload(data: unknown): boolean {
  const s = JSON.stringify(data ?? "").toLowerCase();
  return s.includes("already linked") || s.includes("account already link");
}

async function postAuthorizeCustomerRequest(
  path: string,
  body: JsonRecord,
  bearer: string,
  merchantCtx: ApsWalletMerchantContext,
): Promise<{ status: number; data: unknown }> {
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
    merchantBearerCache.delete(merchantCacheKey(merchantCtx));
  }
  return { status: response.status, data: response.data };
}

function throwAuthorizeCustomerFailed(
  path: string,
  status: number,
  data: unknown,
): never {
  const preview =
    data && typeof data === "object"
      ? JSON.stringify(data).slice(0, 400)
      : String(data ?? "").slice(0, 200);
  logAps("http_error", { path, status, bodyPreview: preview });
  const msg = errorMessageFromBody(data);
  throw new Error(status === 401 ? `Unauthorized: ${msg}` : msg);
}

export async function apsWalletLoginFreshForContext(merchantCtx: ApsWalletMerchantContext): Promise<string> {
  const accessChannel = apsWalletAccessChannel();
  let username: string;
  let password: string;
  if (merchantCtx.scope === "platform_env") {
    const { mobile, password: pw } = apsWalletMerchantCredentials();
    username = mobile;
    password = pw;
  } else {
    username = merchantCtx.username.trim();
    password = merchantCtx.password;
  }
  const cacheKey = merchantCacheKey(merchantCtx);
  const base = apsWalletApiBaseUrl();
  const url = `${base}${APS_WALLET_PATHS.login}`;
  logAps("1_login_start", {
    path: APS_WALLET_PATHS.login,
    baseUrl: base,
    merchantMobile: maskPhoneTail(username),
    accessChannel,
    scope: merchantCtx.scope,
  });
  let response;
  try {
    response = await axios.post(
      url,
      /**
       * UAT returns 422 "username field is required" if only `mobile` is sent.
       * Send `username` and duplicate as `mobile` for doc compatibility.
       */
      {
        username,
        mobile: username,
        password,
        access_channel: accessChannel,
      },
      {
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        timeout: 45_000,
        validateStatus: () => true,
      },
    );
  } catch (e) {
    throwIfApsUnreachable(e, `POST ${APS_WALLET_PATHS.login}`);
  }
  if (response.status < 200 || response.status >= 300) {
    const preview =
      response.data && typeof response.data === "object"
        ? JSON.stringify(response.data).slice(0, 400)
        : String(response.data ?? "");
    logAps("1_login_failed", { httpStatus: response.status, bodyPreview: preview });
    throw new Error(errorMessageFromBody(response.data));
  }
  const data = response.data;
  const token = pickStringDeep(data, ["token", "access_token", "accessToken", "bearer", "jwt"]);
  if (!token) {
    logAps("1_login_failed", { reason: "no_token_in_body", bodyPreview: JSON.stringify(data).slice(0, 400) });
    throw new Error(
      merchantCtx.scope === "platform_env"
        ? "APS Wallet login did not return a token. Check APS_WALLET_MOBILE / APS_WALLET_PASSWORD and API response shape."
        : "APS Wallet login did not return a token. Check merchant username/password and API response shape.",
    );
  }
  const exp =
    typeof data === "object" && data && typeof (data as JsonRecord).expires_in === "number"
      ? Date.now() + Number((data as JsonRecord).expires_in) * 1000
      : Date.now() + DEFAULT_TOKEN_TTL_MS;
  merchantBearerCache.set(cacheKey, { token, expiresAtMs: exp });
  logAps("1_login_ok", {
    httpStatus: response.status,
    bearerTokenChars: token.length,
    cacheExpiresInSec: Math.round((exp - Date.now()) / 1000),
  });
  return token;
}

/** @deprecated Use {@link apsWalletMerchantBearerForContext} */
export async function apsWalletLoginFresh(): Promise<string> {
  return apsWalletLoginFreshForContext({ scope: "platform_env" });
}

export async function apsWalletMerchantBearerForContext(
  merchantCtx: ApsWalletMerchantContext = { scope: "platform_env" },
): Promise<string> {
  const key = merchantCacheKey(merchantCtx);
  const now = Date.now();
  const cached = merchantBearerCache.get(key);
  if (cached && now < cached.expiresAtMs - TOKEN_REFRESH_SKEW_MS) {
    logAps("merchant_bearer_cache_hit", {
      cacheKey: key.slice(0, 24),
      expiresInSec: Math.round((cached.expiresAtMs - now) / 1000),
    });
    return cached.token;
  }
  logAps("merchant_bearer_fresh_login", { cacheKey: key.slice(0, 24) });
  return apsWalletLoginFreshForContext(merchantCtx);
}

export async function apsWalletMerchantBearer(): Promise<string> {
  return apsWalletMerchantBearerForContext({ scope: "platform_env" });
}

/**
 * APS customer wallet numbers must not be sent with a +220 prefix (per integration spec).
 * Strips common Gambia international prefixes if the user pasted them; does not add a prefix.
 */
export function normalizeApsCustomerMobile(input: string): string {
  let s = input.trim().replace(/\s+/g, "");
  if (s.startsWith("+220")) {
    s = s.slice(4);
  } else if (s.startsWith("00220")) {
    s = s.slice(5);
  }
  return s;
}

export async function apsWalletAuthorizeCustomer(
  mobile: string,
  merchantCtx: ApsWalletMerchantContext = { scope: "platform_env" },
): Promise<string> {
  const normalized = normalizeApsCustomerMobile(mobile);
  logAps("2_authorize_customer_start", {
    customerMobile: maskPhoneTail(normalized),
    path: APS_WALLET_PATHS.authorizeCustomer,
  });

  const requestTokenKeys = [
    "request_token",
    "requestToken",
    "request_id",
    "requestId",
    "otp_request_token",
    "token",
  ] as const;

  const tryParseSuccess = (raw: unknown, phase: string): string | null => {
    try {
      assertSuccessPayload(raw, "Authorize customer");
    } catch {
      return null;
    }
    const requestToken = pickStringDeep(raw, [...requestTokenKeys]);
    if (!requestToken) {
      return null;
    }
    logAps("2_authorize_customer_ok", {
      phase,
      requestTokenChars: requestToken.length,
      requestTokenTail: maskSecret(requestToken, 4, 4),
    });
    return requestToken;
  };

  const runAuthorize = async (body: JsonRecord, phase: string): Promise<string | null> => {
    const bearer = await apsWalletMerchantBearerForContext(merchantCtx);
    const { status, data } = await postAuthorizeCustomerRequest(
      APS_WALLET_PATHS.authorizeCustomer,
      body,
      bearer,
      merchantCtx,
    );
    if (status >= 200 && status < 300) {
      const tok = tryParseSuccess(data, phase);
      if (tok) {
        return tok;
      }
      if (isApsAccountAlreadyLinkedPayload(data)) {
        return null;
      }
      const preview =
        data && typeof data === "object" ? JSON.stringify(data).slice(0, 280) : String(data);
      logAps("2_authorize_customer_failed", { phase, reason: "no_request_token", bodyPreview: preview });
      throw new Error(
        `APS Wallet did not return a request token for OTP. Check authorize-customer response keys. Body (truncated): ${preview}`,
      );
    }
    if (status === 400 && isApsAccountAlreadyLinkedPayload(data)) {
      return null;
    }
    throwAuthorizeCustomerFailed(APS_WALLET_PATHS.authorizeCustomer, status, data);
  };

  let token = await runAuthorize({ mobile: normalized }, "first");
  if (token) {
    return token;
  }

  const merge =
    apsWalletAuthorizeCustomerAlreadyLinkedMergeBody() ??
    ({ reauthorize: true } as Record<string, unknown>);
  logAps("2_authorize_customer_retry_after_already_linked", {
    mergeKeys: Object.keys(merge).join(","),
  });
  token = await runAuthorize({ mobile: normalized, ...merge }, "after_already_linked");
  if (token) {
    return token;
  }

  throw new Error(
    [
      'APS Wallet returned "Account already linked" and a second authorize request did not return an OTP token.',
      "Confirm the extra fields APS expects for repeat payments, then set APS_WALLET_AUTH_CUSTOMER_ALREADY_LINKED_MERGE_JSON in server env (JSON merged with { mobile }) or ask APS support.",
    ].join(" "),
  );
}

export async function apsWalletConfirmCustomer(
  otp: string,
  requestToken: string,
  merchantCtx: ApsWalletMerchantContext = { scope: "platform_env" },
): Promise<string> {
  const bearer = await apsWalletMerchantBearerForContext(merchantCtx);
  const otpLen = otp.trim().length;
  logAps("3_confirm_customer_start", {
    path: APS_WALLET_PATHS.confirmCustomer,
    otpDigits: otpLen,
    requestTokenChars: requestToken.length,
    requestTokenTail: maskSecret(requestToken, 4, 4),
  });
  const raw = await postJson(
    APS_WALLET_PATHS.confirmCustomer,
    /** Body: { otp, request_token } */
    {
      otp: otp.trim(),
      request_token: requestToken,
    },
    bearer,
    merchantCtx,
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
    logAps("3_confirm_customer_failed", { reason: "no_authorized_token" });
    throw new Error("APS Wallet did not return an authorized token after OTP confirmation.");
  }
  logAps("3_confirm_customer_ok", {
    authorizedTokenChars: authorized.length,
    authorizedTail: maskSecret(authorized, 4, 4),
  });
  return authorized;
}

export async function apsWalletProcessPayment(
  amount: string,
  authorizedToken: string,
  merchantCtx: ApsWalletMerchantContext = { scope: "platform_env" },
): Promise<{ raw: unknown; reference?: string }> {
  const bearer = await apsWalletMerchantBearerForContext(merchantCtx);
  logAps("4_process_payment_start", {
    path: APS_WALLET_PATHS.processPayment,
    amount,
    authorizedTokenChars: authorizedToken.length,
    authorizedTail: maskSecret(authorizedToken, 4, 4),
  });
  const raw = await postJson(
    APS_WALLET_PATHS.processPayment,
    /** Body: { amount, authorized_token } — amounts sent as strings per APS amount format. */
    {
      amount: amount.trim(),
      authorized_token: authorizedToken,
    },
    bearer,
    merchantCtx,
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
  logAps("4_process_payment_ok", {
    reference: reference ?? "(none parsed)",
  });
  return { raw, reference };
}

export async function apsWalletSendPayment(
  mobile: string,
  amount: string,
  merchantCtx: ApsWalletMerchantContext = { scope: "platform_env" },
): Promise<{ raw: unknown; reference?: string }> {
  const normalized = normalizeApsCustomerMobile(mobile);
  const bearer = await apsWalletMerchantBearerForContext(merchantCtx);
  logAps("send_payment_start", {
    path: APS_WALLET_PATHS.sendPayment,
    customerMobile: maskPhoneTail(normalized),
    amount: amount.trim(),
  });
  const raw = await postJson(
    APS_WALLET_PATHS.sendPayment,
    {
      mobile: normalized,
      amount: amount.trim(),
    },
    bearer,
    merchantCtx,
  );
  assertSuccessPayload(raw, "Send payment");
  const reference = pickStringDeep(raw, [
    "transaction_id",
    "transactionId",
    "reference",
    "id",
    "payment_id",
    "paymentId",
  ]);
  logAps("send_payment_ok", {
    reference: reference ?? "(none parsed)",
  });
  return { raw, reference };
}

export async function apsWalletGetTransaction(
  transactionId: string,
  merchantCtx: ApsWalletMerchantContext = { scope: "platform_env" },
): Promise<{ raw: unknown }> {
  const id = transactionId.trim();
  const bearer = await apsWalletMerchantBearerForContext(merchantCtx);
  logAps("transaction_detail_start", {
    path: APS_WALLET_PATHS.transactionDetail,
    transactionIdTail: maskSecret(id, 4, 4),
  });
  const raw = await postJson(
    APS_WALLET_PATHS.transactionDetail,
    { transaction_id: id },
    bearer,
    merchantCtx,
  );
  assertSuccessPayload(raw, "Transaction detail");
  logAps("transaction_detail_ok");
  return { raw };
}

export async function apsWalletUnlinkCustomer(
  authorizedToken: string,
  merchantCtx: ApsWalletMerchantContext = { scope: "platform_env" },
): Promise<{ raw: unknown }> {
  const bearer = await apsWalletMerchantBearerForContext(merchantCtx);
  logAps("5_unlink_customer_start", {
    path: APS_WALLET_PATHS.unlinkCustomer,
    authorizedTokenChars: authorizedToken.length,
    authorizedTail: maskSecret(authorizedToken, 4, 4),
  });
  const raw = await postJson(
    APS_WALLET_PATHS.unlinkCustomer,
    {
      authorized_token: authorizedToken,
    },
    bearer,
    merchantCtx,
  );
  assertSuccessPayload(raw, "Unlink customer");
  logAps("5_unlink_customer_ok");
  return { raw };
}
