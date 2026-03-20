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
  Users,
  Utensils,
} from 'lucide-react'

import type { PermissionKey, User } from '../types'

export const APP_PATHS = {
  root: '/',
  login: '/login',
  signup: '/signup',
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
  subscriptions: '/subscriptions',
  customerMenu: '/menu/:tableId',
  customerMenuDemo: '/menu/T-01',
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
    roles: ['admin', 'merchant'],
    title: 'Dashboard',
    permission: 'dashboard.view',
  },
  {
    name: 'POS / Checkout',
    path: APP_PATHS.pos,
    icon: ShoppingBag,
    roles: ['admin', 'merchant', 'cashier'],
    title: 'Point of Sale',
    permission: 'pos.view',
  },
  {
    name: 'Products',
    path: APP_PATHS.products,
    icon: Package,
    roles: ['admin', 'merchant'],
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
    roles: ['admin', 'merchant'],
    title: 'Payments',
    permission: 'payments.view',
  },
  {
    name: 'Reports',
    path: APP_PATHS.reports,
    icon: BarChart3,
    roles: ['admin', 'merchant'],
    title: 'Reports',
    permission: 'reports.view',
  },
  {
    name: 'Accounting',
    path: APP_PATHS.accounting,
    icon: BookOpenText,
    roles: ['merchant'],
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
    name: 'Plan Controls',
    path: APP_PATHS.subscriptions,
    icon: Settings2,
    roles: ['admin'],
    title: 'Plan Controls',
    permission: 'organization.manage',
  },
]

export const RESTAURANT_NAV_ITEM = {
  name: 'View Menu (Demo)',
  path: APP_PATHS.customerMenuDemo,
  icon: Utensils,
}

export function getPageTitle(pathname: string) {
  const matchedItem = MAIN_NAV_ITEMS.find((item) => pathname.includes(item.path))
  return matchedItem?.title ?? 'QRPay'
}

export function getDefaultProtectedPath(role: User['role']) {
  return role === 'cashier' ? APP_PATHS.pos : APP_PATHS.dashboard
}
