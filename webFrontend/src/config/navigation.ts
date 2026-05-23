import type { LucideIcon } from 'lucide-react'
import {
  BookOpenText,
  BarChart3,
  ClipboardList,
  CreditCard,
  History,
  LayoutDashboard,
  Package,
  Settings2,
  ShoppingBag,
  UserCog,
  Users,
  Utensils,
} from 'lucide-react'

import type { PermissionKey, User } from '../types'

export const APP_PATHS = {
  root: '/',
  /** Public marketing / product detail (no auth). */
  aboutEasypay: '/about-easypay',
  login: '/login',
  signup: '/signup',
  forgotPassword: '/forgot-password',
  changePassword: '/account/change-password',
  dashboard: '/dashboard',
  pos: '/pos',
  products: '/products',
  /** Retail / wholesale / pharmacy product category tree (restaurants use Menu setup). */
  catalogCategories: '/catalog/categories',
  orders: '/orders',
  payments: '/payments',
  /** Staff / system audit trail (payment events, etc.) */
  activityLog: '/activity-log',
  reports: '/reports',
  subscriptionsBillingActivity: '/subscriptions/billing-activity',
  salesQuotations: '/sales/quotations',
  salesInvoices: '/sales/invoices',
  salesBills: '/sales/bills',
  /** Dynamic: `/sales/quotations/${quotationId}` */
  salesQuotationDetail: '/sales/quotations/:quotationId',
  /** Dynamic: `/sales/invoices/${invoiceId}` */
  salesInvoiceDetail: '/sales/invoices/:invoiceId',
  /** Dynamic: `/sales/bills/${billId}` */
  salesBillDetail: '/sales/bills/:billId',
  accounting: '/accounting',
  accountingBalances: '/accounting/balances',
  accountingProfitLoss: '/accounting/profit-loss',
  accountingChart: '/accounting/chart-of-accounts',
  accountingJournals: '/accounting/journals',
  accountingGeneralJournal: '/accounting/journals/general',
  accountingJournalsReversed: '/accounting/journals/reversed',
  /** Dynamic: `/accounting/journals/reversed/${journalEntryId}` */
  accountingReversedJournalDetail: '/accounting/journals/reversed/:journalEntryId',
  accountingReportGlBalance: '/accounting/reports/gl-balance',
  accountingReportProfitLoss: '/accounting/reports/profit-loss',
  accountingReportBalanceSheet: '/accounting/reports/balance-sheet',
  accountingReportAccountStatement: '/accounting/reports/account-statement',
  accountingTransactionJournal: '/accounting/transaction-journal',
  /** Dynamic: `/accounting/transaction-journal/:journalEntryId` */
  accountingTransactionJournalDetail: '/accounting/transaction-journal/:journalEntryId',
  staff: '/staff',
  staffStatus: '/staff/status',
  configuration: '/configuration',
  contacts: '/contacts',
  businesses: '/businesses',
  billing: '/billing',
  integrationsMerchantApi: '/integrations/merchant-api',
  billingWaveSuccess: '/billing/wave/success',
  billingWaveCancel: '/billing/wave/cancel',
  subscriptions: '/subscriptions',
  subscriptionsInvoices: '/subscriptions/invoices',
  subscriptionsInvoiceDetail: '/subscriptions/invoices/:invoiceId',
  platformPaymentGateways: '/platform/payment-gateways',
  platformAccounting: '/platform/accounting',
  platformAccountingChart: '/platform/accounting/chart-of-accounts',
  platformAccountingJournals: '/platform/accounting/journals',
  /** Manual / reversal journals posted by platform operators (excludes subscription automation). */
  platformAccountingOperatorJournals: '/platform/accounting/operator-journals',
  platformAccountingReportGl: '/platform/accounting/reports/gl-balance',
  platformAccountingReportPnl: '/platform/accounting/reports/profit-loss',
  platformAccountingReportStatement: '/platform/accounting/reports/account-statement',
  platformAccountingMerchantJournalEntries: '/platform/accounting/merchant-journal-entries',
  /** Platform GL operator-scope listing (manual / reversal); same data style as transaction journal. */
  platformAccountingOperatorMerchantJournals: '/platform/accounting/operator-merchant-journals',
  /** Dynamic: `/platform/accounting/merchant-journal-entries/:journalEntryId` */
  platformAccountingMerchantJournalEntryDetail: '/platform/accounting/merchant-journal-entries/:journalEntryId',
  platformBills: '/platform/bills',
  platformBillNew: '/platform/bills/new',
  platformBillDetail: '/platform/bills/:billId',
  platformActivityLog: '/platform/activity-log',
  platformSystemConfiguration: '/platform/system-configuration',
  platformBusinesses: '/platform/businesses',
  platformWaveBusinesses: '/platform/wave-businesses',
  platformBusinessDetail: '/platform/businesses/:businessId',
  platformBillings: '/platform/billings',
  /** Corporate industry: tenant list and custom bill templates (platform operator). */
  platformCorporateBusinesses: '/platform/corporate/businesses',
  platformCorporateBills: '/platform/corporate/bills',
  platformCorporateInvitationLetter: '/platform/corporate/invitation-letter',
  platformCorporateInvitationRecords: '/platform/corporate/invitation-records',
  platformSubscriptions: '/platform/subscriptions',
  platformInvoices: '/platform/invoices',
  platformInvoiceDetail: '/platform/invoices/:invoiceId',
  platformBillingReview: '/platform/billing-review',
  platformBillingTransactions: '/platform/billing-transactions',
  platformSecurityRoles: '/platform/security/roles',
  platformSecurityFunctionGroups: '/platform/security/function-groups',
  platformSecuritySystemUsers: '/platform/security/system-users',
  platformSecurityMoveUsers: '/platform/security/move-users',
  /** Guest-facing menu: business slug + table public token from dining tables. */
  restaurantGuestMenu: '/b/:businessSlug/:tableToken',
  /** @deprecated Redirects to restaurantTables. */
  restaurantSetup: '/restaurant/setup',
  /** Dining tables, guest URLs, printable QR. */
  restaurantTables: '/restaurant/tables',
  /** Menu category tree for restaurant products. */
  restaurantMenuSetup: '/restaurant/menu',
  /** Restaurant-only printable menu grid with product barcodes. */
  restaurantManualMenu: '/restaurant/manual-menu',
  /** Petrol: branches and pumps (one merchant, many sites). */
  petrolStations: '/petrol/stations',
} as const

