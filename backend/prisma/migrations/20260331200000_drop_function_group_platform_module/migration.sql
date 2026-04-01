-- Function groups: role template only (no per-module column).

ALTER TABLE "PlatformFunctionGroup" DROP CONSTRAINT IF EXISTS "PlatformFunctionGroup_platformModuleId_fkey";

DROP INDEX IF EXISTS "PlatformFunctionGroup_platformModuleId_idx";

ALTER TABLE "PlatformFunctionGroup" DROP COLUMN IF EXISTS "platformModuleId";
