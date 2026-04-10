-- CreateEnum
CREATE TYPE "ApsWalletCustomerAuthMerchantScope" AS ENUM ('BUSINESS_MERCHANT', 'PLATFORM_SUBSCRIPTION');

-- AlterTable
ALTER TABLE "BusinessApsWalletCustomerAuth" ADD COLUMN "merchantScope" "ApsWalletCustomerAuthMerchantScope" NOT NULL DEFAULT 'BUSINESS_MERCHANT';

-- DropIndex
DROP INDEX "BusinessApsWalletCustomerAuth_businessId_gatewayId_customerMobileNormalized_key";

-- CreateIndex
CREATE UNIQUE INDEX "BusinessApsWalletCustomerAuth_businessId_gatewayId_customerMobileNormalized_merchantScope_key" ON "BusinessApsWalletCustomerAuth"("businessId", "gatewayId", "customerMobileNormalized", "merchantScope");
