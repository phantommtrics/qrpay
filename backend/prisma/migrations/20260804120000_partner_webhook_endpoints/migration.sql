-- CreateTable
CREATE TABLE "PartnerWebhookEndpoint" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "webhookUrl" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerWebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerWebhookEndpoint_webhookUrl_key" ON "PartnerWebhookEndpoint"("webhookUrl");

-- CreateIndex
CREATE INDEX "PartnerWebhookEndpoint_isEnabled_sortOrder_idx" ON "PartnerWebhookEndpoint"("isEnabled", "sortOrder");
