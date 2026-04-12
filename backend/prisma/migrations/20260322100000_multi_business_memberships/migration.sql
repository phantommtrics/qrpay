-- DropIndex
DROP INDEX "Business_ownerEmail_key";

-- CreateTable
CREATE TABLE "BusinessMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessMembership_pkey" PRIMARY KEY ("id")
);

-- Migrate existing single-business links into memberships
INSERT INTO "BusinessMembership" (
    "id",
    "userId",
    "businessId",
    "isOwner",
    "createdAt",
    "updatedAt"
)
SELECT
    'migrated-' || "User"."id" || '-' || "User"."businessId",
    "User"."id",
    "User"."businessId",
    CASE WHEN "Business"."ownerEmail" = "User"."email" THEN true ELSE false END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User"
INNER JOIN "Business" ON "Business"."id" = "User"."businessId"
WHERE "User"."businessId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BusinessMembership_userId_businessId_key" ON "BusinessMembership"("userId", "businessId");

-- CreateIndex
CREATE INDEX "BusinessMembership_businessId_idx" ON "BusinessMembership"("businessId");

-- CreateIndex
CREATE INDEX "BusinessMembership_userId_idx" ON "BusinessMembership"("userId");

-- AddForeignKey
ALTER TABLE "BusinessMembership" ADD CONSTRAINT "BusinessMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessMembership" ADD CONSTRAINT "BusinessMembership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_businessId_fkey";

-- DropIndex
DROP INDEX "User_businessId_role_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "businessId";
