import { HttpError } from "../lib/http-error.js";

/** True when the server has an APS API base URL (required for all APS calls, including business checkout). */
export function isApsWalletApiBaseConfigured(): boolean {
  return Boolean((process.env.APS_WALLET_BASE_URL || "").trim());
}

/**
 * True when platform subscription APS checkout can use env-only merchant login
 * (APS_WALLET_MOBILE + APS_WALLET_PASSWORD + base URL). Business POS/order APS uses encrypted credentials per merchant.
 */
export function isApsWalletPlatformMerchantConfigured(): boolean {
  const baseUrl = (process.env.APS_WALLET_BASE_URL || "").trim();
  const mobile = (process.env.APS_WALLET_MOBILE || "").trim();
  const password = (process.env.APS_WALLET_PASSWORD || "").trim();
  return Boolean(baseUrl && mobile && password);
}

/** @deprecated Use isApsWalletApiBaseConfigured or isApsWalletPlatformMerchantConfigured */
export function isApsWalletServerConfigured(): boolean {
  return isApsWalletPlatformMerchantConfigured();
}

/** APS Money Wallet API base (no trailing slash), e.g. https://uat-wallet.apsmoney.gm */
export function apsWalletApiBaseUrl(): string {
  const baseUrl = (process.env.APS_WALLET_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new HttpError(
      503,
      "APS Wallet is not configured (APS_WALLET_BASE_URL).",
    );
  }
  return baseUrl;
}

/** Sent as `access_channel` on merchant login; shared for platform and business flows. */
export function apsWalletAccessChannel(): string {
  return (process.env.APS_WALLET_ACCESS_CHANNEL || "AGENT APP").trim();
}

/**
 * Platform-only merchant login (subscription invoice checkout). Business orders/invoices use
 * {@link getDecryptedGatewaySecrets} username/password per business.
 */
export function apsWalletMerchantCredentials(): {
  mobile: string;
  password: string;
  accessChannel: string;
} {
  const mobile = (process.env.APS_WALLET_MOBILE || "").trim();
  const password = (process.env.APS_WALLET_PASSWORD || "").trim();
  const accessChannel = apsWalletAccessChannel();
  if (!mobile || !password) {
    throw new HttpError(
      503,
      "APS Wallet platform merchant login is not configured (APS_WALLET_MOBILE, APS_WALLET_PASSWORD).",
    );
  }
  return { mobile, password, accessChannel };
}

/**
 * Optional JSON object merged into the **second** authorize-customer request when APS returns
 * "Account already linked" (repeat customer payments). Example: `{"reauthorize":true}` or fields per APS docs.
 * If unset, the server retries once with `{ mobile, reauthorize: true }`.
 */
export function apsWalletAuthorizeCustomerAlreadyLinkedMergeBody(): Record<string, unknown> | null {
  const raw = (process.env.APS_WALLET_AUTH_CUSTOMER_ALREADY_LINKED_MERGE_JSON || "").trim();
  if (!raw) {
    return null;
  }
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}
