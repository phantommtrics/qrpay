-- AlterTable
ALTER TABLE "SalesQuotation" ADD COLUMN "guestToken" TEXT;

-- AlterTable
ALTER TABLE "SalesInvoice" ADD COLUMN "guestToken" TEXT;

CREATE UNIQUE INDEX "SalesQuotation_guestToken_key" ON "SalesQuotation"("guestToken");

CREATE UNIQUE INDEX "SalesInvoice_guestToken_key" ON "SalesInvoice"("guestToken");

-- Payment: optional order, optional sales invoice (exactly one required at app layer)
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_orderId_fkey";

ALTER TABLE "Payment" ALTER COLUMN "orderId" DROP NOT NULL;

ALTER TABLE "Payment" ADD COLUMN "salesInvoiceId" TEXT;

CREATE UNIQUE INDEX "Payment_salesInvoiceId_key" ON "Payment"("salesInvoiceId");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "StaffCreationNotificationType" ADD VALUE IF NOT EXISTS 'SALES_QUOTATION_SENT';
