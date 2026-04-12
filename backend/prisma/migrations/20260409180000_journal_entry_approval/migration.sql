-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "journalApprovalExempt" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "JournalEntry_approvedAt_idx" ON "JournalEntry"("approvedAt");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Grandfather existing postings as approved; mark customer sale / wallet fee journals as exempt from future approval requirements.
UPDATE "JournalEntry"
SET
  "approvedAt" = "postedAt",
  "journalApprovalExempt" = CASE
    WHEN "sourceType" IN ('CUSTOMER_SALE_PAYMENT', 'CUSTOMER_SALE_WALLET_FEE') THEN true
    ELSE false
  END;
