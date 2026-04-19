import type { PlanCode } from "@prisma/client";

import {
  PLAN_ENTITLEMENT_SLUGS,
  SYSTEM_CATALOG_PRODUCTS,
  SYSTEM_CATALOG_SERVICES,
} from "../config/plan-entitlement-matrix.js";
import { prisma } from "../lib/prisma.js";

/**
 * Ensure each catalog slug is owned by exactly one row (the canonical id). Resolves P2002 when
 * e.g. a duplicate row or an old migration left the same slug on two products.
 */
async function resolveCatalogSlugConflicts() {
  const seen = new Map<string, string>();
  for (const p of SYSTEM_CATALOG_PRODUCTS) {
    seen.set(p.slug, p.id);
  }

  for (const [slug, canonicalId] of seen) {
    const rows = await prisma.systemProduct.findMany({
      where: { slug },
      select: { id: true },
    });
    for (const row of rows) {
      if (row.id === canonicalId) {
        continue;
      }
      const suffix = row.id.replace(/[^a-z0-9]/gi, "").slice(0, 12) || "row";
      await prisma.systemProduct.update({
        where: { id: row.id },
        data: { slug: `${slug}.displaced.${suffix}` },
      });
    }
  }
}

/**
 * Upsert services/products from the code matrix and refresh each plan's `PlanSystemProduct` rows.
 * Idempotent; safe to run on every server start so new catalog entries (e.g. balance sheet) appear in
 * plan-catalog and entitlements without a manual `prisma db seed`.
 */
export async function syncSystemCatalogAndPlanEntitlements(): Promise<void> {
  await resolveCatalogSlugConflicts();

  for (const s of SYSTEM_CATALOG_SERVICES) {
    await prisma.systemService.upsert({
      where: { id: s.id },
      create: s,
      update: {
        name: s.name,
        description: s.description,
        sortOrder: s.sortOrder,
      },
    });
  }

  for (const p of SYSTEM_CATALOG_PRODUCTS) {
    await prisma.systemProduct.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        serviceId: p.serviceId,
        slug: p.slug,
        name: p.name,
        description: p.description,
        sortOrder: p.sortOrder,
        navPath: p.navPath ?? null,
        navLabel: p.navLabel ?? null,
      },
      update: {
        serviceId: p.serviceId,
        slug: p.slug,
        name: p.name,
        description: p.description,
        sortOrder: p.sortOrder,
        navPath: p.navPath ?? null,
        navLabel: p.navLabel ?? null,
      },
    });
  }

  await prisma.systemProduct.deleteMany({ where: { id: "sp_billing_txn" } });

  const plans = await prisma.plan.findMany();
  for (const plan of plans) {
    const slugs = PLAN_ENTITLEMENT_SLUGS[plan.code as PlanCode];
    if (!slugs?.length) {
      continue;
    }
    const products = await prisma.systemProduct.findMany({
      where: { slug: { in: slugs } },
    });
    await prisma.planSystemProduct.deleteMany({ where: { planId: plan.id } });
    for (const sp of products) {
      await prisma.planSystemProduct.create({
        data: { planId: plan.id, systemProductId: sp.id },
      });
    }
  }
}
