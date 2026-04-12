-- AlterEnum
ALTER TYPE "PlatformJournalSourceType" ADD VALUE 'MANUAL_JOURNAL_REVERSAL';
ALTER TYPE "PlatformJournalSourceType" ADD VALUE 'PURCHASE_BILL_PAYMENT';

-- AlterTable
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "guestToken" TEXT;

-- AlterTable
ALTER TABLE "ActivityLog" ALTER COLUMN "businessId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PlatformJournalEntry" ADD COLUMN "reversesPlatformJournalEntryId" TEXT;

-- CreateTable
CREATE TABLE "PlatformSupplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformBill" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "reference" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "settlementChartAccountId" TEXT,
    "platformJournalEntryId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformBillLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "chartOfAccountId" TEXT NOT NULL,
    "narration" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitLabel" TEXT,
    "unitAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlatformBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_guestToken_key" ON "SubscriptionInvoice"("guestToken");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformJournalEntry_reversesPlatformJournalEntryId_key" ON "PlatformJournalEntry"("reversesPlatformJournalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBill_publicCode_key" ON "PlatformBill"("publicCode");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBill_platformJournalEntryId_key" ON "PlatformBill"("platformJournalEntryId");

-- CreateIndex
CREATE INDEX "PlatformBill_supplierId_status_idx" ON "PlatformBill"("supplierId", "status");

-- CreateIndex
CREATE INDEX "PlatformBillLine_billId_idx" ON "PlatformBillLine"("billId");

-- AddForeignKey
ALTER TABLE "PlatformJournalEntry" ADD CONSTRAINT "PlatformJournalEntry_reversesPlatformJournalEntryId_fkey" FOREIGN KEY ("reversesPlatformJournalEntryId") REFERENCES "PlatformJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBill" ADD CONSTRAINT "PlatformBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "PlatformSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBill" ADD CONSTRAINT "PlatformBill_settlementChartAccountId_fkey" FOREIGN KEY ("settlementChartAccountId") REFERENCES "PlatformChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBill" ADD CONSTRAINT "PlatformBill_platformJournalEntryId_fkey" FOREIGN KEY ("platformJournalEntryId") REFERENCES "PlatformJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillLine" ADD CONSTRAINT "PlatformBillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PlatformBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillLine" ADD CONSTRAINT "PlatformBillLine_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "PlatformChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
