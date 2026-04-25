import "dotenv/config";
import { PlanCode, PrismaClient } from "@prisma/client";

import {
  SYSTEM_CATALOG_PRODUCTS,
  SYSTEM_CATALOG_SERVICES,
} from "../src/config/plan-entitlement-matrix.js";

const prisma = new PrismaClient();

const PRODUCT_BARCODE_SLUG = "products.barcode";
const TARGET_PLAN_CODES = [PlanCode.BASIC, PlanCode.PRO, PlanCode.BUSINESS_PRO] as const;

async function main() {
  const catalogService = SYSTEM_CATALOG_SERVICES.find((service) => service.id === "svc_catalog");
  const productBarcode = SYSTEM_CATALOG_PRODUCTS.find(
    (product) => product.slug === PRODUCT_BARCODE_SLUG,
  );

  if (!catalogService || !productBarcode) {
    throw new Error("Product Barcode catalog config is missing.");
  }

  await prisma.systemService.upsert({
    where: { id: catalogService.id },
    create: catalogService,
    update: {
      name: catalogService.name,
      description: catalogService.description,
      sortOrder: catalogService.sortOrder,
    },
  });

  const systemProduct = await prisma.systemProduct.upsert({
    where: { slug: productBarcode.slug },
    create: {
      id: productBarcode.id,
      serviceId: productBarcode.serviceId,
      slug: productBarcode.slug,
      name: productBarcode.name,
      description: productBarcode.description,
      sortOrder: productBarcode.sortOrder,
      navPath: productBarcode.navPath ?? null,
      navLabel: productBarcode.navLabel ?? null,
    },
    update: {
      serviceId: productBarcode.serviceId,
      slug: productBarcode.slug,
      name: productBarcode.name,
      description: productBarcode.description,
      sortOrder: productBarcode.sortOrder,
      navPath: productBarcode.navPath ?? null,
      navLabel: productBarcode.navLabel ?? null,
    },
  });

  const plans = await prisma.plan.findMany({
    where: { code: { in: [...TARGET_PLAN_CODES] } },
    select: { id: true, code: true, name: true },
  });

  for (const plan of plans) {
    await prisma.planSystemProduct.upsert({
      where: {
        planId_systemProductId: {
          planId: plan.id,
          systemProductId: systemProduct.id,
        },
      },
      create: {
        planId: plan.id,
        systemProductId: systemProduct.id,
      },
      update: {},
    });
    console.log(`Product Barcode entitlement ensured for ${plan.code} (${plan.name}).`);
  }

  const missingPlanCodes = TARGET_PLAN_CODES.filter(
    (code) => !plans.some((plan) => plan.code === code),
  );
  if (missingPlanCodes.length > 0) {
    console.warn(`Plans not found: ${missingPlanCodes.join(", ")}`);
  }

  console.log("Done. Product Barcode system product and plan links ensured.");
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
