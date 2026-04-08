import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";

function isRestaurantIndustryValue(industry: string | null | undefined): boolean {
  return (industry ?? "").trim().toLowerCase() === "restaurant";
}

/** Restaurant, retail, wholesale, and pharmacy share the same `MenuCategory` / `menuCategoryId` model. */
function isMenuCategoryCatalogIndustry(industry: string | null | undefined): boolean {
  const n = (industry ?? "").trim().toLowerCase();
  return (
    n === "restaurant" || n === "retail" || n === "wholesale" || n === "pharmacy"
  );
}

export async function assertMenuCategoryCatalogBusiness(businessId: string): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { industry: true },
  });
  if (!business) {
    throw new HttpError(404, "Business not found.");
  }
  if (!isMenuCategoryCatalogIndustry(business.industry)) {
    throw new HttpError(
      403,
      "Categories are only available for Restaurant, Retail, Wholesale, or Pharmacy businesses.",
    );
  }
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