export function salesQuotationDetailPath(quotationId: string) {
  return `/sales/quotations/${encodeURIComponent(quotationId)}`
}

export function salesInvoiceDetailPath(invoiceId: string) {
  return `/sales/invoices/${encodeURIComponent(invoiceId)}`
}

export function salesBillDetailPath(billId: string) {
  return `/sales/bills/${encodeURIComponent(billId)}`
}

export function platformBillDetailPath(billId: string) {
  return `/platform/bills/${encodeURIComponent(billId)}`
}

export function accountingReversedJournalDetailPath(journalEntryId: string) {
  return `/accounting/journals/reversed/${encodeURIComponent(journalEntryId)}`
}

export function platformMerchantJournalDetailPath(journalEntryId: string) {
  return `/platform/accounting/merchant-journal-entries/${encodeURIComponent(journalEntryId)}`
}

export function transactionJournalDetailPath(journalEntryId: string) {
  return `/accounting/transaction-journal/${encodeURIComponent(journalEntryId)}`
}

export const PLATFORM_SECURITY_SUBNAV = [
  {
    name: 'roles',
    path: APP_PATHS.platformSecurityRoles,
    title: 'Role',
    permission: 'platform.security.roles.view' as const,
  },
  {
    name: 'function-groups',
    path: APP_PATHS.platformSecurityFunctionGroups,
    title: 'Function groups',
    permission: 'platform.security.function_groups.view' as const,
  },
  {
    name: 'system-users',
    path: APP_PATHS.platformSecuritySystemUsers,
    title: 'System user',
    permission: 'platform.security.users.view' as const,
  },
  {
    name: 'move-users',
    path: APP_PATHS.platformSecurityMoveUsers,
    title: 'Move users',
    permission: 'platform.security.move_users.view' as const,
  },
] as const

/** Single permission or any-of (e.g. legacy Invoices view still opens Billing transactions). */
export type PlatformBusinessesSubNavItem =
  | {
      name: string
      path: string
      title: string
      permission: PermissionKey
    }
  | {
      name: string
      path: string
      title: string
      anyOfPermissions: readonly PermissionKey[]
    }

