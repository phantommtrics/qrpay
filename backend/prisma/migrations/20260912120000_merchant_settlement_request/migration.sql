-- CreateEnum
CREATE TYPE "MerchantSettlementRequestStatus" AS ENUM ('OPEN', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "MerchantSettlementRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "note" TEXT,
    "status" "MerchantSettlementRequestStatus" NOT NULL DEFAULT 'OPEN',
    "ticketingTicketId" TEXT,
    "ticketingRef" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantSettlementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantSettlementRequest_businessId_createdAt_idx" ON "MerchantSettlementRequest"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "MerchantSettlementRequest_status_idx" ON "MerchantSettlementRequest"("status");

-- CreateIndex
CREATE INDEX "MerchantSettlementRequest_ticketingTicketId_idx" ON "MerchantSettlementRequest"("ticketingTicketId");

-- AddForeignKey
ALTER TABLE "MerchantSettlementRequest" ADD CONSTRAINT "MerchantSettlementRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantSettlementRequest" ADD CONSTRAINT "MerchantSettlementRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
