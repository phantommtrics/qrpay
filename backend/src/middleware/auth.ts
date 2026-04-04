import { NextFunction, Request, Response } from "express";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { userHasEntitlement } from "../services/entitlement.service.js";

export type PlatformAccessFlags = {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  export: boolean;
};

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  businessId?: string;
  isPlatformOwner?: boolean;
  /** Merged from function group role templates (PLATFORM_ADMIN only). */
  platformPermissions?: Record<string, PlatformAccessFlags>;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export function requireEntitlement(slug: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Authentication required");
      }
      if (req.user.isPlatformOwner) {
        next();
        return;
      }
      const businessId =
        (req.params as { businessId?: string }).businessId || req.user.businessId;
      if (!businessId) {
        throw new HttpError(400, "Business context required");
      }
      const ok = await userHasEntitlement(req.user.id, businessId, slug);
      if (!ok) {
        throw new HttpError(403, "You do not have access to this feature for this business.");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Passes if the user has any of the listed entitlements (platform owners always pass). */
export function requireAnyEntitlement(slugs: string[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Authentication required");
      }
      if (req.user.isPlatformOwner) {
        next();
        return;
      }
      const businessId =
        (req.params as { businessId?: string }).businessId || req.user.businessId;
      if (!businessId) {
        throw new HttpError(400, "Business context required");
      }
      for (const slug of slugs) {
        if (await userHasEntitlement(req.user.id, businessId, slug)) {
          next();
          return;
        }
      }
      throw new HttpError(403, "You do not have access to this feature for this business.");
    } catch (error) {
      next(error);
    }
  };
}

/** Business member with `subscriptions.billings` entitlement, or platform operator. */
export function requireSubscriptionsBillingOrPlatform() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Authentication required");
      }
      if (req.user.isPlatformOwner || req.user.role === "PLATFORM_ADMIN") {
        next();
        return;
      }
      const businessId = (req.params as { businessId?: string }).businessId;
      if (!businessId) {
        throw new HttpError(400, "Business id required");
      }
      const ok = await userHasEntitlement(req.user.id, businessId, "subscriptions.billings");
      if (!ok) {
        throw new HttpError(403, "You do not have access to billing for this business.");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Business member with `subscriptions.invoices` entitlement, or platform operator. */
export function requireSubscriptionsInvoicesOrPlatform() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Authentication required");
      }
      if (req.user.isPlatformOwner || req.user.role === "PLATFORM_ADMIN") {
        next();
        return;
      }
      const businessId = (req.params as { businessId?: string }).businessId;
      if (!businessId) {
        throw new HttpError(400, "Business id required");
      }
      const ok = await userHasEntitlement(req.user.id, businessId, "subscriptions.invoices");
      if (!ok) {
        throw new HttpError(403, "You do not have access to subscription invoices for this business.");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Business owner or platform owner only (staff management and other owner-only actions). */
export function requireBusinessOwnerOrPlatform() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Authentication required");
      }
      if (req.user.isPlatformOwner || req.user.role === "PLATFORM_ADMIN") {
        next();
        return;
      }
      const businessId = (req.params as { businessId?: string }).businessId;
      if (!businessId) {
        throw new HttpError(400, "Business id required");
      }
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user.id, businessId, isOwner: true },
      });
      if (!membership) {
        throw new HttpError(403, "Only the business owner can access this.");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