export function platformBusinessesSubnavAllowed(
  item: PlatformBusinessesSubNavItem,
  canAccess: (p: PermissionKey) => boolean,
): boolean {
  if ('anyOfPermissions' in item) {
    return item.anyOfPermissions.some((p) => canAccess(p))
  }
  return canAccess(item.permission)
}

/** Platform operator: Finance (mirrors merchant Finance → GL / P&amp;L / statement, etc.). */
export const PLATFORM_FINANCE_SUBNAV: PlatformBusinessesSubNavItem[] = [
  {
    name: 'finance-accounting',
    path: APP_PATHS.platformAccounting,
    title: 'Accounting',
    permission: 'platform.accounting.view',
  },
  {
    name: 'finance-chart',
    path: APP_PATHS.platformAccountingChart,
    title: 'Chart of accounts',
    permission: 'platform.accounting.chart.view',
  },
  {
    name: 'finance-journals',
    path: APP_PATHS.platformAccountingJournals,
    title: 'Journal entries',
    anyOfPermissions: ['platform.accounting.view', 'platform.accounting.journals.access'] as const,
  },
  {
    name: 'finance-operator-journals',
    path: APP_PATHS.platformAccountingOperatorJournals,
    title: 'Operator journals',
    anyOfPermissions: ['platform.accounting.view', 'platform.accounting.journals.access'] as const,
  },
  {
    name: 'finance-gl',
    path: APP_PATHS.platformAccountingReportGl,
    title: 'GL balance',
    permission: 'platform.accounting.reports.gl',
  },
  {
    name: 'finance-pnl',
    path: APP_PATHS.platformAccountingReportPnl,
    title: 'Profit & loss',
    permission: 'platform.accounting.reports.pnl',
  },
  {
    name: 'finance-statement',
    path: APP_PATHS.platformAccountingReportStatement,
    title: 'Account statement',
    permission: 'platform.accounting.reports.statement',
  },
  {
    name: 'finance-transaction-journal',
    path: APP_PATHS.platformAccountingMerchantJournalEntries,
    title: 'Transaction journal',
    permission: 'platform.accounting.transaction_journal',
  },
  {
    name: 'finance-operator-merchant-journals',
    path: APP_PATHS.platformAccountingOperatorMerchantJournals,
    title: 'Platform operator journal',
    anyOfPermissions: ['platform.accounting.view', 'platform.accounting.journals.access'] as const,
  },
  {
    name: 'finance-platform-bills',
    path: APP_PATHS.platformBills,
    title: 'Supplier bills',
    permission: 'platform.bills.view',
  },
  {
    name: 'finance-platform-activity',
    path: APP_PATHS.platformActivityLog,
    title: 'Activity log',
    permission: 'platform.activity.log',
  },
]

/** Platform operator: Businesses section (after Dashboard). */
export const PLATFORM_BUSINESSES_SUBNAV: PlatformBusinessesSubNavItem[] = [
  {
    name: 'business',
    path: APP_PATHS.platformBusinesses,
    title: 'Businesses',
    permission: 'platform.businesses.manage',
  },
  {
    name: 'wave-businesses',
    path: APP_PATHS.platformWaveBusinesses,
    title: 'Wave Businesses',
    permission: 'platform.businesses.manage',
  },
  {
    name: 'billings',
    path: APP_PATHS.platformBillings,
    title: 'Billings',
    permission: 'platform.billing.manage',
  },
  {
    name: 'Subscriptions',
    path: APP_PATHS.platformSubscriptions,
    title: 'Subscriptions',
    permission: 'platform.subscriptions.view',
  },
  {
    name: 'invoices',
    path: APP_PATHS.platformInvoices,
    title: 'Invoices',
    permission: 'platform.invoices.view',
  },
  {
    name: 'billing-review',
    path: APP_PATHS.platformBillingReview,
    title: 'Billing review',
    permission: 'platform.billing_review.view',
  },
  {
    name: 'billing-transactions',
    path: APP_PATHS.platformBillingTransactions,
    title: 'Billing transactions',
    anyOfPermissions: ['platform.billing_transactions.view', 'platform.invoices.view'],
  },
  {
    name: 'payment-gateways',
    path: APP_PATHS.platformPaymentGateways,
    title: 'Payment gateways',
    permission: 'platform.payment_gateways.manage',
  },
]

