import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { getEntitlementSlugsForBusiness } from "./entitlement.service.js";

export async function getUserSystemProductIdsForBusiness(
  businessId: string,
  targetUserId: string,
): Promise<string[]> {
  const rows = await prisma.businessUserSystemProduct.findMany({
    where: { businessId, userId: targetUserId },
    select: { systemProductId: true },
  });
  return rows.map((r) => r.systemProductId);
}

export async function setUserSystemProductIdsForBusiness(
  businessId: string,
  targetUserId: string,
  systemProductIds: string[],
): Promise<void> {
  const planSlugs = await getEntitlementSlugsForBusiness(businessId);
  if (planSlugs.length === 0) {
    throw new HttpError(400, "Business has no active plan entitlements.");
  }

  const allowedProducts = await prisma.systemProduct.findMany({
    where: { slug: { in: planSlugs } },
    select: { id: true },
  });
  const allowedIds = new Set(allowedProducts.map((p) => p.id));

  const unique = Array.from(new Set(systemProductIds));
  for (const id of unique) {
    if (!allowedIds.has(id)) {
      throw new HttpError(400, "One or more products are not on this business plan.");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.businessUserSystemProduct.deleteMany({
      where: { businessId, userId: targetUserId },
    });
    if (unique.length === 0) {
      return;
    }
    for (const systemProductId of unique) {
      await tx.businessUserSystemProduct.create({
        data: { businessId, userId: targetUserId, systemProductId },
      });
    }
  });
}

/** Clear assignments; non-owners will have no plan feature access until reassigned. */
export async function clearUserSystemProductAssignments(businessId: string, targetUserId: string) {
  await prisma.businessUserSystemProduct.deleteMany({
    where: { businessId, userId: targetUserId },
  });
}

export type PlanCatalogService = {
  id: string;
  name: string;
  sortOrder: number;
  products: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    sortOrder: number;
  }>;
};

/** All system products on the business's current plan, grouped by service (for access assignment UI). */
export async function getPlanCatalogGrouped(businessId: string): Promise<PlanCatalogService[]> {
  const planSlugs = await getEntitlementSlugsForBusiness(businessId);
  if (planSlugs.length === 0) {
    return [];
  }

  const products = await prisma.systemProduct.findMany({
    where: { slug: { in: planSlugs } },
    include: { service: true },
    orderBy: [{ sortOrder: "asc" }],
  });

  const map = new Map<string, PlanCatalogService>();
  for (const p of products) {
    const svc = p.service;
    let g = map.get(svc.id);
    if (!g) {
      g = { id: svc.id, name: svc.name, sortOrder: svc.sortOrder, products: [] };
      map.set(svc.id, g);
    }
    g.products.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      sortOrder: p.sortOrder,
    });
  }

  for (const g of map.values()) {
    g.products.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  return Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}
