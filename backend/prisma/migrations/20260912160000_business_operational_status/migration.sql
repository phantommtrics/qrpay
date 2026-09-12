-- Soft-delete / block lifecycle for businesses (platform admin).
CREATE TYPE "BusinessOperationalStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'TERMINATED');

ALTER TABLE "Business"
ADD COLUMN "operationalStatus" "BusinessOperationalStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "statusReason" TEXT,
ADD COLUMN "statusChangedAt" TIMESTAMP(3),
ADD COLUMN "statusChangedByUserId" TEXT;

CREATE INDEX "Business_operationalStatus_idx" ON "Business"("operationalStatus");
