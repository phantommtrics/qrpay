import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";

/**
 * Ensures the business was provisioned through the internal partner flow (waived billing + external user id).
 */
export async function assertInternalPartnerProvisionedBusiness(businessId: string): Promise<void> {
  const row = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      platformBillingWaived: true,
      partnerProvisioningExternalUserId: true,
    },
  });
  if (!row?.platformBillingWaived || !row.partnerProvisioningExternalUserId?.trim()) {
    throw new HttpError(403, "This business is not enabled for the internal partner API.");
  }
}

/** Partner-provisioned business (includes analytics-bi with platform billing). */
export async function assertInternalPartnerBusiness(businessId: string): Promise<void> {
  const row = await prisma.business.findUnique({
    where: { id: businessId },
    select: { partnerProvisioningExternalUserId: true },
  });
  if (!row?.partnerProvisioningExternalUserId?.trim()) {
    throw new HttpError(403, "This business is not enabled for the internal partner API.");
  }
}
