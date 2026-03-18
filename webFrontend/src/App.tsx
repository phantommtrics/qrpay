import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  HashRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import {
  BarChart3,
  Bell,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  QrCode,
  Search,
  ShoppingBag,
  Utensils,
} from 'lucide-react'

import { CustomerMenuPage } from './screens/CustomerMenuPage'
import { DashboardPage } from './screens/DashboardPage'
import { LoginPage } from './screens/LoginPage'
import { OrdersPage } from './screens/OrdersPage'
import { PaymentsPage } from './screens/PaymentsPage'
import { POSPage } from './screens/POSPage'
import { ProductsPage } from './screens/ProductsPage'
import { ReportsPage } from './screens/ReportsPage'
import type { User } from './types'

function Header({
  title,
  onMenuClick,
}: {
  title: string
  onMenuClick: () => void
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
      <div className="flex items-center">
        <button
          onClick={onMenuClick}
          className="mr-3 -ml-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
        >
          <Menu className="h-6 w-6" />
        </button>
        <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative hidden md:flex">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-64 rounded-full border border-transparent bg-slate-100 py-2 pr-4 pl-9 text-sm outline-none transition-all focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-200"
          />
        </div>
        <button className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full border-2 border-white bg-amber-500" />
        </button>
      </div>
    </header>
  )
}

function Sidebar({
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

function AppLayout({
  user,
  onLogout,
  children,
}: {
  user: User
  onLogout: () => void
  children: ReactNode
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setIsSidebarOpen(false)
  }, [location.pathname])

  const title = useMemo(() => {
    const path = location.pathname
    if (path.includes('/dashboard')) return 'Dashboard'
    if (path.includes('/products')) return 'Products'
    if (path.includes('/pos')) return 'Point of Sale'
    if (path.includes('/orders')) return 'Orders'
    if (path.includes('/payments')) return 'Payments'
    if (path.includes('/reports')) return 'Reports'
    return 'QRPay'
  }, [location.pathname])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar
        user={user}
        onLogout={onLogout}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title={title} onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="mx-auto h-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}

function ProtectedPage({
  user,
  onLogout,
  children,
}: {
  user: User | null
  onLogout: () => void
  children: ReactNode
}) {
  if (!user) {
    return <Navigate to="/" replace />
  }

  return (
    <AppLayout user={user} onLogout={onLogout}>
      {children}
    </AppLayout>
  )
}

function AppRoutes() {
  const [user, setUser] = useState<User | null>(null)

  return (
    <Routes>
      <Route
        path="/"
        element={
          user ? (
            <Navigate
              to={user.role === 'cashier' ? '/pos' : '/dashboard'}
              replace
            />
          ) : (
            <LoginPage onLogin={setUser} />
          )
        }
      />
      <Route path="/menu/:tableId" element={<CustomerMenuPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedPage user={user} onLogout={() => setUser(null)}>
            <DashboardPage />
          </ProtectedPage>
        }
      />
      <Route
        path="/products"
        element={
          <ProtectedPage user={user} onLogout={() => setUser(null)}>
            <ProductsPage />
          </ProtectedPage>
        }
      />
      <Route
        path="/pos"
        element={
          <ProtectedPage user={user} onLogout={() => setUser(null)}>
            <POSPage />
          </ProtectedPage>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedPage user={user} onLogout={() => setUser(null)}>
            <OrdersPage />
          </ProtectedPage>
        }
      />
      <Route
        path="/payments"
        element={
          <ProtectedPage user={user} onLogout={() => setUser(null)}>
            <PaymentsPage />
          </ProtectedPage>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedPage user={user} onLogout={() => setUser(null)}>
            <ReportsPage />
          </ProtectedPage>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  )
}
