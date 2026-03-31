-- DropForeignKey
ALTER TABLE "staffCreationNotificationLogs" DROP CONSTRAINT "staffCreationNotificationLogs_businessId_fkey";

-- AddForeignKey
ALTER TABLE "staffCreationNotificationLogs" ADD CONSTRAINT "staffCreationNotificationLogs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
