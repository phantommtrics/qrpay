import { BusinessOperationalStatus } from "@prisma/client";
import type { Request } from "express";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";

const BLOCKED_MESSAGE =
  "This business has been blocked by DirectPay and cannot use the platform until it is reactivated.";
const TERMINATED_MESSAGE =
  "This business has been deleted and is no longer available.";

/** GET routes allowed while BLOCKED so the client can load shell / billing messaging. */
function isWhitelistedReadForBlockedBusiness(req: Pick<Request, "method" | "path">): boolean {
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
 * Enforce platform lifecycle (block / soft-terminate) for merchant API business context.
 * Platform operators are not restricted here.
 */
export async function assertBusinessOperationalAllowsApiAccess(
  businessId: string,
  isPlatformOperator: boolean,
  req?: Pick<Request, "method" | "path">,
): Promise<void> {
  if (isPlatformOperator) {
    return;
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { operationalStatus: true, name: true },
  });

  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

  if (business.operationalStatus === BusinessOperationalStatus.ACTIVE) {
    return;
  }

  if (business.operationalStatus === BusinessOperationalStatus.TERMINATED) {
    throw new HttpError(403, TERMINATED_MESSAGE);
  }

  // BLOCKED
  if (req && isWhitelistedReadForBlockedBusiness(req)) {
    return;
  }

  throw new HttpError(403, BLOCKED_MESSAGE);
}

export function businessOperationalBlockMessage(
  status: BusinessOperationalStatus,
): string | null {
  if (status === BusinessOperationalStatus.BLOCKED) {
    return BLOCKED_MESSAGE;
  }
  if (status === BusinessOperationalStatus.TERMINATED) {
    return TERMINATED_MESSAGE;
  }
  return null;
}
