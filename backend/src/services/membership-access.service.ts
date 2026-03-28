import type { Request } from "express";
import { BusinessMembershipStatus } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";

const BLOCKED_MESSAGES: Record<BusinessMembershipStatus, string | null> = {
  [BusinessMembershipStatus.ACTIVE]: null,
  [BusinessMembershipStatus.BLOCKED]: "Your access to this business has been blocked.",
  [BusinessMembershipStatus.SUSPENDED]: "Your access to this business has been suspended.",
  [BusinessMembershipStatus.TERMINATED]: "You no longer have access to this business.",
};

/** GET routes that still run so the client can load shell / switcher while showing a restricted state. */
function isWhitelistedReadForRestrictedMembership(req: Pick<Request, "method" | "path">): boolean {
  if (req.method !== "GET") {
    return false;
  }
  const p = req.path || "";
  return (
    /^\/api\/businesses\/[^/]+\/subscription$/i.test(p) ||
    /^\/api\/businesses\/[^/]+\/entitlements$/i.test(p) ||
    /^\/api\/businesses\/[^/]+\/navigation-menu$/i.test(p)
  );
}

/**
 * Throws 403 when the user may not use this business context for API calls (non-owner blocked/suspended/terminated).
 * Some GET endpoints are allowed so the UI can load org context and show messaging.
 */
export async function assertBusinessMembershipAllowsApiAccess(
  userId: string,
  businessId: string,
  isPlatformOwner: boolean,
  req?: Pick<Request, "method" | "path">,
): Promise<void> {
  if (isPlatformOwner) {
    return;
  }

  const membership = await prisma.businessMembership.findFirst({
    where: { userId, businessId },
  });

  if (!membership) {
    throw new HttpError(403, "Access denied to this business.");
  }

  if (membership.isOwner) {
    return;
  }

  const msg = BLOCKED_MESSAGES[membership.status];
  if (!msg) {
    return;
  }

  if (req && isWhitelistedReadForRestrictedMembership(req)) {
    return;
  }

  throw new HttpError(403, msg);
}
