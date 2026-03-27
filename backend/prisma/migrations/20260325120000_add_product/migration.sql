-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "barcodeType" TEXT NOT NULL DEFAULT 'CODE128',
    "barcodeValue" TEXT NOT NULL,
    "qrUrl" TEXT NOT NULL,
    "imageColor" TEXT NOT NULL DEFAULT 'bg-slate-100',
    "imageEmoji" TEXT NOT NULL DEFAULT '📦',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessId_barcodeValue_key" ON "Product"("businessId", "barcodeValue");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessId_qrUrl_key" ON "Product"("businessId", "qrUrl");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
