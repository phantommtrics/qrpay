-- CreateEnum
CREATE TYPE "WaveAggregatedMerchantProvisionTrigger" AS ENUM ('ORGANIZATION_CREATED', 'PLATFORM_MANUAL', 'INTERNAL_PARTNER_PROVISION', 'API_CREATE_BUSINESS');

-- CreateEnum
CREATE TYPE "WaveAggregatedMerchantProvisionOperation" AS ENUM ('CREATE', 'UPDATE');

-- CreateEnum
CREATE TYPE "WaveAggregatedMerchantProvisionStatus" AS ENUM ('SKIPPED', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "WaveAggregatedMerchantProvisionLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "trigger" "WaveAggregatedMerchantProvisionTrigger" NOT NULL,
    "operation" "WaveAggregatedMerchantProvisionOperation",
    "status" "WaveAggregatedMerchantProvisionStatus" NOT NULL,
    "requestedName" TEXT,
    "requestPayload" JSONB,
    "aggregatedMerchantId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaveAggregatedMerchantProvisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaveAggregatedMerchantProvisionLog_businessId_createdAt_idx" ON "WaveAggregatedMerchantProvisionLog"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "WaveAggregatedMerchantProvisionLog" ADD CONSTRAINT "WaveAggregatedMerchantProvisionLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
