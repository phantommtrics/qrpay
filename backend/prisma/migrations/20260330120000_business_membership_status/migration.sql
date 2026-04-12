-- CreateEnum
CREATE TYPE "BusinessMembershipStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'SUSPENDED', 'TERMINATED');

-- AlterTable
ALTER TABLE "BusinessMembership" ADD COLUMN "status" "BusinessMembershipStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "BusinessMembership_businessId_status_idx" ON "BusinessMembership"("businessId", "status");
