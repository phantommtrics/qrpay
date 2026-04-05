-- Per-line narration on customer-sale journal entries.
ALTER TABLE "JournalLine" ADD COLUMN IF NOT EXISTS "description" TEXT;
