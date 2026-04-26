-- CreateTable
CREATE TABLE "corporateInvitationEmailLogs" (
    "id" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactTitle" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "ccEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "senderName" TEXT NOT NULL,
    "senderTitle" TEXT,
    "subject" TEXT NOT NULL,
    "attachmentFilename" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "deliveryStatus" "StaffCreationNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "resendEmailId" TEXT,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporateInvitationEmailLogs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "corporateInvitationEmailLogs_createdAt_idx" ON "corporateInvitationEmailLogs"("createdAt");

-- CreateIndex
CREATE INDEX "corporateInvitationEmailLogs_deliveryStatus_idx" ON "corporateInvitationEmailLogs"("deliveryStatus");

-- CreateIndex
CREATE INDEX "corporateInvitationEmailLogs_recipientEmail_idx" ON "corporateInvitationEmailLogs"("recipientEmail");
