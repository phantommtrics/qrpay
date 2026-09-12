-- AlterTable
ALTER TABLE "MerchantSettlementRequest" ADD COLUMN "platformJournalId" TEXT;
ALTER TABLE "MerchantSettlementRequest" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "MerchantSettlementRequest" ADD COLUMN "completedByUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MerchantSettlementRequest_platformJournalId_key" ON "MerchantSettlementRequest"("platformJournalId");

-- AddForeignKey
ALTER TABLE "MerchantSettlementRequest" ADD CONSTRAINT "MerchantSettlementRequest_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
