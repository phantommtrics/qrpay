-- Shared chart enums (must exist before PlatformChartOfAccount; merchant chart migration runs next day)
-- CreateEnum
CREATE TYPE "ChartAccountCategory" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "ChartAccountKind" AS ENUM ('LEDGER', 'BANK');

-- CreateEnum
CREATE TYPE "PlatformJournalSourceType" AS ENUM ('MANUAL', 'SUBSCRIPTION_INVOICE_PAYMENT');

-- CreateTable
CREATE TABLE "PlatformChartOfAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "ChartAccountCategory" NOT NULL,
    "kind" "ChartAccountKind" NOT NULL DEFAULT 'LEDGER',
    "bankAccountNumber" TEXT,
    "bankName" TEXT,
    "bankDetails" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformChartOfAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformJournalEntry" (
    "id" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memo" TEXT,
    "sourceType" "PlatformJournalSourceType",
    "sourceId" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformJournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "chartOfAccountId" TEXT NOT NULL,
    "debitAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "quantity" DECIMAL(18,6),
    "unitLabel" TEXT,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "PlatformJournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformChartOfAccount_code_key" ON "PlatformChartOfAccount"("code");

-- CreateIndex
CREATE INDEX "PlatformChartOfAccount_category_idx" ON "PlatformChartOfAccount"("category");

-- CreateIndex
CREATE INDEX "PlatformJournalEntry_postedAt_idx" ON "PlatformJournalEntry"("postedAt");

-- CreateIndex
CREATE INDEX "PlatformJournalEntry_sourceType_sourceId_idx" ON "PlatformJournalEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "PlatformJournalLine_journalEntryId_idx" ON "PlatformJournalLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "PlatformJournalLine_chartOfAccountId_idx" ON "PlatformJournalLine"("chartOfAccountId");

-- AddForeignKey
ALTER TABLE "PlatformJournalLine" ADD CONSTRAINT "PlatformJournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "PlatformJournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformJournalLine" ADD CONSTRAINT "PlatformJournalLine_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "PlatformChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
