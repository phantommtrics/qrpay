-- AlterTable
ALTER TABLE "BusinessContact" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "BusinessApsWalletCustomerAuth_businessId_gatewayId_customerMobi" RENAME TO "BusinessApsWalletCustomerAuth_businessId_gatewayId_customer_key";
