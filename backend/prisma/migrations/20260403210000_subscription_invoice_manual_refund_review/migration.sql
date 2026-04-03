-- CreateEnum
CREATE TYPE "ManualRefundReviewStatus" AS ENUM ('NONE', 'PENDING_REVIEW', 'APPROVED_FOR_REFUND', 'DECLINED', 'REFUNDED_EXTERNALLY');

-- AlterTable
ALTER TABLE "SubscriptionInvoice" ADD COLUMN     "manualRefundReviewStatus" "ManualRefundReviewStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "manualRefundNote" TEXT,
ADD COLUMN     "manualRefundReviewedAt" TIMESTAMP(3),
ADD COLUMN     "manualRefundReviewedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_manualRefundReviewedByUserId_fkey" FOREIGN KEY ("manualRefundReviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SubscriptionInvoice_manualRefundReviewStatus_idx" ON "SubscriptionInvoice"("manualRefundReviewStatus");

