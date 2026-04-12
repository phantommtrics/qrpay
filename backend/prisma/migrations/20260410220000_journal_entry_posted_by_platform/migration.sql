-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN "postedByPlatformUserId" TEXT;

-- CreateIndex
CREATE INDEX "JournalEntry_postedByPlatformUserId_idx" ON "JournalEntry"("postedByPlatformUserId");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_postedByPlatformUserId_fkey" FOREIGN KEY ("postedByPlatformUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
