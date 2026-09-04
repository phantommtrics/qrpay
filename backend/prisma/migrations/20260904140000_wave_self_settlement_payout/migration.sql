-- CreateEnum
CREATE TYPE "WaveSelfSettlementPayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "WaveSelfSettlementPayout" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "aggregatedMerchantId" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "withholdAmount" DECIMAL(12,2) NOT NULL,
    "requestedReceiveAmount" DECIMAL(12,2) NOT NULL,
    "receiveAmount" DECIMAL(12,2) NOT NULL,
    "clamped" BOOLEAN NOT NULL DEFAULT false,
    "fee" TEXT,
    "status" "WaveSelfSettlementPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "wavePayoutId" TEXT,
    "clientReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "skipReason" TEXT,
    "waveTimestamp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaveSelfSettlementPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaveSelfSettlementPayout_paymentId_key" ON "WaveSelfSettlementPayout"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "WaveSelfSettlementPayout_wavePayoutId_key" ON "WaveSelfSettlementPayout"("wavePayoutId");

-- CreateIndex
CREATE UNIQUE INDEX "WaveSelfSettlementPayout_idempotencyKey_key" ON "WaveSelfSettlementPayout"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WaveSelfSettlementPayout_status_nextAttemptAt_idx" ON "WaveSelfSettlementPayout"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WaveSelfSettlementPayout_businessId_createdAt_idx" ON "WaveSelfSettlementPayout"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "WaveSelfSettlementPayout" ADD CONSTRAINT "WaveSelfSettlementPayout_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaveSelfSettlementPayout" ADD CONSTRAINT "WaveSelfSettlementPayout_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
