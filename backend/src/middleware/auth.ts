import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http-error.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  businessId?: string;
  isPlatformOwner?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

// Middleware to check if user has required permission
export function requirePermission(permission: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new HttpError(401, 'Authentication required');
      }

      const hasPermission = await checkUserPermission(req.user.id, permission, req.user.businessId);
      if (!hasPermission) {
        throw new HttpError(403, 'Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

// Middleware to check if user has any of the required permissions
export function requireAnyPermission(permissions: string[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new HttpError(401, 'Authentication required');
      }

      const hasAnyPermission = await checkUserAnyPermission(req.user.id, permissions, req.user.businessId);
      if (!hasAnyPermission) {
        throw new HttpError(403, 'Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

// Check if user has a specific permission
export async function checkUserPermission(
  userId: string,
  permission: string,
  businessId?: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: true,
    },
  });

  if (!user) return false;

  // Platform owner full access shortcut
  if (user.role === 'PLATFORM_OWNER' || user.role === 'ADMIN') {
    return true;
  }

  // Business owners created before RBAC assignments still have isOwner membership only:
  // grant the same permissions as the seeded "Business Admin" role for that business.
  if (businessId) {
    const ownerMembership = await prisma.businessMembership.findFirst({
      where: { userId, businessId, isOwner: true },
    });

    if (ownerMembership) {
      const businessAdminRole = await prisma.role.findFirst({
        where: { name: 'Business Admin' },
      });

      if (businessAdminRole) {
        const ownerMay = await prisma.rolePermission.findFirst({
          where: {
            roleId: businessAdminRole.id,
            permission: { key: permission },
          },
        });

        if (ownerMay) {
          return true;
        }
      }
    }
  }

  const roleIds = (user.userRoles || [])
    .filter((ur) => ur.scope === 'platform' || ur.scope === businessId)
    .map((ur) => ur.roleId);

  if (roleIds.length === 0) {
    return false;
  }

  const rolePermission = await prisma.rolePermission.findFirst({
    where: {
      roleId: { in: roleIds },
      permission: {
        key: permission,
      },
    },
  });

  return Boolean(rolePermission);
}

// Check if user has any of the specified permissions
export async function checkUserAnyPermission(
  userId: string,
  permissions: string[],
  businessId?: string
): Promise<boolean> {
  for (const permission of permissions) {
    if (await checkUserPermission(userId, permission, businessId)) {
      return true;
    }
  }
  return false;
}

// Get all permissions for a user
export async function getUserPermissions(userId: string, businessId?: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: true },
  });

  if (!user) return [];

  if (user.role === 'PLATFORM_OWNER' || user.role === 'ADMIN') {
    const allPermissions = await prisma.permission.findMany();
    return allPermissions.map((p) => p.key);
  }

  const roleIds = (user.userRoles || [])
    .filter((ur) => ur.scope === 'platform' || ur.scope === businessId)
    .map((ur) => ur.roleId);

  if (roleIds.length === 0) {
    return [];
  }

  const rolePermissions = await prisma.rolePermission.findMany({
    where: {
      roleId: { in: roleIds },
    },
    include: {
      permission: true,
    },
  });

  const permissions = new Set<string>();
  for (const rp of rolePermissions) {
    if (rp.permission?.key) {
      permissions.add(rp.permission.key);
    }
  }

  return Array.from(permissions);
}

// Assign role to user
export async function assignUserRole(
  userId: string,
  roleId: string,
  scope: string = 'platform',
  assignedBy?: string
): Promise<void> {
  await prisma.userRoleAssignment.upsert({
    where: {
      userId_roleId_scope: {
        userId,
        roleId,
        scope
      }
    },
    update: {
      assignedBy,
      assignedAt: new Date()
    },
    create: {
      userId,
      roleId,
      scope,
      assignedBy
    }
  });
}

// Remove role from user
export async function removeUserRole(
  userId: string,
  roleId: string,
  scope: string = 'platform'
): Promise<void> {
  await prisma.userRoleAssignment.deleteMany({
    where: {
      userId,
      roleId,
      scope
    }
  });
}