/** Platform operator: Corporate (custom billing) section. */
export const PLATFORM_CORPORATE_SUBNAV: PlatformBusinessesSubNavItem[] = [
  {
    name: 'corporate-businesses',
    path: APP_PATHS.platformCorporateBusinesses,
    title: 'Businesses',
    permission: 'platform.businesses.manage',
  },
  {
    name: 'corporate-bills',
    path: APP_PATHS.platformCorporateBills,
    title: 'Corporate bill',
    permission: 'platform.billing.manage',
  },
  {
    name: 'corporate-invitation-letter',
    path: APP_PATHS.platformCorporateInvitationLetter,
    title: 'Invitation letter',
    permission: 'platform.billing.manage',
  },
  {
    name: 'corporate-invitation-records',
    path: APP_PATHS.platformCorporateInvitationRecords,
    title: 'Sent invitations',
    permission: 'platform.billing.manage',
  },
]

export type NavigationItem = {
  name: string
  path: string
  icon: LucideIcon
  roles: User['role'][]
  title: string
  permission: PermissionKey
}

export const MAIN_NAV_ITEMS: NavigationItem[] = [
  {
    name: 'Dashboard',
    path: APP_PATHS.dashboard,
    icon: LayoutDashboard,
    roles: ['platform_owner', 'platform_admin', 'admin', 'merchant', 'cashier'],
    title: 'Dashboard',
    permission: 'dashboard.view',
  },
  {
    name: 'POS / Checkout',
    path: APP_PATHS.pos,
    icon: ShoppingBag,
    roles: ['admin', 'merchant', 'cashier'],
    title: 'Point of Sale',
    permission: 'pos.access',
  },
  {
    name: 'Products',
    path: APP_PATHS.products,
    icon: Package,
    roles: ['admin', 'merchant', 'cashier'],
    title: 'Products',
    permission: 'products.view',
  },
  {
    name: 'Orders',
    path: APP_PATHS.orders,
    icon: ClipboardList,
    roles: ['admin', 'merchant', 'cashier'],
    title: 'Orders',
    permission: 'orders.view',
  },
  {
    name: 'Payments',
    path: APP_PATHS.payments,
    icon: CreditCard,
    roles: ['platform_owner', 'platform_admin', 'admin', 'merchant', 'cashier'],
    title: 'Payments',
    permission: 'payments.view',
  },
  {
    name: 'Activity log',
    path: APP_PATHS.activityLog,
    icon: History,
    /** Plan entitlement `activity.log` (Organization service); assignable to staff like other products. */
    roles: ['platform_owner', 'platform_admin', 'admin', 'merchant', 'cashier'],
    title: 'Activity log',
    permission: 'activity.log',
  },
  {
    name: 'Reports',
    path: APP_PATHS.reports,
    icon: BarChart3,
    roles: ['platform_owner', 'platform_admin', 'admin', 'merchant', 'cashier'],
    title: 'Reports',
    permission: 'reports.view',
  },
  {
    name: 'Accounting',
    path: APP_PATHS.accounting,
    icon: BookOpenText,
    roles: ['merchant', 'cashier'],
    title: 'Accounting',
    permission: 'accounting.view',
  },
  {
    name: 'Staff',
    path: APP_PATHS.staff,
    icon: Users,
    roles: ['merchant'],
    title: 'Staff',
    permission: 'staff.manage',
  },
  {
    name: 'Staff access status',
    path: APP_PATHS.staffStatus,
    icon: UserCog,
    roles: ['merchant'],
    title: 'Staff access status',
    permission: 'status.change.view',
  },
  {
    name: 'Plan Controls',
    path: APP_PATHS.subscriptions,
    icon: Settings2,
    roles: ['admin', 'platform_owner', 'platform_admin'],
    title: 'Plan Controls',
    permission: 'organization.manage',
  },
]

export const RESTAURANT_NAV_ITEM = {
  name: 'Restaurant menu',
  icon: Utensils,
}

