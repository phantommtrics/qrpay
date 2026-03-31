-- AlterEnum
ALTER TYPE "StaffCreationNotificationType" ADD VALUE 'PLATFORM_ADMIN_INVITE';

-- AlterTable
ALTER TABLE "staffCreationNotificationLogs" ALTER COLUMN "businessId" DROP NOT NULL;
