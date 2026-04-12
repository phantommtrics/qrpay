-- AlterEnum
ALTER TYPE "StaffCreationNotificationType" ADD VALUE 'SUBSCRIPTION_INVOICE_REFUND_REVIEW';
ALTER TYPE "StaffCreationNotificationType" ADD VALUE 'SUBSCRIPTION_INVOICE_REFUND_APPROVED';

-- AlterTable
ALTER TABLE "SubscriptionInvoice" ADD COLUMN     "manualRefundExpectedBy" TIMESTAMP(3),
ADD COLUMN     "manualRefundApprovedAmount" DECIMAL(10,2);
