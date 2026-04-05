-- Manual journal types (money in / out / bank transfer) and business contacts.
DO $$
BEGIN
  ALTER TYPE "JournalSourceType" ADD VALUE 'MANUAL_MONEY_IN';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "JournalSourceType" ADD VALUE 'MANUAL_MONEY_OUT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "JournalSourceType" ADD VALUE 'MANUAL_BANK_TRANSFER';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BusinessContact" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BusinessContact_businessId_idx" ON "BusinessContact"("businessId");
CREATE INDEX IF NOT EXISTS "BusinessContact_businessId_name_idx" ON "BusinessContact"("businessId", "name");

DO $$
BEGIN
  ALTER TABLE "BusinessContact" ADD CONSTRAINT "BusinessContact_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "contactId" TEXT;

CREATE INDEX IF NOT EXISTS "JournalEntry_contactId_idx" ON "JournalEntry"("contactId");

DO $$
BEGIN
  ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "BusinessContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "JournalLine" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(18,6);
ALTER TABLE "JournalLine" ADD COLUMN IF NOT EXISTS "unitLabel" TEXT;
ALTER TABLE "JournalLine" ADD COLUMN IF NOT EXISTS "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
