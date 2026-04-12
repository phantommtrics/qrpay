-- CreateTable
CREATE TABLE "SystemService" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemProduct" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanSystemProduct" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "systemProductId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanSystemProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemProduct_slug_key" ON "SystemProduct"("slug");

-- CreateIndex
CREATE INDEX "SystemProduct_serviceId_idx" ON "SystemProduct"("serviceId");

-- CreateIndex
CREATE INDEX "PlanSystemProduct_planId_idx" ON "PlanSystemProduct"("planId");

-- CreateIndex
CREATE INDEX "PlanSystemProduct_systemProductId_idx" ON "PlanSystemProduct"("systemProductId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanSystemProduct_planId_systemProductId_key" ON "PlanSystemProduct"("planId", "systemProductId");

-- AddForeignKey
ALTER TABLE "SystemProduct" ADD CONSTRAINT "SystemProduct_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "SystemService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSystemProduct" ADD CONSTRAINT "PlanSystemProduct_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSystemProduct" ADD CONSTRAINT "PlanSystemProduct_systemProductId_fkey" FOREIGN KEY ("systemProductId") REFERENCES "SystemProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
