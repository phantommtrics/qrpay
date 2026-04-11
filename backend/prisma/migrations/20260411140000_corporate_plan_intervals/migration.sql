-- AlterEnum PlanCode
ALTER TYPE "PlanCode" ADD VALUE 'CORPORATE';

-- AlterEnum BillingInterval (existing: MONTHLY, YEARLY)
ALTER TYPE "BillingInterval" ADD VALUE 'QUARTERLY';
ALTER TYPE "BillingInterval" ADD VALUE 'HALF_YEARLY';
ALTER TYPE "BillingInterval" ADD VALUE 'TWO_YEARS';
ALTER TYPE "BillingInterval" ADD VALUE 'CONTRACT_INFINITE';

-- AlterTable CorporateBillingPlan
ALTER TABLE "CorporateBillingPlan" ADD COLUMN "quarterlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "CorporateBillingPlan" ADD COLUMN "halfYearlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "CorporateBillingPlan" ADD COLUMN "twoYearPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "CorporateBillingPlan" ADD COLUMN "contractPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable Subscription — perpetual contract may have no period end
ALTER TABLE "Subscription" ADD COLUMN "contractPerpetual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subscription" ALTER COLUMN "currentPeriodEnd" DROP NOT NULL;
