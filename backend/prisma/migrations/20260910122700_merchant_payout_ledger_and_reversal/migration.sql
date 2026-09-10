-- AlterEnum
ALTER TYPE "JournalSourceType" ADD VALUE 'WAVE_SELF_SETTLEMENT_PAYOUT';
ALTER TYPE "JournalSourceType" ADD VALUE 'WAVE_SELF_SETTLEMENT_PAYOUT_REVERSAL';
ALTER TYPE "JournalSourceType" ADD VALUE 'WAVE_OPS_MERCHANT_PAYOUT';
ALTER TYPE "JournalSourceType" ADD VALUE 'WAVE_OPS_MERCHANT_PAYOUT_REVERSAL';

-- AlterEnum
ALTER TYPE "SalesLedgerEntryType" ADD VALUE 'SETTLEMENT_PAYOUT';
ALTER TYPE "SalesLedgerEntryType" ADD VALUE 'WAVE_OPS_PAYOUT';

-- AlterTable
ALTER TABLE "WaveOpsPayout" ADD COLUMN "aggregatedMerchantId" TEXT;

-- CreateIndex
CREATE INDEX "WaveOpsPayout_aggregatedMerchantId_idx" ON "WaveOpsPayout"("aggregatedMerchantId");
