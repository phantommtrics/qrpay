-- AlterTable
ALTER TABLE "BusinessMembership" ADD COLUMN "assignedStationId" TEXT;

-- CreateIndex
CREATE INDEX "BusinessMembership_assignedStationId_idx" ON "BusinessMembership"("assignedStationId");

-- AddForeignKey
ALTER TABLE "BusinessMembership" ADD CONSTRAINT "BusinessMembership_assignedStationId_fkey" FOREIGN KEY ("assignedStationId") REFERENCES "BusinessStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
