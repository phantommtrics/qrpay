import type { LucideIcon } from 'lucide-react'
import {
  BookOpenText,
  BarChart3,
  ClipboardList,
  CreditCard,
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
  login: '/login',
  signup: '/signup',
  forgotPassword: '/forgot-password',
  changePassword: '/account/change-password',
  dashboard: '/dashboard',
  pos: '/pos',
  products: '/products',
  orders: '/orders',
  payments: '/payments',
  reports: '/reports',
  subscriptionsBillingActivity: '/subscriptions/billing-activity',
  salesQuotations: '/sales/quotations',
  salesInvoices: '/sales/invoices',
  /** Dynamic: `/sales/quotations/${quotationId}` */
  salesQuotationDetail: '/sales/quotations/:quotationId',
  /** Dynamic: `/sales/invoices/${invoiceId}` */
  salesInvoiceDetail: '/sales/invoices/:invoiceId',
  accounting: '/accounting',
  accountingBalances: '/accounting/balances',
  accountingProfitLoss: '/accounting/profit-loss',
  accountingChart: '/accounting/chart-of-accounts',
  accountingJournals: '/accounting/journals',
  accountingReportGlBalance: '/accounting/reports/gl-balance',
  accountingReportProfitLoss: '/accounting/reports/profit-loss',
  accountingReportAccountStatement: '/accounting/reports/account-statement',
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
  platformAccountingReportGl: '/platform/accounting/reports/gl-balance',
  platformAccountingReportPnl: '/platform/accounting/reports/profit-loss',
  platformAccountingReportStatement: '/platform/accounting/reports/account-statement',
  platformSystemConfiguration: '/platform/system-configuration',
  platformBusinesses: '/platform/businesses',
  platformBusinessDetail: '/platform/businesses/:businessId',
  platformBillings: '/platform/billings',
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
} as const

export function salesQuotationDetailPath(quotationId: string) {
  return `/sales/quotations/${encodeURIComponent(quotationId)}`
}

export function salesInvoiceDetailPath(invoiceId: string) {
  return `/sales/invoices/${encodeURIComponent(invoiceId)}`
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
    permission: 'platform.accounting.view',
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

  if (pathname.includes(APP_PATHS.platformPaymentGateways)) {
    return 'Payment gateways'
  }

  if (pathname.includes(APP_PATHS.platformAccountingChart)) {
    return 'Chart of accounts'
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

  if (pathname.includes(APP_PATHS.platformBusinesses)) {
    return 'Businesses'
  }

  if (pathname.includes(APP_PATHS.configuration)) {
    return 'Configuration'
  }

  if (pathname.includes(APP_PATHS.contacts)) {
    return 'Contacts'
  }

  if (pathname.startsWith('/b/')) {
    return 'Restaurant menu'
  }
  if (pathname.startsWith('/restaurant/')) {
    return 'Restaurant'
  }

  if (pathname.includes(APP_PATHS.accountingReportGlBalance)) {
    return 'GL balance report'
  }
  if (pathname.includes(APP_PATHS.accountingReportProfitLoss)) {
    return 'Profit & loss report'
  }
  if (pathname.includes(APP_PATHS.accountingReportAccountStatement)) {
    return 'Account statement'
  }
  if (pathname.includes(APP_PATHS.salesQuotations)) {
    return 'Sales quotations'
  }
  if (pathname.includes(APP_PATHS.salesInvoices)) {
    return 'Sales invoices'
  }

  const matchedItem = [...MAIN_NAV_ITEMS].sort((a, b) => b.path.length - a.path.length).find(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
  )
  return matchedItem?.title ?? 'EASYPAY'
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
