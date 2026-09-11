-- CreateTable
CREATE TABLE "SalesInvoiceShareBundle" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesInvoiceShareBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoiceShareBundleItem" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesInvoiceShareBundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoiceShareBundle_publicToken_key" ON "SalesInvoiceShareBundle"("publicToken");

-- CreateIndex
CREATE INDEX "SalesInvoiceShareBundle_businessId_createdAt_idx" ON "SalesInvoiceShareBundle"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoiceShareBundleItem_bundleId_invoiceId_key" ON "SalesInvoiceShareBundleItem"("bundleId", "invoiceId");

-- CreateIndex
CREATE INDEX "SalesInvoiceShareBundleItem_invoiceId_idx" ON "SalesInvoiceShareBundleItem"("invoiceId");

-- AddForeignKey
ALTER TABLE "SalesInvoiceShareBundle" ADD CONSTRAINT "SalesInvoiceShareBundle_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceShareBundleItem" ADD CONSTRAINT "SalesInvoiceShareBundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "SalesInvoiceShareBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceShareBundleItem" ADD CONSTRAINT "SalesInvoiceShareBundleItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
