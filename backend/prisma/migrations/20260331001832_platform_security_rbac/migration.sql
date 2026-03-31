-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PLATFORM_ADMIN';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "platformFunctionGroupId" TEXT;

-- CreateTable
CREATE TABLE "PlatformModule" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRoleTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformRoleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRoleTemplatePermission" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canExport" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlatformRoleTemplatePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFunctionGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformFunctionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PlatformFunctionGroupToPlatformRoleTemplate" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PlatformFunctionGroupToPlatformRoleTemplate_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformModule_slug_key" ON "PlatformModule"("slug");

-- CreateIndex
CREATE INDEX "PlatformRoleTemplatePermission_moduleId_idx" ON "PlatformRoleTemplatePermission"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformRoleTemplatePermission_templateId_moduleId_key" ON "PlatformRoleTemplatePermission"("templateId", "moduleId");

-- CreateIndex
CREATE INDEX "_PlatformFunctionGroupToPlatformRoleTemplate_B_index" ON "_PlatformFunctionGroupToPlatformRoleTemplate"("B");

-- CreateIndex
CREATE INDEX "User_platformFunctionGroupId_idx" ON "User"("platformFunctionGroupId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_platformFunctionGroupId_fkey" FOREIGN KEY ("platformFunctionGroupId") REFERENCES "PlatformFunctionGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRoleTemplatePermission" ADD CONSTRAINT "PlatformRoleTemplatePermission_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PlatformRoleTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRoleTemplatePermission" ADD CONSTRAINT "PlatformRoleTemplatePermission_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "PlatformModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlatformFunctionGroupToPlatformRoleTemplate" ADD CONSTRAINT "_PlatformFunctionGroupToPlatformRoleTemplate_A_fkey" FOREIGN KEY ("A") REFERENCES "PlatformFunctionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlatformFunctionGroupToPlatformRoleTemplate" ADD CONSTRAINT "_PlatformFunctionGroupToPlatformRoleTemplate_B_fkey" FOREIGN KEY ("B") REFERENCES "PlatformRoleTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
