-- CreateEnum
CREATE TYPE "BusinessPaymentMethodStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "PaymentGateway" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentGateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessPaymentMethod" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "metadata" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "BusinessPaymentMethodStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentGateway_code_key" ON "PaymentGateway"("code");

-- CreateIndex
CREATE INDEX "BusinessPaymentMethod_businessId_status_idx" ON "BusinessPaymentMethod"("businessId", "status");

-- CreateIndex
CREATE INDEX "BusinessPaymentMethod_gatewayId_idx" ON "BusinessPaymentMethod"("gatewayId");

-- AddForeignKey
ALTER TABLE "BusinessPaymentMethod" ADD CONSTRAINT "BusinessPaymentMethod_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPaymentMethod" ADD CONSTRAINT "BusinessPaymentMethod_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "PaymentGateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "checkoutSessionId" TEXT,
ADD COLUMN "checkoutProvider" TEXT;

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_checkoutSessionId_idx" ON "SubscriptionInvoice"("checkoutSessionId");
