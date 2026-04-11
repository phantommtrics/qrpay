import { BusinessMembershipStatus, SubscriptionStatus } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { CORPORATE_EXCLUDED_SLUGS } from "../config/plan-entitlement-matrix.js";
import { isCorporateIndustry } from "../utils/corporate-industry.js";

const ACTIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];

export async function getCurrentSubscriptionForBusiness(businessId: string) {
  return prisma.subscription.findFirst({
    where: {
      businessId,
      status: { in: ACTIVE_SUBSCRIPTION_STATUSES },
    },
    orderBy: { createdAt: "desc" },
    include: {
      plan: {
        include: {
          planSystemProducts: {
            include: { systemProduct: true },
          },
        },
      },
    },
  });
}

/** All entitlement slugs included in the business's current plan (ignores per-user assignments). */
export async function getEntitlementSlugsForBusiness(businessId: string): Promise<string[]> {
  const biz = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      industry: true,
      corporateEntitlementSystemProductIds: true,
    },
  });
  if (
    biz &&
    isCorporateIndustry(biz.industry) &&
    biz.corporateEntitlementSystemProductIds.length > 0
  ) {
    const products = await prisma.systemProduct.findMany({
      where: { id: { in: biz.corporateEntitlementSystemProductIds } },
      select: { slug: true },
    });
    const slugs = products.map((p) => p.slug).filter(Boolean);
    return Array.from(new Set(slugs));
  }

  let sub = await getCurrentSubscriptionForBusiness(businessId);
  if (!sub) {
    sub = await prisma.subscription.findFirst({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      include: {
        plan: {
          include: {
            planSystemProducts: {
              include: { systemProduct: true },
            },
          },
        },
      },
    });
  }

  if (!sub) {
    return [];
  }

  const slugs = sub.plan.planSystemProducts
    .map((link) => link.systemProduct?.slug)
    .filter((s): s is string => Boolean(s));

  let merged = Array.from(new Set(slugs));
  if (
    biz &&
    isCorporateIndustry(biz.industry) &&
    biz.corporateEntitlementSystemProductIds.length === 0
  ) {
    merged = merged.filter((slug) => !CORPORATE_EXCLUDED_SLUGS.has(slug));
  }
  return merged;
}

/**
 * Effective entitlements for a user in a business: owners always get the full plan. Non-owners only
 * get slugs for system products explicitly assigned in BusinessUserSystemProduct; with no rows
 * they have no plan feature access until the business owner assigns products.
 */
export async function getEffectiveEntitlementSlugs(
  userId: string,
  businessId: string,
): Promise<string[]> {
  const membership = await prisma.businessMembership.findFirst({
    where: { userId, businessId },
  });

  if (!membership) {
    return [];
  }

  if (
    !membership.isOwner &&
    (membership.status === BusinessMembershipStatus.BLOCKED ||
      membership.status === BusinessMembershipStatus.SUSPENDED ||
      membership.status === BusinessMembershipStatus.TERMINATED)
  ) {
    return [];
  }

  const planSlugs = await getEntitlementSlugsForBusiness(businessId);
  if (membership.isOwner) {
    return planSlugs;
  }

  const assignments = await prisma.businessUserSystemProduct.findMany({
    where: { userId, businessId },
    include: { systemProduct: true },
  });

  if (assignments.length === 0) {
    return [];
  }

  const allowed = new Set(assignments.map((a) => a.systemProduct.slug));
  return planSlugs.filter((s) => allowed.has(s));
}

export async function userHasEntitlement(
  userId: string,
  businessId: string,
  slug: string,
): Promise<boolean> {
  const slugs = await getEffectiveEntitlementSlugs(userId, businessId);
  return slugs.includes(slug);
}

/** @deprecated Use userHasEntitlement for request-scoped checks */
export async function businessHasEntitlement(
  businessId: string,
  slug: string,
): Promise<boolean> {
  const slugs = await getEntitlementSlugsForBusiness(businessId);
  return slugs.includes(slug);
}

export async function getPlanEntitlementSlugsByPlanId(planId: string): Promise<string[]> {
  const links = await prisma.planSystemProduct.findMany({
    where: { planId },
    include: { systemProduct: true },
  });
  return links.map((l) => l.systemProduct.slug);
}

export type NavigationMenuService = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  items: Array<{
    slug: string;
    name: string;
    navPath: string;
    navLabel: string;
    sortOrder: number;
  }>;
};

export async function getBusinessNavigationMenu(
  userId: string,
  businessId: string,
): Promise<NavigationMenuService[]> {
  const effective = new Set(await getEffectiveEntitlementSlugs(userId, businessId));
  if (effective.size === 0) {
    return [];
  }

  const products = await prisma.systemProduct.findMany({
    where: {
      slug: { in: Array.from(effective) },
      navPath: { not: null },
    },
    include: { service: true },
    orderBy: [{ sortOrder: "asc" }],
  });

  const byService = new Map<string, NavigationMenuService>();

  for (const p of products) {
    if (!p.navPath || !p.navLabel) {
      continue;
    }
    const svc = p.service;
    let group = byService.get(svc.id);
    if (!group) {
      group = {
        id: svc.id,
        name: svc.name,
        description: svc.description,
        sortOrder: svc.sortOrder,
        items: [],
      };
      byService.set(svc.id, group);
    }
    group.items.push({
      slug: p.slug,
      name: p.name,
      navPath: p.navPath,
      navLabel: p.navLabel,
      sortOrder: p.sortOrder,
    });
  }

  for (const g of byService.values()) {
    g.items.sort((a, b) => a.sortOrder - b.sortOrder || a.navLabel.localeCompare(b.navLabel));
  }

  const hasOrdersNav = [...byService.values()].some((g) =>
    g.items.some((item) => item.navPath === "/orders"),
  );
  if (!hasOrdersNav && effective.has("pos.access")) {
    const ordersProduct = await prisma.systemProduct.findFirst({
      where: { slug: "orders.view", navPath: { not: null } },
      include: { service: true },
    });
    if (ordersProduct?.navPath && ordersProduct.navLabel && ordersProduct.service) {
      const svc = ordersProduct.service;
      let group = byService.get(svc.id);
      if (!group) {
        group = {
          id: svc.id,
          name: svc.name,
          description: svc.description,
          sortOrder: svc.sortOrder,
          items: [],
        };
        byService.set(svc.id, group);
      }
      if (!group.items.some((item) => item.navPath === "/orders")) {
        group.items.push({
          slug: ordersProduct.slug,
          name: ordersProduct.name,
          navPath: ordersProduct.navPath,
          navLabel: ordersProduct.navLabel,
          sortOrder: ordersProduct.sortOrder,
        });
        group.items.sort((a, b) => a.sortOrder - b.sortOrder || a.navLabel.localeCompare(b.navLabel));
      }
    }
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { industry: true },
  });
  const industryNorm = (business?.industry ?? "").trim().toLowerCase();
  /** Retail catalog uses "Categories"; restaurants use Menu setup instead (same underlying table). */
  if (industryNorm === "restaurant") {
    for (const g of byService.values()) {
      g.items = g.items.filter((item) => item.slug !== "products.categories");
    }
  }

  return Array.from(byService.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}
