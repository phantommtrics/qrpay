-- CreateEnum
CREATE TYPE "SalesInvoiceRecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');

-- AlterTable
ALTER TABLE "SalesInvoice" ADD COLUMN "recurrenceId" TEXT;
ALTER TABLE "SalesInvoice" ADD COLUMN "occurrenceDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SalesInvoiceRecurrence" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "settlementChartAccountId" TEXT,
    "reference" TEXT,
    "dueOffsetDays" INTEGER,
    "frequency" "SalesInvoiceRecurrenceFrequency" NOT NULL,
    "intervalDays" INTEGER,
    "customDates" JSONB,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextIssueAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "autoApprove" BOOLEAN NOT NULL DEFAULT true,
    "shareBundleId" TEXT,
    "lastGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesInvoiceRecurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoiceRecurrenceLine" (
    "id" TEXT NOT NULL,
    "recurrenceId" TEXT NOT NULL,
    "chartOfAccountId" TEXT NOT NULL,
    "narration" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitLabel" TEXT,
    "unitAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesInvoiceRecurrenceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoiceRecurrence_publicToken_key" ON "SalesInvoiceRecurrence"("publicToken");

-- CreateIndex
CREATE INDEX "SalesInvoiceRecurrence_businessId_active_nextIssueAt_idx" ON "SalesInvoiceRecurrence"("businessId", "active", "nextIssueAt");

-- CreateIndex
CREATE INDEX "SalesInvoiceRecurrence_shareBundleId_idx" ON "SalesInvoiceRecurrence"("shareBundleId");

-- CreateIndex
CREATE INDEX "SalesInvoiceRecurrenceLine_recurrenceId_idx" ON "SalesInvoiceRecurrenceLine"("recurrenceId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_recurrenceId_occurrenceDate_key" ON "SalesInvoice"("recurrenceId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "SalesInvoice_recurrenceId_issueDate_idx" ON "SalesInvoice"("recurrenceId", "issueDate");

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "SalesInvoiceRecurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceRecurrence" ADD CONSTRAINT "SalesInvoiceRecurrence_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceRecurrence" ADD CONSTRAINT "SalesInvoiceRecurrence_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "BusinessContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceRecurrence" ADD CONSTRAINT "SalesInvoiceRecurrence_settlementChartAccountId_fkey" FOREIGN KEY ("settlementChartAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceRecurrence" ADD CONSTRAINT "SalesInvoiceRecurrence_shareBundleId_fkey" FOREIGN KEY ("shareBundleId") REFERENCES "SalesInvoiceShareBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceRecurrenceLine" ADD CONSTRAINT "SalesInvoiceRecurrenceLine_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "SalesInvoiceRecurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceRecurrenceLine" ADD CONSTRAINT "SalesInvoiceRecurrenceLine_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
