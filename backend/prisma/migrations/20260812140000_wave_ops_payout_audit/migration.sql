-- CreateTable
CREATE TABLE "WaveOpsPayoutBatch" (
    "id" TEXT NOT NULL,
    "waveBatchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaveOpsPayoutBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaveOpsPayout" (
    "id" TEXT NOT NULL,
    "wavePayoutId" TEXT,
    "batchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "currency" TEXT NOT NULL,
    "receiveAmount" TEXT NOT NULL,
    "fee" TEXT,
    "mobile" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "platformSupplierId" TEXT,
    "platformBillId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "waveTimestamp" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaveOpsPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaveOpsPayoutBatch_waveBatchId_key" ON "WaveOpsPayoutBatch"("waveBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "WaveOpsPayoutBatch_idempotencyKey_key" ON "WaveOpsPayoutBatch"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WaveOpsPayoutBatch_createdAt_idx" ON "WaveOpsPayoutBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaveOpsPayout_wavePayoutId_key" ON "WaveOpsPayout"("wavePayoutId");

-- CreateIndex
CREATE UNIQUE INDEX "WaveOpsPayout_idempotencyKey_key" ON "WaveOpsPayout"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WaveOpsPayout_createdAt_idx" ON "WaveOpsPayout"("createdAt");

-- CreateIndex
CREATE INDEX "WaveOpsPayout_status_idx" ON "WaveOpsPayout"("status");

-- CreateIndex
CREATE INDEX "WaveOpsPayout_platformSupplierId_idx" ON "WaveOpsPayout"("platformSupplierId");

-- CreateIndex
CREATE INDEX "WaveOpsPayout_clientReference_idx" ON "WaveOpsPayout"("clientReference");

-- CreateIndex
CREATE INDEX "WaveOpsPayout_batchId_idx" ON "WaveOpsPayout"("batchId");

-- AddForeignKey
ALTER TABLE "WaveOpsPayout" ADD CONSTRAINT "WaveOpsPayout_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "WaveOpsPayoutBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaveOpsPayout" ADD CONSTRAINT "WaveOpsPayout_platformSupplierId_fkey" FOREIGN KEY ("platformSupplierId") REFERENCES "PlatformSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaveOpsPayout" ADD CONSTRAINT "WaveOpsPayout_platformBillId_fkey" FOREIGN KEY ("platformBillId") REFERENCES "PlatformBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
