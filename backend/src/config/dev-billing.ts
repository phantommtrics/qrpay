/**
 * Simulated subscription invoice pay (POST .../invoices/:id/pay without Wave).
 * Controlled only by server env — never trust the client.
 *
 * - Production (NODE_ENV=production): off unless ALLOW_DEV_SUBSCRIPTION_INVOICE_PAY=true
 * - Non-production: on unless ALLOW_DEV_SUBSCRIPTION_INVOICE_PAY=false
 */
export function isDevSubscriptionInvoicePayAllowed(): boolean {
  const raw = process.env.ALLOW_DEV_SUBSCRIPTION_INVOICE_PAY?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}
