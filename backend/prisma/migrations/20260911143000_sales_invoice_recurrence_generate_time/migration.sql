-- AlterTable
ALTER TABLE "SalesInvoiceRecurrence" ADD COLUMN "generateHour" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "SalesInvoiceRecurrence" ADD COLUMN "generateMinute" INTEGER NOT NULL DEFAULT 0;
