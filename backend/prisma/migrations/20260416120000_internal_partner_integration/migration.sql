-- Internal partner (e.g. 7-aside) — waived platform billing + outbound payment webhooks
ALTER TABLE "Business" ADD COLUMN "platformBillingWaived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "partnerProvisioningExternalUserId" TEXT;
ALTER TABLE "Business" ADD COLUMN "internalPartnerWebhookUrl" TEXT;

CREATE UNIQUE INDEX "Business_partnerProvisioningExternalUserId_key" ON "Business"("partnerProvisioningExternalUserId");

ALTER TABLE "Order" ADD COLUMN "partnerExternalBookingId" TEXT;

CREATE INDEX "Order_businessId_partnerExternalBookingId_idx" ON "Order"("businessId", "partnerExternalBookingId");
