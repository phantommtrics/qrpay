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
  subscriptions: '/subscriptions',
  platformSystemConfiguration: '/platform/system-configuration',
  customerMenu: '/menu/:businessId/:tableId',
} as const

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
    roles: ['platform_owner', 'admin', 'merchant', 'cashier'],
    title: 'Dashboard',
    permission: 'dashboard.view',
  },
  {
    name: 'POS / Checkout',
    path: APP_PATHS.pos,
    icon: ShoppingBag,
    roles: ['platform_owner', 'admin', 'merchant', 'cashier'],
    title: 'Point of Sale',
    permission: 'pos.access',
  },
  {
    name: 'Products',
    path: APP_PATHS.products,
    icon: Package,
    roles: ['platform_owner', 'admin', 'merchant', 'cashier'],
    title: 'Products',
    permission: 'products.view',
  },
  {
    name: 'Orders',
    path: APP_PATHS.orders,
    icon: ClipboardList,
    roles: ['platform_owner', 'admin', 'merchant', 'cashier'],
    title: 'Orders',
    permission: 'orders.view',
  },
  {
    name: 'Payments',
    path: APP_PATHS.payments,
    icon: CreditCard,
    roles: ['platform_owner', 'admin', 'merchant', 'cashier'],
    title: 'Payments',
    permission: 'payments.view',
  },
  {
    name: 'Reports',
    path: APP_PATHS.reports,
    icon: BarChart3,
    roles: ['platform_owner', 'admin', 'merchant', 'cashier'],
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
    roles: ['admin', 'platform_owner'],
    title: 'Plan Controls',
    permission: 'organization.manage',
  },
]

export const RESTAURANT_NAV_ITEM = {
  name: 'Customer menu',
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

  if (pathname.includes(APP_PATHS.configuration)) {
    return 'Configuration'
  }

  const matchedItem = [...MAIN_NAV_ITEMS].sort((a, b) => b.path.length - a.path.length).find(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
  )
  return matchedItem?.title ?? 'QRPay'
}

export function getDefaultProtectedPath(role: User['role']) {
  return role === 'cashier' ? APP_PATHS.pos : APP_PATHS.dashboard
}
