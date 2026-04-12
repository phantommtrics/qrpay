-- Remove RBAC tables (replaced by plan-linked system products and User.role).

ALTER TABLE "RolePermission" DROP CONSTRAINT IF EXISTS "RolePermission_roleId_fkey";
ALTER TABLE "RolePermission" DROP CONSTRAINT IF EXISTS "RolePermission_permissionId_fkey";
ALTER TABLE "UserRoleAssignment" DROP CONSTRAINT IF EXISTS "UserRoleAssignment_userId_fkey";
ALTER TABLE "UserRoleAssignment" DROP CONSTRAINT IF EXISTS "UserRoleAssignment_roleId_fkey";

DROP TABLE IF EXISTS "RolePermission";
DROP TABLE IF EXISTS "UserRoleAssignment";
DROP TABLE IF EXISTS "Permission";
DROP TABLE IF EXISTS "Role";
