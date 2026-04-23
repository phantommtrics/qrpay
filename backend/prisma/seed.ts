import "dotenv/config";
import { PrismaClient, PlanCode, UserRole } from "@prisma/client";
import { hashPassword } from "../src/utils/password.js";
import { syncSystemCatalogAndPlanEntitlements } from "../src/services/system-catalog-sync.service.js";
import { ensurePlatformModulesSeeded } from "../src/services/platform-module-sync.service.js";

const prisma = new PrismaClient();

async function main() {
  const plans = [
    {
      code: PlanCode.BASIC,
      name: "Basic",
      monthlyPrice: "499.00",
      yearlyPrice: "4990.00",
      description: "Starter plan for small merchants getting started with DPay.",
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
      yearlyPrice: "12990.00",
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
      yearlyPrice: "29990.00",
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
    {
      code: PlanCode.CORPORATE,
      name: "Corporate",
      monthlyPrice: "2999.00",
      yearlyPrice: "29990.00",
      description:
        "Corporate organizations: Business Pro–class features without POS, products, orders, or catalogue categories; custom billing applies.",
      staffLimit: 50,
      outletLimit: 15,
      productLimit: 0,
      featureFlags: [
        "Custom corporate billing",
        "Finance and organization tooling",
        "No POS / catalogue / orders (by design)",
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

  await syncSystemCatalogAndPlanEntitlements();

  await ensurePlatformModulesSeeded();

  await prisma.paymentGateway.upsert({
    where: { code: "wave_gambia" },
    create: {
      code: "wave_gambia",
      name: "Wave (Gambia)",
      description: "Wave mobile money checkout for subscription invoices",
      isEnabled: false,
      sortOrder: 10,
      checkoutAdapter: "wave_gambia",
    },
    update: {
      name: "Wave (Gambia)",
      description: "Wave mobile money checkout for subscription invoices",
      checkoutAdapter: "wave_gambia",
    },
  });

  await prisma.paymentGateway.upsert({
    where: { code: "yonna_wallet" },
    create: {
      code: "yonna_wallet",
      name: "Yonna Wallet",
      description: "Yonna Forex wallet checkout for subscription invoices",
      isEnabled: false,
      sortOrder: 11,
      checkoutAdapter: "yonna_wallet",
    },
    update: {
      name: "Yonna Wallet",
      description: "Yonna Forex wallet checkout for subscription invoices",
      checkoutAdapter: "yonna_wallet",
    },
  });

  await prisma.paymentGateway.upsert({
    where: { code: "aps_wallet" },
    create: {
      code: "aps_wallet",
      name: "APS Wallet",
      description: "APS Money wallet (OTP) checkout for subscription invoices",
      isEnabled: false,
      sortOrder: 12,
      checkoutAdapter: "aps_wallet",
    },
    update: {
      name: "APS Wallet",
      description: "APS Money wallet (OTP) checkout for subscription invoices",
      checkoutAdapter: "aps_wallet",
    },
  });

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
