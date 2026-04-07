-- Idempotent: safe when enums/tables already exist (e.g. after a failed or partial apply).

-- CreateEnum
DO $do$ BEGIN
  CREATE TYPE "SalesQuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $do$;

-- CreateEnum
DO $do$ BEGIN
  CREATE TYPE "SalesInvoiceStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'VOID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $do$;

-- AlterEnum
DO $do$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'JournalSourceType' AND e.enumlabel = 'SALES_INVOICE_PAYMENT'
  ) THEN
    ALTER TYPE "JournalSourceType" ADD VALUE 'SALES_INVOICE_PAYMENT';
  END IF;
END $do$;

-- AlterEnum
DO $do$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'StaffCreationNotificationType' AND e.enumlabel = 'SALES_INVOICE_APPROVED'
  ) THEN
    ALTER TYPE "StaffCreationNotificationType" ADD VALUE 'SALES_INVOICE_APPROVED';
  END IF;
END $do$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SalesQuotation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "status" "SalesQuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3),
    "reference" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SalesQuotationLine" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "chartOfAccountId" TEXT NOT NULL,
    "narration" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitLabel" TEXT,
    "unitAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesQuotationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SalesInvoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "sourceQuotationId" TEXT,
    "publicCode" TEXT NOT NULL,
    "status" "SalesInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "reference" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "settlementChartAccountId" TEXT,
    "journalEntryId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SalesInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "chartOfAccountId" TEXT NOT NULL,
    "narration" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitLabel" TEXT,
    "unitAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SalesQuotation_businessId_publicCode_key" ON "SalesQuotation"("businessId", "publicCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesQuotation_businessId_status_idx" ON "SalesQuotation"("businessId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesQuotationLine_quotationId_idx" ON "SalesQuotationLine"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SalesInvoice_sourceQuotationId_key" ON "SalesInvoice"("sourceQuotationId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SalesInvoice_journalEntryId_key" ON "SalesInvoice"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SalesInvoice_businessId_publicCode_key" ON "SalesInvoice"("businessId", "publicCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesInvoice_businessId_status_idx" ON "SalesInvoice"("businessId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesInvoiceLine_invoiceId_idx" ON "SalesInvoiceLine"("invoiceId");

-- AddForeignKey
DO $do$ BEGIN
  ALTER TABLE "SalesQuotation" ADD CONSTRAINT "SalesQuotation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $do$;

-- AddForeignKey
DO $do$ BEGIN
  ALTER TABLE "SalesQuotation" ADD CONSTRAINT "SalesQuotation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "BusinessContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $do$;

-- AddForeignKey
DO $do$ BEGIN
  ALTER TABLE "SalesQuotationLine" ADD CONSTRAINT "SalesQuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "SalesQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $do$;

-- AddForeignKey
DO $do$ BEGIN
  ALTER TABLE "SalesQuotationLine" ADD CONSTRAINT "SalesQuotationLine_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $do$;

-- AddForeignKey
DO $do$ BEGIN
  ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $do$;

-- AddForeignKey
DO $do$ BEGIN
  ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "BusinessContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $do$;

-- AddForeignKey
DO $do$ BEGIN
  ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_sourceQuotationId_fkey" FOREIGN KEY ("sourceQuotationId") REFERENCES "SalesQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $do$;

-- AddForeignKey
DO $do$ BEGIN
  ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_settlementChartAccountId_fkey" FOREIGN KEY ("settlementChartAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $do$;

-- AddForeignKey
DO $do$ BEGIN
  ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $do$;

-- AddForeignKey
DO $do$ BEGIN
  ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $do$;

-- AddForeignKey
DO $do$ BEGIN
  ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $do$;
