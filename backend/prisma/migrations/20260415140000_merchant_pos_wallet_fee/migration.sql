-- Merchant POS/order QR wallet fee: enums, sales ledger pair per payment (fee % stored in gateway credentials)
ALTER TYPE "JournalSourceType" ADD VALUE 'CUSTOMER_SALE_WALLET_FEE';
ALTER TYPE "SalesLedgerEntryType" ADD VALUE 'WALLET_FEE';
ALTER TYPE "SalesLedgerDirection" ADD VALUE 'MONEY_OUT';

DROP INDEX IF EXISTS "SalesLedgerEntry_paymentId_key";

CREATE UNIQUE INDEX "SalesLedgerEntry_paymentId_type_key" ON "SalesLedgerEntry"("paymentId", "type");
