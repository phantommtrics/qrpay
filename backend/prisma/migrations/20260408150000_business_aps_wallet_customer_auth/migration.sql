-- CreateTable
CREATE TABLE "BusinessApsWalletCustomerAuth" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "customerMobileNormalized" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessApsWalletCustomerAuth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessApsWalletCustomerAuth_businessId_gatewayId_customerMobileNormalized_key" ON "BusinessApsWalletCustomerAuth"("businessId", "gatewayId", "customerMobileNormalized");

-- CreateIndex
CREATE INDEX "BusinessApsWalletCustomerAuth_businessId_idx" ON "BusinessApsWalletCustomerAuth"("businessId");

-- AddForeignKey
ALTER TABLE "BusinessApsWalletCustomerAuth" ADD CONSTRAINT "BusinessApsWalletCustomerAuth_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessApsWalletCustomerAuth" ADD CONSTRAINT "BusinessApsWalletCustomerAuth_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "PaymentGateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
