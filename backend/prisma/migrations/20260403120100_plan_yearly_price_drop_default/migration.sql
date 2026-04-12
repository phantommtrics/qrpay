-- Prisma schema has no @default on yearlyPrice; drop default added in prior migration for backfill
ALTER TABLE "Plan" ALTER COLUMN "yearlyPrice" DROP DEFAULT;
