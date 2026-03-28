import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http-error.js';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest, requireEntitlement } from '../middleware/auth.js';
import { assertBusinessMembershipAllowsApiAccess } from '../services/membership-access.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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
      };
    }
  }
}

// Generate JWT token
export function generateToken(user: { id: string; email: string; name: string; role: string }) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '24h' }
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

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const businessContextId =
      (req.headers["x-business-id"] as string | undefined) ||
      (req.params as { businessId?: string }).businessId;

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

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      businessId: businessContextId,
      isPlatformOwner: user.role === UserRole.PLATFORM_OWNER,
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

// Middleware for platform owner only
export function requirePlatformOwner(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user?.isPlatformOwner) {
    throw new HttpError(403, 'Platform owner access required');
  }
  next();
}

export { requireEntitlement };