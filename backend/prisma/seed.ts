import { PrismaClient, PlanCode, UserRole } from "@prisma/client";
import { hashPassword } from "../src/utils/password.js";

const prisma = new PrismaClient();

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

  await prisma.user.upsert({
    where: { email: "owner@qrpay.com" },
    update: {
      name: "Platform Owner",
      passwordHash: hashPassword("demo123"),
      role: UserRole.ADMIN,
      isActive: true,
    },
    create: {
      name: "Platform Owner",
      email: "owner@qrpay.com",
      passwordHash: hashPassword("demo123"),
      role: UserRole.ADMIN,
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
