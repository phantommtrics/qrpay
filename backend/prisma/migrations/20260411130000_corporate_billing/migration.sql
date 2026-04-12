-- CreateTable
CREATE TABLE "CorporateBillingPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyPrice" DECIMAL(10,2) NOT NULL,
    "yearlyPrice" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorporateBillingPlan_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "corporateBillingPlanId" TEXT,
ADD COLUMN     "corporateBillingInterval" "BillingInterval",
ADD COLUMN     "corporateEntitlementSystemProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_corporateBillingPlanId_fkey" FOREIGN KEY ("corporateBillingPlanId") REFERENCES "CorporateBillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
