import {
  BarChart3,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Package,
  QrCode,
  ShoppingBag,
  Utensils,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

import type { User } from '../types'

export function Sidebar({
  user,
  onLogout,
  isOpen,
  setIsOpen,
}: {
  user: User
  onLogout: () => void
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}) {
  const items = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'merchant'] as User['role'][],
    },
    {
      name: 'POS / Checkout',
      path: '/pos',
      icon: ShoppingBag,
      roles: ['admin', 'merchant', 'cashier'] as User['role'][],
    },
    {
      name: 'Products',
      path: '/products',
      icon: Package,
      roles: ['admin', 'merchant'] as User['role'][],
    },
    {
      name: 'Orders',
      path: '/orders',
      icon: ClipboardList,
      roles: ['admin', 'merchant', 'cashier'] as User['role'][],
    },
    {
      name: 'Payments',
      path: '/payments',
      icon: CreditCard,
      roles: ['admin', 'merchant'] as User['role'][],
    },
    {
      name: 'Reports',
      path: '/reports',
      icon: BarChart3,
      roles: ['admin', 'merchant'] as User['role'][],
    },
  ]

  const navItems = items.filter((item) => item.roles.includes(user.role))

  return (
    <>
      {isOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 text-slate-300 transition-transform duration-300 lg:static ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex h-16 items-center border-b border-slate-800 px-6">
          <QrCode className="mr-3 h-8 w-8 text-teal-500" />
          <span className="text-xl font-bold tracking-tight text-white">QRPay</span>
        </div>

        <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-6">
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Main Menu
          </div>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) =>
                `flex items-center rounded-lg border-l-2 px-3 py-2.5 transition-colors ${
                  isActive
                    ? 'border-teal-500 bg-teal-500/10 text-teal-400'
                    : 'border-transparent hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <item.icon className="mr-3 h-5 w-5" />
              <span className="font-medium">{item.name}</span>
            </NavLink>
          ))}

          {user.role !== 'cashier' ? (
            <>
              <div className="mt-6 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Restaurant
              </div>
              <NavLink
                to="/menu/T-01"
                onClick={() => setIsOpen(false)}
                className="flex items-center rounded-lg border-l-2 border-transparent px-3 py-2.5 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <Utensils className="mr-3 h-5 w-5" />
                <span className="font-medium">View Menu (Demo)</span>
              </NavLink>
            </>
          ) : null}
        </div>

        <div className="border-t border-slate-800 p-4">
          <div className="mb-4 flex items-center px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 font-bold text-white">
              {user.name.charAt(0)}
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="text-xs capitalize text-slate-400">{user.role}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="mr-3 h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  )
}
