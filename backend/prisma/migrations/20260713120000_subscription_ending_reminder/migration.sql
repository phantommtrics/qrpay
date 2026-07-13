-- AlterEnum
ALTER TYPE "StaffCreationNotificationType" ADD VALUE 'SUBSCRIPTION_ENDING_REMINDER';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "periodEndReminderSentFor" TIMESTAMP(3);
