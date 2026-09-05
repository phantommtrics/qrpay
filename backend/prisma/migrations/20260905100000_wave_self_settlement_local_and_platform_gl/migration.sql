-- AlterEnum
ALTER TYPE "PlatformJournalSourceType" ADD VALUE 'WAVE_SELF_SETTLEMENT';

-- AlterTable
ALTER TABLE "PlatformJournalEntry" ADD COLUMN "businessId" TEXT;

-- AlterTable
ALTER TABLE "WaveOpsPayout" ADD COLUMN "businessId" TEXT;

-- AlterTable
ALTER TABLE "WaveSelfSettlementPayout" ADD COLUMN "platformJournalEntryId" TEXT;
ALTER TABLE "WaveSelfSettlementPayout" ADD COLUMN "waveOpsPayoutId" TEXT;

-- CreateIndex
CREATE INDEX "PlatformJournalEntry_businessId_idx" ON "PlatformJournalEntry"("businessId");
CREATE INDEX "WaveOpsPayout_businessId_idx" ON "WaveOpsPayout"("businessId");
CREATE UNIQUE INDEX "WaveSelfSettlementPayout_platformJournalEntryId_key" ON "WaveSelfSettlementPayout"("platformJournalEntryId");
CREATE UNIQUE INDEX "WaveSelfSettlementPayout_waveOpsPayoutId_key" ON "WaveSelfSettlementPayout"("waveOpsPayoutId");

-- AddForeignKey
ALTER TABLE "PlatformJournalEntry" ADD CONSTRAINT "PlatformJournalEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WaveOpsPayout" ADD CONSTRAINT "WaveOpsPayout_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WaveSelfSettlementPayout" ADD CONSTRAINT "WaveSelfSettlementPayout_platformJournalEntryId_fkey" FOREIGN KEY ("platformJournalEntryId") REFERENCES "PlatformJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WaveSelfSettlementPayout" ADD CONSTRAINT "WaveSelfSettlementPayout_waveOpsPayoutId_fkey" FOREIGN KEY ("waveOpsPayoutId") REFERENCES "WaveOpsPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
