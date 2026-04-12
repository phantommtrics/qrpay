-- CreateEnum
CREATE TYPE "StaffCreationNotificationType" AS ENUM ('EXISTING_USER', 'NEW_USER');

-- CreateEnum
CREATE TYPE "StaffCreationNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "staffCreationNotificationLogs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "staffRole" "UserRole" NOT NULL,
    "notificationType" "StaffCreationNotificationType" NOT NULL,
    "deliveryStatus" "StaffCreationNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "subject" TEXT NOT NULL,
    "resendEmailId" TEXT,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staffCreationNotificationLogs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staffCreationNotificationLogs_businessId_idx" ON "staffCreationNotificationLogs"("businessId");

-- CreateIndex
CREATE INDEX "staffCreationNotificationLogs_userId_idx" ON "staffCreationNotificationLogs"("userId");

-- CreateIndex
CREATE INDEX "staffCreationNotificationLogs_createdAt_idx" ON "staffCreationNotificationLogs"("createdAt");

-- AddForeignKey
ALTER TABLE "staffCreationNotificationLogs" ADD CONSTRAINT "staffCreationNotificationLogs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffCreationNotificationLogs" ADD CONSTRAINT "staffCreationNotificationLogs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
