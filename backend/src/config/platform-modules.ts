/** Stable slugs for platform sidebar / API RBAC (seeded in DB). */
export const PLATFORM_MODULE_SLUGS = {
  DASHBOARD: "platform.dashboard",
  PAYMENTS: "platform.payments",
  REPORTS: "platform.reports",
  PLAN_CONTROLS: "platform.plan_controls",
  BUSINESSES: "platform.businesses",
  /** Merchant API / wallet credentials for a tenant (Wave, Yonna, APS). */
  BUSINESSES_MERCHANT_API: "platform.businesses.merchant_api",
  /** Plan catalog pricing (monthly / yearly) for subscriptions. */
  BILLING: "platform.billing",
  SUBSCRIPTIONS: "platform.subscriptions",
  INVOICES: "platform.invoices",
  /** Cross-business subscription billing ledger (platform report + CSV export). */
  BILLING_TRANSACTIONS: "platform.billing_transactions",
  /** Paid subscription invoices + ledger: refund review flags (no in-app money movement). */
  BILLING_REVIEW: "platform.billing_review",
  /** DirectPay operator: overview, journals, manual entries (legacy “full finance” uses this view). */
  ACCOUNTING: "platform.accounting",
  /** Post manual GL journals (mirrors merchant `accounting.journals.general`). */
  ACCOUNTING_JOURNALS_POST: "platform.accounting.journals_post",
  /** Reverse manual platform journals (mirrors merchant `accounting.journals.reversal`). */
  ACCOUNTING_JOURNALS_REVERSAL: "platform.accounting.journals_reversal",
  /** Chart of accounts (view / create / edit / delete on template). */
  ACCOUNTING_CHART: "platform.accounting.chart",
  ACCOUNTING_REPORTS_GL: "platform.accounting.reports_gl",
  ACCOUNTING_REPORTS_PNL: "platform.accounting.reports_pnl",
  ACCOUNTING_REPORTS_STATEMENT: "platform.accounting.reports_statement",
  /** Merchant GL postings: list / approve before they appear on statements (exempt: customer sale QR/POS). */
  ACCOUNTING_TRANSACTION_JOURNAL: "platform.accounting.transaction_journal",
  SYSTEM_CONFIGURATION: "platform.system_configuration",
  SECURITY_ROLES: "platform.security_roles",
  SECURITY_FUNCTION_GROUPS: "platform.security_function_groups",
  SECURITY_SYSTEM_USERS: "platform.security_system_users",
  /** Bulk reassignment of platform admins between function groups. */
  SECURITY_MOVE_USERS: "platform.security_move_users",
  /** Internal partner outbound webhook URLs and signing secrets. */
  SECURITY_PARTNERSHIP_CONFIG: "platform.security_partnership_config",
  /** Enable payment gateways (e.g. Wave) for business checkout flows. */
  PAYMENT_GATEWAYS: "platform.payment_gateways",
  /** Platform supplier bills (accounts payable). */
  PURCHASE_BILLS: "platform.purchase_bills",
  /** Operator audit trail (tenant-independent events). */
  ACTIVITY_LOG: "platform.activity_log",
  /** Wave business wallet: balance, transactions, payouts. */
  WAVE_OPERATIONS: "platform.wave_operations",
} as const;

export type PlatformModuleSlug = (typeof PLATFORM_MODULE_SLUGS)[keyof typeof PLATFORM_MODULE_SLUGS];

export const PLATFORM_MODULES_SEED: { slug: string; label: string; sortOrder: number }[] = [
  { slug: PLATFORM_MODULE_SLUGS.DASHBOARD, label: "Dashboard", sortOrder: 10 },
  { slug: PLATFORM_MODULE_SLUGS.PAYMENTS, label: "Payments", sortOrder: 20 },
  { slug: PLATFORM_MODULE_SLUGS.REPORTS, label: "Reports", sortOrder: 30 },
  { slug: PLATFORM_MODULE_SLUGS.PLAN_CONTROLS, label: "Plan controls", sortOrder: 40 },
  { slug: PLATFORM_MODULE_SLUGS.BUSINESSES, label: "Businesses", sortOrder: 50 },
  {
    slug: PLATFORM_MODULE_SLUGS.BUSINESSES_MERCHANT_API,
    label: "Businesses — Merchant API",
    sortOrder: 51,
  },
  { slug: PLATFORM_MODULE_SLUGS.BILLING, label: "Plan billing & pricing", sortOrder: 55 },
  { slug: PLATFORM_MODULE_SLUGS.SUBSCRIPTIONS, label: "Subscriptions", sortOrder: 60 },
  { slug: PLATFORM_MODULE_SLUGS.INVOICES, label: "Invoices", sortOrder: 70 },
  {
    slug: PLATFORM_MODULE_SLUGS.BILLING_TRANSACTIONS,
    label: "Billing transactions",
    sortOrder: 71,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.BILLING_REVIEW,
    label: "Billing review & refunds",
    sortOrder: 72,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.ACCOUNTING,
    label: "Finance — Overview & journals",
    sortOrder: 73,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.ACCOUNTING_JOURNALS_POST,
    label: "Finance — Post manual journals (GL)",
    sortOrder: 77,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.ACCOUNTING_JOURNALS_REVERSAL,
    label: "Finance — Journal reversal",
    sortOrder: 78,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.ACCOUNTING_CHART,
    label: "Finance — Chart of accounts",
    sortOrder: 74,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.ACCOUNTING_REPORTS_GL,
    label: "Finance — GL balance report",
    sortOrder: 75,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.ACCOUNTING_REPORTS_PNL,
    label: "Finance — Profit & loss report",
    sortOrder: 76,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.ACCOUNTING_REPORTS_STATEMENT,
    label: "Finance — Account statement",
    sortOrder: 77,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.ACCOUNTING_TRANSACTION_JOURNAL,
    label: "Finance — Transaction journal (merchant approval)",
    sortOrder: 78,
  },
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
    slug: PLATFORM_MODULE_SLUGS.SECURITY_PARTNERSHIP_CONFIG,
    label: "Security — Partnership config",
    sortOrder: 116,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.PAYMENT_GATEWAYS,
    label: "Payment gateways",
    sortOrder: 58,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.PURCHASE_BILLS,
    label: "Finance — Supplier bills",
    sortOrder: 79,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.ACTIVITY_LOG,
    label: "Platform activity log",
    sortOrder: 81,
  },
  {
    slug: PLATFORM_MODULE_SLUGS.WAVE_OPERATIONS,
    label: "Wave operations",
    sortOrder: 57,
  },
];
