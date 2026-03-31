import "dotenv/config";
import { PrismaClient, PlanCode, UserRole } from "@prisma/client";
import { hashPassword } from "../src/utils/password.js";
import {
  PLAN_ENTITLEMENT_SLUGS,
  SYSTEM_CATALOG_PRODUCTS,
  SYSTEM_CATALOG_SERVICES,
} from "../src/config/plan-entitlement-matrix.js";
import { PLATFORM_MODULES_SEED } from "../src/config/platform-modules.js";

const prisma = new PrismaClient();

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

async function seedSystemCatalog() {
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

  const plans = await prisma.plan.findMany();
  for (const plan of plans) {
    const slugs = PLAN_ENTITLEMENT_SLUGS[plan.code];
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

async function main() {
  const plans = [
    {
      code: PlanCode.BASIC,
      name: "Basic",
      monthlyPrice: "499.00",
      description: "Starter plan for small merchants getting started with QRPay.",
      staffLimit: 3,
      outletLimit: 1,
      productLimit: 100,
      featureFlags: [
        "POS checkout",
        "QR payment collection",
        "Basic sales dashboard",
        "Email support",
      ],
    },
    {
      code: PlanCode.PRO,
      name: "Pro",
      monthlyPrice: "1299.00",
      description: "Growth plan for active merchants that need better controls and reporting.",
      staffLimit: 10,
      outletLimit: 3,
      productLimit: 1000,
      featureFlags: [
        "Everything in Basic",
        "Inventory management",
        "Staff roles",
        "Advanced reporting",
        "Priority support",
      ],
    },
    {
      code: PlanCode.BUSINESS_PRO,
      name: "Business Pro",
      monthlyPrice: "2999.00",
      description: "Best for multi-branch businesses with higher throughput and admin needs.",
      staffLimit: 50,
      outletLimit: 15,
      productLimit: 10000,
      featureFlags: [
        "Everything in Pro",
        "Multi-branch management",
        "Subscription invoices",
        "Dedicated onboarding",
        "Custom operational support",
      ],
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan,
    });
  }

  await seedSystemCatalog();

  for (const m of PLATFORM_MODULES_SEED) {
    await prisma.platformModule.upsert({
      where: { slug: m.slug },
      create: {
        slug: m.slug,
        label: m.label,
        sortOrder: m.sortOrder,
      },
      update: { label: m.label, sortOrder: m.sortOrder },
    });
  }

  const platformOwnerEmailRaw = process.env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  const platformOwnerEmail =
    platformOwnerEmailRaw && platformOwnerEmailRaw.length > 0
      ? platformOwnerEmailRaw
      : "owner@phantommetrics.gm";

  const platformOwnerPasswordRaw = process.env.PLATFORM_OWNER_PASSWORD;
  const platformOwnerPassword =
    platformOwnerPasswordRaw !== undefined && platformOwnerPasswordRaw.length > 0
      ? platformOwnerPasswordRaw
      : "Allah@12345";

  const platformOwnerNameRaw = process.env.PLATFORM_OWNER_NAME?.trim();
  const platformOwnerName =
    platformOwnerNameRaw && platformOwnerNameRaw.length > 0
      ? platformOwnerNameRaw
      : "Platform Owner";

  await prisma.user.upsert({
    where: { email: platformOwnerEmail },
    update: {
      name: platformOwnerName,
      passwordHash: hashPassword(platformOwnerPassword),
      role: UserRole.PLATFORM_OWNER,
      isActive: true,
    },
    create: {
      name: platformOwnerName,
      email: platformOwnerEmail,
      passwordHash: hashPassword(platformOwnerPassword),
      role: UserRole.PLATFORM_OWNER,
      isActive: true,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
