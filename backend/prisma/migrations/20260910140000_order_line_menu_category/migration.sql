-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN "menuCategoryId" TEXT;

-- CreateIndex
CREATE INDEX "OrderLine_menuCategoryId_idx" ON "OrderLine"("menuCategoryId");

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_menuCategoryId_fkey" FOREIGN KEY ("menuCategoryId") REFERENCES "MenuCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
