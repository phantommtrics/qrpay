-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN "yearlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;

UPDATE "Plan" SET "yearlyPrice" = "monthlyPrice" * 12 WHERE "yearlyPrice" = 0;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "billingInterval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY';
