-- CreateEnum
CREATE TYPE "DigitalOceanInvoiceStatus" AS ENUM ('SYNCED', 'POSTED');

-- CreateTable
CREATE TABLE "DigitalOceanInvoice" (
    "id" TEXT NOT NULL,
    "invoiceUuid" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "billingPeriod" TEXT NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "isPreview" BOOLEAN NOT NULL DEFAULT false,
    "status" "DigitalOceanInvoiceStatus" NOT NULL DEFAULT 'SYNCED',
    "summarySnapshot" JSONB,
    "fxRateGmdPerUsd" DECIMAL(18,6),
    "amountGmd" DECIMAL(12,2),
    "settlementChartAccountId" TEXT,
    "platformBillId" TEXT,
    "platformJournalEntryId" TEXT,
    "postedAt" TIMESTAMP(3),
    "postedByUserId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalOceanInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DigitalOceanInvoice_invoiceUuid_key" ON "DigitalOceanInvoice"("invoiceUuid");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalOceanInvoice_platformBillId_key" ON "DigitalOceanInvoice"("platformBillId");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalOceanInvoice_platformJournalEntryId_key" ON "DigitalOceanInvoice"("platformJournalEntryId");

-- CreateIndex
CREATE INDEX "DigitalOceanInvoice_status_idx" ON "DigitalOceanInvoice"("status");

-- CreateIndex
CREATE INDEX "DigitalOceanInvoice_billingPeriod_idx" ON "DigitalOceanInvoice"("billingPeriod");

-- CreateIndex
CREATE INDEX "DigitalOceanInvoice_syncedAt_idx" ON "DigitalOceanInvoice"("syncedAt");

-- AddForeignKey
ALTER TABLE "DigitalOceanInvoice" ADD CONSTRAINT "DigitalOceanInvoice_settlementChartAccountId_fkey" FOREIGN KEY ("settlementChartAccountId") REFERENCES "PlatformChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalOceanInvoice" ADD CONSTRAINT "DigitalOceanInvoice_platformBillId_fkey" FOREIGN KEY ("platformBillId") REFERENCES "PlatformBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalOceanInvoice" ADD CONSTRAINT "DigitalOceanInvoice_platformJournalEntryId_fkey" FOREIGN KEY ("platformJournalEntryId") REFERENCES "PlatformJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalOceanInvoice" ADD CONSTRAINT "DigitalOceanInvoice_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
