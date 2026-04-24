import { Request, Response, NextFunction } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http-error.js';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest, requireEntitlement } from '../middleware/auth.js';
import { assertBusinessMembershipAllowsApiAccess } from '../services/membership-access.service.js';
import { getMergedPlatformPermissionsForUser } from '../services/platform-security.service.js';
import { env } from '../config/env.js';
import type { PlatformAccessFlags } from './auth.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        businessId?: string;
        isPlatformOwner?: boolean;
        platformPermissions?: Record<string, PlatformAccessFlags>;
      };
    }
  }
}

export type PlatformAccessAction = keyof PlatformAccessFlags;

// Generate JWT token
export function generateToken(user: { id: string; email: string; name: string; role: string }) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as SignOptions,
  );
}

// Middleware to authenticate JWT tokens
export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw new HttpError(401, 'Access token required');
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as any;

    // Platform admin routes use :businessId for the *resource* (e.g. tenant being viewed), not the
    // caller's selected merchant context. Treating it as context runs membership checks against
    // arbitrary businesses and returns 403 for PLATFORM_ADMIN users who are not members.
    const path = req.path || "";
    const isPlatformApiPath = /^\/api\/platform(\/|$)/i.test(path);
    /** PLATFORM_ADMIN is not usually a member of arbitrary tenants; URL :businessId must not imply session context. */
    const isPlatformAdminJwt = decoded.role === UserRole.PLATFORM_ADMIN;
    const paramBusinessId = (req.params as { businessId?: string }).businessId;
    const businessContextId =
      (req.headers["x-business-id"] as string | undefined) ||
      (!isPlatformApiPath && !isPlatformAdminJwt ? paramBusinessId : undefined);

    // Get user with current business context
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        memberships: businessContextId
          ? {
              where: { businessId: businessContextId },
              take: 1,
            }
          : {
              take: 1,
              orderBy: [{ isOwner: "desc" }, { createdAt: "desc" }],
            },
      },
    });

    if (!user) {
      throw new HttpError(401, 'User not found');
    }

    const platformPermissions =
      user.role === UserRole.PLATFORM_ADMIN
        ? await getMergedPlatformPermissionsForUser(user.id)
        : undefined;

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      businessId: businessContextId,
      isPlatformOwner: user.role === UserRole.PLATFORM_OWNER,
      ...(platformPermissions !== undefined ? { platformPermissions } : {}),
    };

    if (businessContextId) {
      await assertBusinessMembershipAllowsApiAccess(
        user.id,
        businessContextId,
        user.role === UserRole.PLATFORM_OWNER,
        req,
      );
    }

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new HttpError(401, 'Invalid token'));
    } else {
      next(error);
    }
  }
}

/** If `Authorization: Bearer` is present, validate it and set `req.user`; otherwise continue without a user. */
export async function optionalAuthenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      next();
      return;
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as { id: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!user) {
      throw new HttpError(401, 'User not found');
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      businessId: undefined,
      isPlatformOwner: user.role === UserRole.PLATFORM_OWNER,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new HttpError(401, 'Invalid token'));
    } else {
      next(error);
    }
  }
}

// Middleware for DPay / platform owner only
export function requirePlatformOwner(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user?.isPlatformOwner) {
    throw new HttpError(403, 'DPay access required');
  }
  next();
}

/** PLATFORM_OWNER or PLATFORM_ADMIN (JWT must be authenticated first). */
export function requirePlatformOperator(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    throw new HttpError(401, 'Authentication required');
  }
  if (req.user.role !== UserRole.PLATFORM_OWNER && req.user.role !== UserRole.PLATFORM_ADMIN) {
    throw new HttpError(403, 'Platform operator access required');
  }
  next();
}

/**
 * PLATFORM_OWNER: always allowed. PLATFORM_ADMIN: must have the flag on the module.
 * Use after authenticateToken + requirePlatformOperator.
 */
export function requirePlatformAccess(moduleSlug: string, action: PlatformAccessAction) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new HttpError(401, 'Authentication required');
    }
    if (req.user.role === UserRole.PLATFORM_OWNER) {
      next();
      return;
    }
    if (req.user.role !== UserRole.PLATFORM_ADMIN) {
      throw new HttpError(403, 'Platform access required');
    }
    const row = req.user.platformPermissions?.[moduleSlug];
    if (!row?.[action]) {
      throw new HttpError(403, 'You do not have permission for this action.');
    }
    next();
  };
}

export type PlatformAccessGate = { moduleSlug: string; action: PlatformAccessAction };

/** PLATFORM_ADMIN passes if any gate matches (owner always passes). */
export function requirePlatformAccessAny(gates: PlatformAccessGate[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new HttpError(401, 'Authentication required');
    }
    if (req.user.role === UserRole.PLATFORM_OWNER) {
      next();
      return;
    }
    if (req.user.role !== UserRole.PLATFORM_ADMIN) {
      throw new HttpError(403, 'Platform access required');
    }
    const ok = gates.some((g) => Boolean(req.user!.platformPermissions?.[g.moduleSlug]?.[g.action]));
    if (!ok) {
      throw new HttpError(403, 'You do not have permission for this action.');
    }
    next();
  };
}

export { requireEntitlement };