import { BusinessMembershipStatus } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";

const ALLOWED: BusinessMembershipStatus[] = [
  BusinessMembershipStatus.ACTIVE,
  BusinessMembershipStatus.BLOCKED,
  BusinessMembershipStatus.SUSPENDED,
  BusinessMembershipStatus.TERMINATED,
];

export async function setBusinessMemberStatus(
  businessId: string,
  targetUserId: string,
  status: BusinessMembershipStatus,
): Promise<void> {
  if (!ALLOWED.includes(status)) {
    throw new HttpError(400, "Invalid membership status.");
  }

  const membership = await prisma.businessMembership.findFirst({
    where: { userId: targetUserId, businessId },
  });

  if (!membership) {
    throw new HttpError(404, "User is not a member of this business.");
  }

  if (membership.isOwner) {
    throw new HttpError(400, "The business owner’s membership status cannot be changed here.");
  }

  await prisma.businessMembership.update({
    where: { id: membership.id },
    data: { status },
  });
}
