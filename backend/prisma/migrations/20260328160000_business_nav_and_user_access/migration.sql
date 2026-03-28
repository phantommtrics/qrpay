-- AlterTable
ALTER TABLE "SystemProduct" ADD COLUMN "navPath" TEXT;
ALTER TABLE "SystemProduct" ADD COLUMN "navLabel" TEXT;

-- CreateTable
CREATE TABLE "BusinessUserSystemProduct" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "systemProductId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessUserSystemProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessUserSystemProduct_businessId_userId_systemProductId_key" ON "BusinessUserSystemProduct"("businessId", "userId", "systemProductId");

CREATE INDEX "BusinessUserSystemProduct_businessId_userId_idx" ON "BusinessUserSystemProduct"("businessId", "userId");

ALTER TABLE "BusinessUserSystemProduct" ADD CONSTRAINT "BusinessUserSystemProduct_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessUserSystemProduct" ADD CONSTRAINT "BusinessUserSystemProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessUserSystemProduct" ADD CONSTRAINT "BusinessUserSystemProduct_systemProductId_fkey" FOREIGN KEY ("systemProductId") REFERENCES "SystemProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
