/** Browser base for links in customer emails (quotation / invoice guest pages). */
export function getPublicWebAppBaseUrl(): string {
  const raw =
    process.env.PUBLIC_WEB_APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  return raw.replace(/\/$/, "");
}

export function guestQuotationUrl(guestToken: string): string {
  return `${getPublicWebAppBaseUrl()}/guest/quotation/${encodeURIComponent(guestToken)}`;
}

export function guestInvoiceUrl(guestToken: string): string {
  return `${getPublicWebAppBaseUrl()}/guest/invoice/${encodeURIComponent(guestToken)}`;
}
