import { env } from "../config/env.js";

/**
 * Browser base for customer-facing links (guest quotation/invoice pages, `/pay/:token`).
 * Uses **`PLATFORM_URL`** from the backend `.env` (same app URL used in subscription emails).
 */
export function getPublicWebAppBaseUrl(): string {
  return env.PLATFORM_URL.replace(/\/$/, "");
}

/**
 * The web app uses **HashRouter** (`webFrontend/src/App.tsx`). External links (emails, Wave
 * return URLs) must use `/#/path`, not `/path`, or the router sees an empty hash and shows `/` (landing).
 */
export function spaHashRoute(appBaseNoTrailingSlash: string, pathWithLeadingSlash: string): string {
  const base = appBaseNoTrailingSlash.replace(/\/$/, "");
  const p = pathWithLeadingSlash.startsWith("/") ? pathWithLeadingSlash : `/${pathWithLeadingSlash}`;
  return `${base}/#${p}`;
}

export function buildPayUrl(publicToken: string): string {
  return spaHashRoute(getPublicWebAppBaseUrl(), `/pay/${encodeURIComponent(publicToken)}`);
}

export function guestQuotationUrl(guestToken: string): string {
  return spaHashRoute(
    getPublicWebAppBaseUrl(),
    `/guest/quotation/${encodeURIComponent(guestToken)}`,
  );
}

export function guestInvoiceUrl(guestToken: string): string {
  return spaHashRoute(getPublicWebAppBaseUrl(), `/guest/invoice/${encodeURIComponent(guestToken)}`);
}