export function getPageTitle(pathname: string) {
  if (pathname.includes(APP_PATHS.businesses)) {
    return 'My Businesses'
  }

  if (pathname.includes(APP_PATHS.changePassword)) {
    return 'Change Password'
  }

  if (pathname.includes(APP_PATHS.platformSystemConfiguration)) {
    return 'System configuration'
  }

  if (pathname.includes(APP_PATHS.platformSecurityRoles)) {
    return 'Role templates'
  }

  if (pathname.includes(APP_PATHS.platformSecurityFunctionGroups)) {
    return 'Function groups'
  }

  if (pathname.includes(APP_PATHS.platformSecuritySystemUsers)) {
    return 'System users'
  }

  if (pathname.includes('/platform/invoices/') && pathname !== APP_PATHS.platformInvoices) {
    return 'Invoice'
  }

  if (pathname.includes(APP_PATHS.platformInvoices)) {
    return 'Invoices'
  }

  if (pathname.includes(APP_PATHS.platformBillingReview)) {
    return 'Billing review'
  }

  if (pathname.includes(APP_PATHS.platformSubscriptions)) {
    return 'Subscriptions'
  }

  if (pathname.includes(APP_PATHS.platformBillings)) {
    return 'Billings'
  }

  if (pathname.includes(APP_PATHS.platformCorporateBills)) {
    return 'Corporate bill'
  }

  if (pathname.includes(APP_PATHS.platformCorporateInvitationLetter)) {
    return 'Business invitation letter'
  }

  if (pathname.includes(APP_PATHS.platformCorporateInvitationRecords)) {
    return 'Sent invitations'
  }

  if (pathname.includes(APP_PATHS.platformCorporateBusinesses)) {
    return 'Corporate businesses'
  }

  if (pathname.includes(APP_PATHS.platformPaymentGateways)) {
    return 'Payment gateways'
  }

  if (pathname.includes(APP_PATHS.platformAccountingChart)) {
    return 'Chart of accounts'
  }
  if (pathname.includes(APP_PATHS.platformAccountingOperatorJournals)) {
    return 'Operator journals'
  }
  if (pathname.includes(APP_PATHS.platformAccountingJournals)) {
    return 'Journal entries'
  }
  if (pathname.includes(APP_PATHS.platformAccountingReportGl)) {
    return 'GL balance report'
  }
  if (pathname.includes(APP_PATHS.platformAccountingReportPnl)) {
    return 'Profit & loss report'
  }
  if (pathname.includes(APP_PATHS.platformAccountingReportStatement)) {
    return 'Account statement'
  }
  if (pathname.includes(APP_PATHS.platformAccountingOperatorMerchantJournals)) {
    return 'Platform operator journal'
  }
  if (pathname.includes('/platform/accounting/merchant-journal-entries')) {
    return 'Transaction journal'
  }
  if (pathname.includes('/platform/bills/') && pathname !== APP_PATHS.platformBills) {
    return 'Supplier bill'
  }
  if (pathname.includes(APP_PATHS.platformBills)) {
    return 'Supplier bills'
  }
  if (pathname.includes(APP_PATHS.platformActivityLog)) {
    return 'Activity log'
  }
  if (pathname.includes(APP_PATHS.platformAccounting)) {
    return 'Accounting'
  }

  if (pathname.includes(APP_PATHS.integrationsMerchantApi)) {
    return 'Merchant API'
  }

  if (pathname.includes('/billing/wave/')) {
    return 'Wave checkout'
  }

  if (
    pathname.includes('/subscriptions/invoices/') &&
    pathname !== APP_PATHS.subscriptionsInvoices
  ) {
    return 'Invoice'
  }

  if (pathname.includes(APP_PATHS.subscriptionsInvoices)) {
    return 'Invoices'
  }

  if (pathname.includes(APP_PATHS.subscriptionsBillingActivity)) {
    return 'Subscription payments'
  }

  if (pathname.includes(APP_PATHS.platformBillingTransactions)) {
    return 'Billing transactions'
  }

  if (pathname.includes(APP_PATHS.billing)) {
    return 'Billing'
  }

  if (pathname.includes('/platform/businesses/') && pathname !== APP_PATHS.platformBusinesses) {
    return 'Business detail'
  }

  if (pathname.includes(APP_PATHS.platformWaveBusinesses)) {
    return 'Wave Businesses'
  }

  if (pathname.includes(APP_PATHS.platformBusinesses)) {
    return 'Businesses'
  }

  if (pathname.includes(APP_PATHS.configuration)) {
    return 'Configuration'
  }

  if (pathname.includes(APP_PATHS.contacts)) {
    return 'Contacts'
  }

  if (pathname.includes(APP_PATHS.catalogCategories)) {
    return 'Categories'
  }

  if (pathname.startsWith('/b/')) {
    return 'Restaurant menu'
  }
  if (pathname.includes(APP_PATHS.restaurantManualMenu)) {
    return 'Manual Menu'
  }
  if (pathname.startsWith('/restaurant/')) {
    return 'Restaurant'
  }

  if (pathname.includes(APP_PATHS.accountingGeneralJournal)) {
    return 'General journal'
  }
  if (pathname.includes('/accounting/journals/reversed/') && pathname !== APP_PATHS.accountingJournalsReversed) {
    return 'Journal reversal'
  }
  if (pathname.includes(APP_PATHS.accountingJournalsReversed)) {
    return 'Reversed journal'
  }
  if (pathname.includes(APP_PATHS.accountingJournals)) {
    return 'Journal entries'
  }
  if (pathname.includes(APP_PATHS.accountingReportGlBalance)) {
    return 'GL balance report'
  }
  if (pathname.includes(APP_PATHS.accountingReportProfitLoss)) {
    return 'Profit & loss report'
  }
  if (pathname.includes(APP_PATHS.accountingReportBalanceSheet)) {
    return 'Balance sheet'
  }
  if (pathname.includes(APP_PATHS.accountingReportAccountStatement)) {
    return 'Account statement'
  }
  if (pathname.includes('/accounting/transaction-journal')) {
    return 'Transaction journal'
  }
  if (pathname.includes(APP_PATHS.salesQuotations)) {
    return 'Sales quotations'
  }
  if (pathname.includes(APP_PATHS.salesBills)) {
    return 'Bills'
  }
  if (pathname.includes(APP_PATHS.salesInvoices)) {
    return 'Sales invoices'
  }
  if (pathname.includes(APP_PATHS.petrolStations)) {
    return 'Stations & pumps'
  }

  const matchedItem = [...MAIN_NAV_ITEMS].sort((a, b) => b.path.length - a.path.length).find(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
  )
  return matchedItem?.title ?? 'DirectPay'
}

