import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Package,
  ShoppingBag,
  Utensils,
} from 'lucide-react'

import type { User } from '../types'

export const APP_PATHS = {
  root: '/',
  dashboard: '/dashboard',
  pos: '/pos',
  products: '/products',
  orders: '/orders',
  payments: '/payments',
  reports: '/reports',
  customerMenu: '/menu/:tableId',
  customerMenuDemo: '/menu/T-01',
} as const

export type NavigationItem = {
  name: string
  path: string
  icon: LucideIcon
  roles: User['role'][]
  title: string
}

export const MAIN_NAV_ITEMS: NavigationItem[] = [
  {
    name: 'Dashboard',
    path: APP_PATHS.dashboard,
    icon: LayoutDashboard,
    roles: ['admin', 'merchant'],
    title: 'Dashboard',
  },
  {
    name: 'POS / Checkout',
    path: APP_PATHS.pos,
    icon: ShoppingBag,
    roles: ['admin', 'merchant', 'cashier'],
    title: 'Point of Sale',
  },
  {
    name: 'Products',
    path: APP_PATHS.products,
    icon: Package,
    roles: ['admin', 'merchant'],
    title: 'Products',
  },
  {
    name: 'Orders',
    path: APP_PATHS.orders,
    icon: ClipboardList,
    roles: ['admin', 'merchant', 'cashier'],
    title: 'Orders',
  },
  {
    name: 'Payments',
    path: APP_PATHS.payments,
    icon: CreditCard,
    roles: ['admin', 'merchant'],
    title: 'Payments',
  },
  {
    name: 'Reports',
    path: APP_PATHS.reports,
    icon: BarChart3,
    roles: ['admin', 'merchant'],
    title: 'Reports',
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
