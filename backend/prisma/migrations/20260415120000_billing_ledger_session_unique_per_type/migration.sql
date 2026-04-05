-- Allow two billing rows per checkout session (e.g. INVOICE_PAYMENT + WALLET_FEE with same Wave/Yonna session id)
DROP INDEX IF EXISTS "BillingLedgerEntry_providerCheckoutSessionId_key";

CREATE UNIQUE INDEX "BillingLedgerEntry_providerCheckoutSessionId_type_key" ON "BillingLedgerEntry"("providerCheckoutSessionId", "type");