export const DOCUMENT_TITLE_BRAND = 'DirectPay'

/** Human-readable segment for `<title>` when `getPageTitle` falls back to `DirectPay`. */
function browserTabTitleFallback(pathname: string): string {
  if (pathname === '/') {
    return 'Home'
  }
  const authTitles: Record<string, string> = {
    [APP_PATHS.login]: 'Sign in',
    [APP_PATHS.signup]: 'Sign up',
    [APP_PATHS.forgotPassword]: 'Forgot password',
    [APP_PATHS.changePassword]: 'Change password',
  }
  const authHit = authTitles[pathname]
  if (authHit) {
    return authHit
  }
  if (pathname.startsWith('/p/')) {
    return 'Product'
  }
  if (pathname.startsWith('/pay/')) {
    return 'Pay'
  }
  if (pathname.startsWith('/guest/quotation/')) {
    return 'Quotation'
  }
  if (pathname.startsWith('/guest/invoice/')) {
    return 'Invoice'
  }
  if (pathname.startsWith('/guest/platform-bill/')) {
    return 'Bill'
  }
  if (pathname.startsWith('/guest/subscription-invoice/')) {
    return 'Subscription invoice'
  }
  return 'Page'
}

/** `DirectPay | …` for the browser tab; uses `getPageTitle` and a small fallback map. */
export function formatBrowserDocumentTitle(pathname: string): string {
  const page = getPageTitle(pathname)
  const subtitle = page === 'DirectPay' ? browserTabTitleFallback(pathname) : page
  return `${DOCUMENT_TITLE_BRAND} | ${subtitle}`
}

export function getDefaultProtectedPath(role: User['role']) {
  if (role === 'cashier') {
    return APP_PATHS.pos
  }
  if (role === 'platform_admin') {
    return APP_PATHS.dashboard
  }
  return APP_PATHS.dashboard
}
