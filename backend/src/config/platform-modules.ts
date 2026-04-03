/** Stable slugs for platform sidebar / API RBAC (seeded in DB). */
export const PLATFORM_MODULE_SLUGS = {
  DASHBOARD: "platform.dashboard",
  PAYMENTS: "platform.payments",
  REPORTS: "platform.reports",
  PLAN_CONTROLS: "platform.plan_controls",
  BUSINESSES: "platform.businesses",
  /** Plan catalog pricing (monthly / yearly) for subscriptions. */
  BILLING: "platform.billing",
  SUBSCRIPTIONS: "platform.subscriptions",
  INVOICES: "platform.invoices",
  SYSTEM_CONFIGURATION: "platform.system_configuration",
  SECURITY_ROLES: "platform.security_roles",
  SECURITY_FUNCTION_GROUPS: "platform.security_function_groups",
  SECURITY_SYSTEM_USERS: "platform.security_system_users",
  /** Bulk reassignment of platform admins between function groups. */
  SECURITY_MOVE_USERS: "platform.security_move_users",
  /** Enable payment gateways (e.g. Wave) for business checkout flows. */
  PAYMENT_GATEWAYS: "platform.payment_gateways",
} as const;

export type PlatformModuleSlug = (typeof PLATFORM_MODULE_SLUGS)[keyof typeof PLATFORM_MODULE_SLUGS];

export const PLATFORM_MODULES_SEED: { slug: string; label: string; sortOrder: number }[] = [
  { slug: PLATFORM_MODULE_SLUGS.DASHBOARD, label: "Dashboard", sortOrder: 10 },
  { slug: PLATFORM_MODULE_SLUGS.PAYMENTS, label: "Payments", sortOrder: 20 },
  { slug: PLATFORM_MODULE_SLUGS.REPORTS, label: "Reports", sortOrder: 30 },
  { slug: PLATFORM_MODULE_SLUGS.PLAN_CONTROLS, label: "Plan controls", sortOrder: 40 },
  { slug: PLATFORM_MODULE_SLUGS.BUSINESSES, label: "Businesses", sortOrder: 50 },
  { slug: PLATFORM_MODULE_SLUGS.BILLING, label: "Plan billing & pricing", sortOrder: 55 },
  { slug: PLATFORM_MODULE_SLUGS.SUBSCRIPTIONS, label: "Subscriptions", sortOrder: 60 },
  { slug: PLATFORM_MODULE_SLUGS.INVOICES, label: "Invoices", sortOrder: 70 },
  { slug: PLATFORM_MODULE_SLUGS.SYSTEM_CONFIGURATION, label: "System configuration", sortOrder: 80 },
  { slug: PLATFORM_MODULE_SLUGS.SECURITY_ROLES, label: "Security — Role templates", sortOrder: 90 },
  {
    slug: PLATFORM_MODULE_SLUGS.SECURITY_FUNCTION_GROUPS,
    label: "Security — Function groups",
    sortOrder: 100,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.SECURITY_SYSTEM_USERS,
    label: "Security — System users",
    sortOrder: 110,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.SECURITY_MOVE_USERS,
    label: "Security — Move users",
    sortOrder: 115,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.PAYMENT_GATEWAYS,
    label: "Payment gateways",
    sortOrder: 58,
  },
];
