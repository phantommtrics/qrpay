-- AlterEnum
ALTER TYPE "PlatformJournalSourceType" ADD VALUE 'WAVE_OPS_PAYOUT';
ALTER TYPE "PlatformJournalSourceType" ADD VALUE 'WAVE_OPS_PAYOUT_REVERSAL';

-- AlterTable
ALTER TABLE "WaveOpsPayout" ADD COLUMN "platformJournalEntryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WaveOpsPayout_platformJournalEntryId_key" ON "WaveOpsPayout"("platformJournalEntryId");

-- AddForeignKey
ALTER TABLE "WaveOpsPayout" ADD CONSTRAINT "WaveOpsPayout_platformJournalEntryId_fkey" FOREIGN KEY ("platformJournalEntryId") REFERENCES "PlatformJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
