-- Bank-style chart accounts (mirror operating bank accounts) vs general ledger lines.
DO $$
BEGIN
  CREATE TYPE "ChartAccountKind" AS ENUM ('LEDGER', 'BANK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ChartOfAccount" ADD COLUMN IF NOT EXISTS "kind" "ChartAccountKind" NOT NULL DEFAULT 'LEDGER';
ALTER TABLE "ChartOfAccount" ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT;
ALTER TABLE "ChartOfAccount" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "ChartOfAccount" ADD COLUMN IF NOT EXISTS "bankDetails" TEXT;
