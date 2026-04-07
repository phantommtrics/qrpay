-- AlterEnum
ALTER TYPE "JournalSourceType" ADD VALUE 'MANUAL_JOURNAL_REVERSAL';

-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN "reversesJournalEntryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversesJournalEntryId_key" ON "JournalEntry"("reversesJournalEntryId");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversesJournalEntryId_fkey" FOREIGN KEY ("reversesJournalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
