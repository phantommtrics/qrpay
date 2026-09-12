import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";

function isRestaurantIndustryValue(industry: string | null | undefined): boolean {
  return (industry ?? "").trim().toLowerCase() === "restaurant";
}

/** Matches `product.service` retail/pharmacy check (avoid importing product.service — circular via menu-category). */
function isRetailOrWholesaleIndustryValue(industry: string | null | undefined): boolean {
  const n = (industry ?? "").trim().toLowerCase();
  return n === "retail" || n === "wholesale" || n === "pharmacy";
}

function isPetrolStationIndustryValue(industry: string | null | undefined): boolean {
  const n = (industry ?? "").trim().toLowerCase();
  return n === "petrol station" || n === "petrol_station";
}

function isCorporateIndustryValue(industry: string | null | undefined): boolean {
  return (industry ?? "").trim().toLowerCase() === "corporate";
}

/** Restaurant, retail, wholesale, pharmacy, petrol station, and Corporate share `MenuCategory`. */
function isMenuCategoryCatalogIndustry(industry: string | null | undefined): boolean {
  return (
    (industry ?? "").trim().toLowerCase() === "restaurant" ||
    isRetailOrWholesaleIndustryValue(industry) ||
    isPetrolStationIndustryValue(industry) ||
    isCorporateIndustryValue(industry)
  );
}

export async function assertMenuCategoryCatalogBusiness(businessId: string): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { industry: true, partnerProvisioningExternalUserId: true },
  });
  if (!business) {
    throw new HttpError(404, "Business not found.");
  }
  const isPartner = Boolean(business.partnerProvisioningExternalUserId?.trim());
  if (!isMenuCategoryCatalogIndustry(business.industry) && !isPartner) {
    throw new HttpError(
      403,
      "Categories are only available for Restaurant, Retail, Wholesale, Pharmacy, Petrol station, Corporate, or internal partner businesses.",
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
