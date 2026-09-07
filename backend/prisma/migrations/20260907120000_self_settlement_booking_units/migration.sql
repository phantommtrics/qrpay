-- AlterTable
ALTER TABLE "WaveSelfSettlementPayout" ADD COLUMN "bookingUnits" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "WaveSelfSettlementPayout" ADD COLUMN "bookingUnitAmount" DECIMAL(12,2);
