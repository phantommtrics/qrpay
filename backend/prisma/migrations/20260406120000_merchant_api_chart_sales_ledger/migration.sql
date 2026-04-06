-- ChartAccountCategory created in 20260405120000_platform_accounting

-- CreateEnum
CREATE TYPE "JournalSourceType" AS ENUM ('CUSTOMER_SALE_PAYMENT');

-- CreateEnum
CREATE TYPE "SalesLedgerEntryType" AS ENUM ('CUSTOMER_SALE');

-- CreateEnum
CREATE TYPE "SalesLedgerDirection" AS ENUM ('MONEY_IN');

-- CreateEnum
CREATE TYPE "SalesLedgerStatus" AS ENUM ('SUCCEEDED');

-- CreateTable
CREATE TABLE "BusinessGatewayCredential" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "iv" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessGatewayCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ChartAccountCategory" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memo" TEXT,
    "sourceType" "JournalSourceType",
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "chartOfAccountId" TEXT NOT NULL,
    "debitAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesLedgerEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT,
    "paymentId" TEXT,
    "journalEntryId" TEXT NOT NULL,
    "type" "SalesLedgerEntryType" NOT NULL,
    "direction" "SalesLedgerDirection" NOT NULL,
    "status" "SalesLedgerStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "provider" TEXT NOT NULL,
    "providerPaymentRef" TEXT,
    "metadata" JSONB,
    "succeededAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessGatewayCredential_businessId_gatewayId_key" ON "BusinessGatewayCredential"("businessId", "gatewayId");

-- CreateIndex
CREATE INDEX "BusinessGatewayCredential_businessId_idx" ON "BusinessGatewayCredential"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_businessId_code_key" ON "ChartOfAccount"("businessId", "code");

-- CreateIndex
CREATE INDEX "ChartOfAccount_businessId_idx" ON "ChartOfAccount"("businessId");

-- CreateIndex
CREATE INDEX "JournalEntry_businessId_postedAt_idx" ON "JournalEntry"("businessId", "postedAt");

-- CreateIndex
CREATE INDEX "JournalEntry_businessId_sourceType_sourceId_idx" ON "JournalEntry"("businessId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalLine_chartOfAccountId_idx" ON "JournalLine"("chartOfAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesLedgerEntry_paymentId_key" ON "SalesLedgerEntry"("paymentId");

-- CreateIndex
CREATE INDEX "SalesLedgerEntry_businessId_createdAt_idx" ON "SalesLedgerEntry"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesLedgerEntry_orderId_idx" ON "SalesLedgerEntry"("orderId");

-- AddForeignKey
ALTER TABLE "BusinessGatewayCredential" ADD CONSTRAINT "BusinessGatewayCredential_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessGatewayCredential" ADD CONSTRAINT "BusinessGatewayCredential_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "PaymentGateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLedgerEntry" ADD CONSTRAINT "SalesLedgerEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLedgerEntry" ADD CONSTRAINT "SalesLedgerEntry_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLedgerEntry" ADD CONSTRAINT "SalesLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLedgerEntry" ADD CONSTRAINT "SalesLedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
