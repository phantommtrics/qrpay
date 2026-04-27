-- Owner browser Push API subscriptions for merchant payment alerts.
CREATE TABLE "businessOwnerPushSubscriptions" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "businessOwnerPushSubscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "businessOwnerPushSubscriptions_endpoint_key"
  ON "businessOwnerPushSubscriptions"("endpoint");

CREATE INDEX "businessOwnerPushSubscriptions_businessId_idx"
  ON "businessOwnerPushSubscriptions"("businessId");

CREATE INDEX "businessOwnerPushSubscriptions_userId_idx"
  ON "businessOwnerPushSubscriptions"("userId");

CREATE INDEX "businessOwnerPushSubscriptions_businessId_userId_idx"
  ON "businessOwnerPushSubscriptions"("businessId", "userId");

ALTER TABLE "businessOwnerPushSubscriptions"
  ADD CONSTRAINT "businessOwnerPushSubscriptions_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "businessOwnerPushSubscriptions"
  ADD CONSTRAINT "businessOwnerPushSubscriptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
