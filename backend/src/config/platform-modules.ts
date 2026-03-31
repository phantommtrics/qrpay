/** Stable slugs for platform sidebar / API RBAC (seeded in DB). */
export const PLATFORM_MODULE_SLUGS = {
  DASHBOARD: "platform.dashboard",
  PAYMENTS: "platform.payments",
  REPORTS: "platform.reports",
  PLAN_CONTROLS: "platform.plan_controls",
  BUSINESSES: "platform.businesses",
  SUBSCRIPTIONS: "platform.subscriptions",
  INVOICES: "platform.invoices",
  SYSTEM_CONFIGURATION: "platform.system_configuration",
  SECURITY_ROLES: "platform.security_roles",
  SECURITY_FUNCTION_GROUPS: "platform.security_function_groups",
  SECURITY_SYSTEM_USERS: "platform.security_system_users",
} as const;

export type PlatformModuleSlug = (typeof PLATFORM_MODULE_SLUGS)[keyof typeof PLATFORM_MODULE_SLUGS];

export const PLATFORM_MODULES_SEED: { slug: string; label: string; sortOrder: number }[] = [
  { slug: PLATFORM_MODULE_SLUGS.DASHBOARD, label: "Dashboard", sortOrder: 10 },
  { slug: PLATFORM_MODULE_SLUGS.PAYMENTS, label: "Payments", sortOrder: 20 },
  { slug: PLATFORM_MODULE_SLUGS.REPORTS, label: "Reports", sortOrder: 30 },
  { slug: PLATFORM_MODULE_SLUGS.PLAN_CONTROLS, label: "Plan controls", sortOrder: 40 },
  { slug: PLATFORM_MODULE_SLUGS.BUSINESSES, label: "Businesses", sortOrder: 50 },
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
];
