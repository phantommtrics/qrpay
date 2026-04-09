import { HttpError } from "../lib/http-error.js";

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

export function apsWalletMerchantCredentials(): {
  mobile: string;
  password: string;
  accessChannel: string;
} {
  const mobile = (process.env.APS_WALLET_MOBILE || "").trim();
  const password = (process.env.APS_WALLET_PASSWORD || "").trim();
  const accessChannel = (process.env.APS_WALLET_ACCESS_CHANNEL || "AGENT APP").trim();
  if (!mobile || !password) {
    throw new HttpError(
      503,
      "APS Wallet merchant login is not configured (APS_WALLET_MOBILE, APS_WALLET_PASSWORD).",
    );
  }
  return { mobile, password, accessChannel };
}
