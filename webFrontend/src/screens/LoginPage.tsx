import { motion } from 'framer-motion'
import {
  QrCode,
  ShieldCheck,
  ShoppingCart,
  Store,
  User as UserIcon,
} from 'lucide-react'

import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import type { User } from '../types'

export function LoginPage() {
  const { login } = useAuth()
  const roles = [
    {
      id: 'admin',
      name: 'Platform Admin',
      icon: ShieldCheck,
      desc: 'Manage tenants and system',
      color: 'bg-indigo-100 text-indigo-600',
    },
    {
      id: 'merchant',
      name: 'Business Owner',
      icon: Store,
      desc: 'Manage products and reports',
      color: 'bg-teal-100 text-teal-600',
    },
    {
      id: 'cashier',
      name: 'Cashier / Waiter',
      icon: ShoppingCart,
      desc: 'Process orders and payments',
      color: 'bg-amber-100 text-amber-600',
    },
    {
      id: 'customer',
      name: 'Customer (Demo)',
      icon: UserIcon,
      desc: 'Self-service ordering',
      color: 'bg-rose-100 text-rose-600',
    },
  ] as const

  const handleRoleSelect = (roleId: (typeof roles)[number]['id']) => {
    if (roleId === 'customer') {
      window.location.hash = `#${APP_PATHS.customerMenuDemo}`
      return
    }

    const mockUser: User = {
      id: `usr-${Math.floor(Math.random() * 1000)}`,
      name:
        roleId === 'admin'
          ? 'System Admin'
          : roleId === 'merchant'
            ? 'Fatou Store'
            : 'John Cashier',
      email: `${roleId}@qrpay.com`,
      role: roleId,
      businessId: roleId === 'admin' ? undefined : 'b1',
    }

    login(mockUser)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.08),transparent_45%)]" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="bg-slate-900 p-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-teal-500/20">
            <QrCode className="h-8 w-8 text-teal-400" />
          </div>
          <h1 className="mb-2 text-3xl font-bold text-white">QRPay</h1>
          <p className="text-sm text-slate-400">
            Smart Retail and Restaurant Payment System
          </p>
        </div>

        <div className="p-8">
          <h2 className="mb-4 text-center text-lg font-semibold text-slate-800">
            Select a role to continue
          </h2>

          <div className="grid gap-3">
            {roles.map((role, index) => (
              <motion.button
                key={role.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.08 }}
                onClick={() => handleRoleSelect(role.id)}
                className="group flex items-center rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-teal-500 hover:shadow-md"
              >
                <div
                  className={`mr-4 flex h-12 w-12 items-center justify-center rounded-lg ${role.color} transition-transform group-hover:scale-110`}
                >
                  <role.icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 transition-colors group-hover:text-teal-600">
                    {role.name}
                  </h3>
                  <p className="text-xs text-slate-500">{role.desc}</p>
                </div>
              </motion.button>
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-slate-400">
            Demo-only login with mock data. No backend auth is required.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
