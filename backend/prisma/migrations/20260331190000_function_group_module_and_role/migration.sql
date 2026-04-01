-- Function groups: one platform module + one role template (replace M2M).

ALTER TABLE "PlatformFunctionGroup" ADD COLUMN "platformModuleId" TEXT,
ADD COLUMN "roleTemplateId" TEXT;

UPDATE "PlatformFunctionGroup" AS g
SET
  "roleTemplateId" = x."tid",
  "platformModuleId" = x."mid"
FROM (
  SELECT DISTINCT ON (j."A")
    j."A" AS gid,
    j."B" AS tid,
    COALESCE(
      (
        SELECT p."moduleId"
        FROM "PlatformRoleTemplatePermission" p
        WHERE p."templateId" = j."B"
        ORDER BY p."moduleId"
        LIMIT 1
      ),
      (SELECT id FROM "PlatformModule" ORDER BY "sortOrder" ASC, id ASC LIMIT 1)
    ) AS mid
  FROM "_PlatformFunctionGroupToPlatformRoleTemplate" j
  ORDER BY j."A", j."B"
) AS x
WHERE g.id = x.gid;

UPDATE "PlatformFunctionGroup" AS g
SET
  "roleTemplateId" = COALESCE(
    "roleTemplateId",
    (SELECT id FROM "PlatformRoleTemplate" ORDER BY id ASC LIMIT 1)
  ),
  "platformModuleId" = COALESCE(
    "platformModuleId",
    (SELECT id FROM "PlatformModule" ORDER BY "sortOrder" ASC, id ASC LIMIT 1)
  )
WHERE "roleTemplateId" IS NULL OR "platformModuleId" IS NULL;

ALTER TABLE "PlatformFunctionGroup" ALTER COLUMN "platformModuleId" SET NOT NULL;
ALTER TABLE "PlatformFunctionGroup" ALTER COLUMN "roleTemplateId" SET NOT NULL;

DROP TABLE "_PlatformFunctionGroupToPlatformRoleTemplate";

ALTER TABLE "PlatformFunctionGroup" ADD CONSTRAINT "PlatformFunctionGroup_platformModuleId_fkey" FOREIGN KEY ("platformModuleId") REFERENCES "PlatformModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformFunctionGroup" ADD CONSTRAINT "PlatformFunctionGroup_roleTemplateId_fkey" FOREIGN KEY ("roleTemplateId") REFERENCES "PlatformRoleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "PlatformFunctionGroup_platformModuleId_idx" ON "PlatformFunctionGroup"("platformModuleId");

CREATE INDEX "PlatformFunctionGroup_roleTemplateId_idx" ON "PlatformFunctionGroup"("roleTemplateId");
