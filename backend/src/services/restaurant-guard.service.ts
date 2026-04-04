import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";

function isRestaurantIndustryValue(industry: string | null | undefined): boolean {
  return (industry ?? "").trim().toLowerCase() === "restaurant";
}

export async function assertRestaurantBusiness(businessId: string): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { industry: true },
  });
  if (!business) {
    throw new HttpError(404, "Business not found.");
  }
  if (!isRestaurantIndustryValue(business.industry)) {
    throw new HttpError(403, "This feature is only available for restaurant businesses.");
  }
}
