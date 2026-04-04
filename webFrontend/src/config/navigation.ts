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
  accounting: '/accounting',
  accountingBalances: '/accounting/balances',
  accountingProfitLoss: '/accounting/profit-loss',
  accountingChart: '/accounting/chart-of-accounts',
  staff: '/staff',
  staffStatus: '/staff/status',
  configuration: '/configuration',
  businesses: '/businesses',
  billing: '/billing',
  billingWaveSuccess: '/billing/wave/success',
  billingWaveCancel: '/billing/wave/cancel',
  subscriptions: '/subscriptions',
  subscriptionsInvoices: '/subscriptions/invoices',
  subscriptionsInvoiceDetail: '/subscriptions/invoices/:invoiceId',
  platformPaymentGateways: '/platform/payment-gateways',
  platformSystemConfiguration: '/platform/system-configuration',
  platformBusinesses: '/platform/businesses',
  platformBusinessDetail: '/platform/businesses/:businessId',
  platformBillings: '/platform/billings',
  platformSubscriptions: '/platform/subscriptions',
  platformInvoices: '/platform/invoices',
  platformInvoiceDetail: '/platform/invoices/:invoiceId',
  platformBillingReview: '/platform/billing-review',
  platformSecurityRoles: '/platform/security/roles',
  platformSecurityFunctionGroups: '/platform/security/function-groups',
  platformSecuritySystemUsers: '/platform/security/system-users',
  platformSecurityMoveUsers: '/platform/security/move-users',
  customerMenu: '/menu/:businessId/:tableId',
} as const

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

/** Platform operator: Businesses section (after Dashboard). */
export const PLATFORM_BUSINESSES_SUBNAV = [
  {
    name: 'business',
    path: APP_PATHS.platformBusinesses,
    title: 'Businesses',
    permission: 'platform.businesses.manage' as const,
  },
  {
    name: 'billings',
    path: APP_PATHS.platformBillings,
    title: 'Billings',
    permission: 'platform.billing.manage' as const,
  },
  {
    name: 'Subscriptions',
    path: APP_PATHS.platformSubscriptions,
    title: 'Subscriptions',
    permission: 'platform.subscriptions.view' as const,
  },
  {
    name: 'invoices',
    path: APP_PATHS.platformInvoices,
    title: 'Invoices',
    permission: 'platform.invoices.view' as const,
  },
  {
    name: 'billing-review',
    path: APP_PATHS.platformBillingReview,
    title: 'Billing review',
    permission: 'platform.billing_review.view' as const,
  },
  {
    name: 'payment-gateways',
    path: APP_PATHS.platformPaymentGateways,
    title: 'Payment gateways',
    permission: 'platform.payment_gateways.manage' as const,
  },
] as const

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

  if (pathname.startsWith('/menu/')) {
    return 'Restaurant menu'
  }

  const matchedItem = [...MAIN_NAV_ITEMS].sort((a, b) => b.path.length - a.path.length).find(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
  )
  return matchedItem?.title ?? 'QRPay'
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
