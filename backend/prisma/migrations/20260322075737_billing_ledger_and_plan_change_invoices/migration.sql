-- CreateEnum
CREATE TYPE "BillingLedgerEntryType" AS ENUM ('INVOICE_PAYMENT', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "BillingLedgerDirection" AS ENUM ('MONEY_IN', 'MONEY_OUT');

-- CreateEnum
CREATE TYPE "BillingLedgerStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BillingLedgerEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "subscriptionInvoiceId" TEXT,
    "type" "BillingLedgerEntryType" NOT NULL,
    "direction" "BillingLedgerDirection" NOT NULL,
    "status" "BillingLedgerStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "provider" TEXT NOT NULL,
    "providerCheckoutSessionId" TEXT,
    "providerPaymentRef" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "succeededAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingLedgerEntry_providerCheckoutSessionId_key" ON "BillingLedgerEntry"("providerCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingLedgerEntry_idempotencyKey_key" ON "BillingLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BillingLedgerEntry_businessId_createdAt_idx" ON "BillingLedgerEntry"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingLedgerEntry_subscriptionInvoiceId_idx" ON "BillingLedgerEntry"("subscriptionInvoiceId");

-- CreateIndex
CREATE INDEX "BillingLedgerEntry_subscriptionId_idx" ON "BillingLedgerEntry"("subscriptionId");

-- AddForeignKey
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_subscriptionInvoiceId_fkey" FOREIGN KEY ("subscriptionInvoiceId") REFERENCES "SubscriptionInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
