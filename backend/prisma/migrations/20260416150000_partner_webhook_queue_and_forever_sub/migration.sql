-- Outbound partner webhook retry queue
CREATE TYPE "PartnerOutboundWebhookJobStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'ABANDONED');

CREATE TABLE "PartnerOutboundWebhookJob" (
    "id" TEXT NOT NULL,
    "status" "PartnerOutboundWebhookJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "webhookUrl" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "lastHttpStatus" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerOutboundWebhookJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PartnerOutboundWebhookJob_status_nextAttemptAt_idx" ON "PartnerOutboundWebhookJob"("status", "nextAttemptAt");

-- Internal partner businesses: no yearly renewal — perpetual comped BASIC (contract infinite)
UPDATE "Subscription" AS s
SET
    "billingInterval" = 'CONTRACT_INFINITE',
    "contractPerpetual" = true,
    "currentPeriodEnd" = NULL
FROM "Business" AS b
WHERE s."businessId" = b."id"
  AND b."platformBillingWaived" = true
  AND b."partnerProvisioningExternalUserId" IS NOT NULL
  AND s."status" = 'ACTIVE';
