-- CreateTable
CREATE TABLE "BusinessStation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessStationPump" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessStationPump_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "stationId" TEXT,
ADD COLUMN     "pumpId" TEXT;

-- CreateIndex
CREATE INDEX "BusinessStation_businessId_idx" ON "BusinessStation"("businessId");

-- CreateIndex
CREATE INDEX "BusinessStationPump_stationId_idx" ON "BusinessStationPump"("stationId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessStationPump_stationId_label_key" ON "BusinessStationPump"("stationId", "label");

-- CreateIndex
CREATE INDEX "Order_stationId_idx" ON "Order"("stationId");

-- CreateIndex
CREATE INDEX "Order_pumpId_idx" ON "Order"("pumpId");

-- AddForeignKey
ALTER TABLE "BusinessStation" ADD CONSTRAINT "BusinessStation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessStationPump" ADD CONSTRAINT "BusinessStationPump_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "BusinessStation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "BusinessStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "BusinessStationPump"("id") ON DELETE SET NULL ON UPDATE CASCADE;
