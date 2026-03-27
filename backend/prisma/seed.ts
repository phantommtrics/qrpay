import { PrismaClient, PlanCode, UserRole } from "@prisma/client";
import { hashPassword } from "../src/utils/password.js";

const prisma = new PrismaClient();

/**
 * Roles, permissions, and role–permission links are reference data for RBAC.
 * They live in the same PostgreSQL tables defined in schema.prisma (Role, Permission, RolePermission).
 * Runtime users (owners, staff) are created via the API and stored in User / BusinessMembership — not here.
 */
async function seedRbac() {
  const roles: Array<{
    id: string;
    name: string;
    description: string;
    isSystem: boolean;
  }> = [
    {
      id: "role_platform_owner",
      name: "Platform Owner",
      description: "Full platform administration access",
      isSystem: true,
    },
    {
      id: "role_business_admin",
      name: "Business Admin",
      description: "Business administration and management",
      isSystem: true,
    },
    {
      id: "role_business_staff",
      name: "Business Staff",
      description: "Regular business staff with limited access",
      isSystem: true,
    },
    {
      id: "role_cashier",
      name: "Cashier",
      description: "POS and checkout operations only",
      isSystem: true,
    },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { id: role.id },
      create: role,
      update: {
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
      },
    });
  }

  const permissions: Array<{
    id: string;
    key: string;
    name: string;
    description: string;
    category: string;
  }> = [
    {
      id: "perm_platform_manage",
      key: "platform.manage",
      name: "Platform Management",
      description: "Manage platform settings and configurations",
      category: "Administration",
    },
    {
      id: "perm_platform_users",
      key: "platform.users.manage",
      name: "Platform Users",
      description: "Manage platform-level users",
      category: "Administration",
    },
    {
      id: "perm_platform_businesses",
      key: "platform.businesses.manage",
      name: "Platform Businesses",
      description: "Manage all businesses on platform",
      category: "Administration",
    },
    {
      id: "perm_platform_billing",
      key: "platform.billing.manage",
      name: "Platform Billing",
      description: "Manage platform billing and subscriptions",
      category: "Administration",
    },
    {
      id: "perm_business_manage",
      key: "business.manage",
      name: "Business Management",
      description: "Manage business settings and configurations",
      category: "Administration",
    },
    {
      id: "perm_staff_manage",
      key: "staff.manage",
      name: "Staff Management",
      description: "Manage business staff and roles",
      category: "Administration",
    },
    {
      id: "perm_products_manage",
      key: "products.manage",
      name: "Products Management",
      description: "Full CRUD operations on products",
      category: "Products",
    },
    {
      id: "perm_products_view",
      key: "products.view",
      name: "Products View",
      description: "View products catalog",
      category: "Products",
    },
    {
      id: "perm_products_create",
      key: "products.create",
      name: "Products Create",
      description: "Create new products",
      category: "Products",
    },
    {
      id: "perm_orders_manage",
      key: "orders.manage",
      name: "Orders Management",
      description: "Manage orders and transactions",
      category: "Orders",
    },
    {
      id: "perm_orders_view",
      key: "orders.view",
      name: "Orders View",
      description: "View orders and transactions",
      category: "Orders",
    },
    {
      id: "perm_payments_manage",
      key: "payments.manage",
      name: "Payments Management",
      description: "Manage payment records",
      category: "Payments",
    },
    {
      id: "perm_payments_view",
      key: "payments.view",
      name: "Payments View",
      description: "View payment records",
      category: "Payments",
    },
    {
      id: "perm_reports_view",
      key: "reports.view",
      name: "Reports View",
      description: "Access business reports",
      category: "Reports",
    },
    {
      id: "perm_accounting_view",
      key: "accounting.view",
      name: "Accounting View",
      description: "Access accounting features",
      category: "Accounting",
    },
    {
      id: "perm_pos_access",
      key: "pos.access",
      name: "POS Access",
      description: "Access point of sale system",
      category: "Operations",
    },
    {
      id: "perm_dashboard_view",
      key: "dashboard.view",
      name: "Dashboard View",
      description: "Access business dashboard",
      category: "Views",
    },
  ];

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { id: permission.id },
      create: permission,
      update: {
        key: permission.key,
        name: permission.name,
        description: permission.description,
        category: permission.category,
      },
    });
  }

  const rolePermissions: Array<{
    id: string;
    roleId: string;
    permissionId: string;
  }> = [
    ["rp_po_1", "role_platform_owner", "perm_platform_manage"],
    ["rp_po_2", "role_platform_owner", "perm_platform_users"],
    ["rp_po_3", "role_platform_owner", "perm_platform_businesses"],
    ["rp_po_4", "role_platform_owner", "perm_platform_billing"],
    ["rp_po_5", "role_platform_owner", "perm_business_manage"],
    ["rp_po_6", "role_platform_owner", "perm_staff_manage"],
    ["rp_po_7", "role_platform_owner", "perm_products_manage"],
    ["rp_po_8", "role_platform_owner", "perm_products_view"],
    ["rp_po_17", "role_platform_owner", "perm_products_create"],
    ["rp_po_9", "role_platform_owner", "perm_orders_manage"],
    ["rp_po_10", "role_platform_owner", "perm_orders_view"],
    ["rp_po_11", "role_platform_owner", "perm_payments_manage"],
    ["rp_po_12", "role_platform_owner", "perm_payments_view"],
    ["rp_po_13", "role_platform_owner", "perm_reports_view"],
    ["rp_po_14", "role_platform_owner", "perm_accounting_view"],
    ["rp_po_15", "role_platform_owner", "perm_pos_access"],
    ["rp_po_16", "role_platform_owner", "perm_dashboard_view"],
    ["rp_ba_1", "role_business_admin", "perm_business_manage"],
    ["rp_ba_2", "role_business_admin", "perm_staff_manage"],
    ["rp_ba_3", "role_business_admin", "perm_products_manage"],
    ["rp_ba_4", "role_business_admin", "perm_products_view"],
    ["rp_ba_13", "role_business_admin", "perm_products_create"],
    ["rp_ba_5", "role_business_admin", "perm_orders_manage"],
    ["rp_ba_6", "role_business_admin", "perm_orders_view"],
    ["rp_ba_7", "role_business_admin", "perm_payments_manage"],
    ["rp_ba_8", "role_business_admin", "perm_payments_view"],
    ["rp_ba_9", "role_business_admin", "perm_reports_view"],
    ["rp_ba_10", "role_business_admin", "perm_accounting_view"],
    ["rp_ba_11", "role_business_admin", "perm_pos_access"],
    ["rp_ba_12", "role_business_admin", "perm_dashboard_view"],
    ["rp_bs_1", "role_business_staff", "perm_products_view"],
    ["rp_bs_2", "role_business_staff", "perm_orders_view"],
    ["rp_bs_3", "role_business_staff", "perm_orders_manage"],
    ["rp_bs_4", "role_business_staff", "perm_payments_view"],
    ["rp_bs_5", "role_business_staff", "perm_pos_access"],
    ["rp_bs_6", "role_business_staff", "perm_dashboard_view"],
    ["rp_ca_1", "role_cashier", "perm_pos_access"],
    ["rp_ca_2", "role_cashier", "perm_products_view"],
    ["rp_ca_3", "role_cashier", "perm_orders_manage"],
  ].map(([id, roleId, permissionId]) => ({
    id,
    roleId,
    permissionId,
  }));

  for (const link of rolePermissions) {
    await prisma.rolePermission.upsert({
      where: { id: link.id },
      create: link,
      update: {
        roleId: link.roleId,
        permissionId: link.permissionId,
      },
    });
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

  await seedRbac();

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
