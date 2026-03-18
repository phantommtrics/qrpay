import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  HashRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Bell,
  Calendar,
  CheckCircle2,
  ChefHat,
  ChevronLeft,
  ClipboardList,
  Clock3,
  CreditCard,
  Download,
  Edit,
  Filter,
  LayoutDashboard,
  LogOut,
  Menu,
  Minus,
  Package,
  Plus,
  QrCode,
  ScanLine,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
  TrendingUp,
  User as UserIcon,
  Utensils,
  X,
} from 'lucide-react'
import {
  CATEGORY_DATA,
  COLORS,
  MOCK_ORDERS,
  MOCK_PAYMENTS,
  MOCK_PRODUCTS,
  MOCK_STATS,
  REVENUE_DATA,
  TOP_PRODUCTS,
} from './data/mockData'
import type { CartItem, Order, Product, User } from './types'

function formatMoney(value: number) {
  return `D${value.toFixed(2)}`
}

function getStatusColor(status: Order['status']) {
  switch (status) {
    case 'pending':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'preparing':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'served':
      return 'bg-teal-100 text-teal-700 border-teal-200'
    case 'completed':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

function getStatusIcon(status: Order['status']) {
  switch (status) {
    case 'pending':
      return <Clock3 className="h-4 w-4" />
    case 'preparing':
      return <ChefHat className="h-4 w-4" />
    case 'served':
      return <Utensils className="h-4 w-4" />
    case 'completed':
      return <CheckCircle2 className="h-4 w-4" />
    default:
      return null
  }
}

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
          <span className="text-xl font-bold tracking-tight text-white">
            QRPay
          </span>
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
              <p className="truncate text-sm font-medium text-white">
                {user.name}
              </p>
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

function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
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
      window.location.hash = '#/menu/T-01'
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

    onLogin(mockUser)
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

function DashboardPage() {
  const stats = [
    {
      title: 'Total Revenue',
      value: `D${MOCK_STATS.totalSales.toLocaleString()}`,
      icon: TrendingUp,
      color: 'text-teal-600',
      bg: 'bg-teal-100',
      trend: '+12.5%',
      positive: true,
    },
    {
      title: 'Orders Today',
      value: MOCK_STATS.totalOrders,
      icon: ShoppingBag,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
      trend: '+5.2%',
      positive: true,
    },
    {
      title: 'Total Products',
      value: MOCK_STATS.totalProducts,
      icon: Package,
      color: 'text-indigo-600',
      bg: 'bg-indigo-100',
      trend: '0%',
      positive: true,
    },
    {
      title: 'Low Stock Alerts',
      value: MOCK_STATS.lowStockCount,
      icon: Clock3,
      color: 'text-amber-600',
      bg: 'bg-amber-100',
      trend: '-2',
      positive: false,
    },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.title}
            className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="mb-1 text-sm font-medium text-slate-500">{stat.title}</p>
                <h3 className="text-2xl font-bold text-slate-800">{stat.value}</h3>
              </div>
              <div className={`rounded-lg p-3 ${stat.bg}`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              {stat.positive ? (
                <ArrowUpRight className="mr-1 h-4 w-4 text-emerald-500" />
              ) : (
                <ArrowDownRight className="mr-1 h-4 w-4 text-amber-500" />
              )}
              <span className={stat.positive ? 'font-medium text-emerald-600' : 'font-medium text-amber-600'}>
                {stat.trend}
              </span>
              <span className="ml-2 text-slate-400">vs last week</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm xl:col-span-2">
          <h3 className="mb-6 text-lg font-semibold text-slate-800">Revenue Overview</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={REVENUE_DATA}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0D9488" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} tickFormatter={(value) => `D${value}`} />
                <Tooltip
                  formatter={(value) => [`D${value ?? 0}`, 'Revenue']}
                  contentStyle={{ border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#0D9488" strokeWidth={3} fill="url(#revenueFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Recent Orders</h3>
            <button className="text-sm font-medium text-teal-600 hover:text-teal-700">View All</button>
          </div>
          <div className="space-y-4">
            {MOCK_ORDERS.slice(0, 5).map((order) => (
              <div key={order.id} className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-slate-50">
                <div>
                  <p className="font-mono text-sm font-medium text-slate-800">{order.id}</p>
                  <p className="text-xs text-slate-500">{order.items.length} items</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-800">D{order.total}</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-1 text-xs font-medium capitalize ${order.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : order.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function ProductsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const filteredProducts = MOCK_PRODUCTS.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-4 pl-10 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div className="flex gap-3">
          <button className="flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50">
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </button>
          <button className="flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2 text-white shadow-sm transition-colors hover:bg-teal-700">
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {filteredProducts.map((product) => (
          <motion.button
            key={product.id}
            layoutId={`product-${product.id}`}
            onClick={() => setSelectedProduct(product)}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition-shadow hover:shadow-md"
          >
            <div className={`flex h-32 items-center justify-center text-5xl ${product.imageColor}`}>
              {product.imageEmoji}
            </div>
            <div className="p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="line-clamp-1 font-semibold text-slate-800">{product.name}</h3>
                <span className="font-bold text-teal-600">D{product.price}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{product.category}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${product.stock < 20 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                  {product.stock} in stock
                </span>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {selectedProduct ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setSelectedProduct(null)}
            />
            <motion.div
              layoutId={`product-${selectedProduct.id}`}
              className="relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl md:flex-row"
            >
              <div className="flex-1 border-b border-slate-100 p-6 md:border-r md:border-b-0">
                <div className="mb-6 flex items-start justify-between">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-xl text-3xl ${selectedProduct.imageColor}`}>
                    {selectedProduct.imageEmoji}
                  </div>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <h2 className="mb-1 text-2xl font-bold text-slate-800">{selectedProduct.name}</h2>
                <p className="mb-6 text-slate-500">{selectedProduct.category}</p>

                <div className="space-y-4">
                  <div className="flex justify-between border-b border-slate-100 py-3">
                    <span className="text-slate-500">Price</span>
                    <span className="font-semibold text-slate-800">D{selectedProduct.price}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 py-3">
                    <span className="text-slate-500">Current Stock</span>
                    <span className="font-semibold text-slate-800">{selectedProduct.stock} units</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 py-3">
                    <span className="text-slate-500">Product ID</span>
                    <span className="font-mono text-sm text-slate-600">{selectedProduct.id}</span>
                  </div>
                </div>

                <button className="mt-8 flex w-full items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Details
                </button>
              </div>

              <div className="relative flex flex-1 flex-col items-center justify-center bg-slate-50 p-6 text-center">
                <div className="mb-6 flex h-48 w-48 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-4">
                  <QrCode className="mb-2 h-16 w-16 text-slate-400" />
                  <p className="text-sm text-slate-500">
                    Generate unique QR codes for inventory
                  </p>
                </div>
                <h3 className="mb-2 font-semibold text-slate-800">Inventory QR Codes</h3>
                <p className="mb-6 text-sm text-slate-500">
                  Print these to stick on physical items for fast POS scanning.
                </p>

                <div className="w-full space-y-3">
                  <button className="flex w-full items-center justify-center rounded-lg bg-teal-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-teal-700">
                    <QrCode className="mr-2 h-4 w-4" />
                    Generate {selectedProduct.stock} Codes
                  </button>
                  <button className="flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-50">
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}

function POSPage() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<'waiting' | 'success'>('waiting')

  const products = MOCK_PRODUCTS
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id)
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        )
      }
      return [...current, { product, quantity: 1 }]
    })
  }

  const updateQuantity = (productId: string, delta: number) => {
    setCart((current) =>
      current.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item,
      ),
    )
  }

  const removeFromCart = (productId: string) => {
    setCart((current) => current.filter((item) => item.product.id !== productId))
  }

  const simulateScan = () => {
    setIsScanning(true)
    window.setTimeout(() => {
      setIsScanning(false)
      const randomProduct = products[Math.floor(Math.random() * products.length)]
      addToCart(randomProduct)
    }, 800)
  }

  const simulatePaymentSuccess = () => {
    setPaymentStatus('success')
    window.setTimeout(() => {
      setPaymentModalOpen(false)
      setCart([])
    }, 1800)
  }

  return (
    <div className="flex h-auto flex-col gap-6 lg:h-[calc(100vh-8rem)] lg:flex-row">
      <div className="flex flex-1 flex-col gap-6">
        <div className="relative flex min-h-[240px] flex-col items-center justify-center overflow-hidden rounded-2xl bg-slate-900 p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.25),transparent_55%)] opacity-60" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="relative mb-4 flex h-48 w-48 items-center justify-center rounded-xl border-2 border-teal-500/50">
              {isScanning ? (
                <motion.div
                  animate={{ y: [-80, 80, -80] }}
                  transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.5, ease: 'linear' }}
                  className="h-1 w-full bg-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.8)]"
                />
              ) : (
                <ScanLine className="h-12 w-12 text-teal-500/50" />
              )}
            </div>
            <button
              onClick={simulateScan}
              disabled={isScanning}
              className="rounded-full bg-teal-600 px-6 py-2 font-medium text-white shadow-lg shadow-teal-900/50 transition-colors hover:bg-teal-500 disabled:opacity-70"
            >
              {isScanning ? 'Scanning...' : 'Simulate Scan'}
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search products manually..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-4 pl-10 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {products
                .filter((product) =>
                  product.name.toLowerCase().includes(searchTerm.toLowerCase()),
                )
                .map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="flex flex-col items-center rounded-xl border border-slate-100 p-3 text-center transition-all hover:border-teal-500 hover:bg-teal-50"
                  >
                    <div className={`mb-2 flex h-12 w-12 items-center justify-center rounded-full text-2xl ${product.imageColor}`}>
                      {product.imageEmoji}
                    </div>
                    <span className="line-clamp-1 w-full text-sm font-medium text-slate-700">
                      {product.name}
                    </span>
                    <span className="mt-1 text-xs font-bold text-teal-600">D{product.price}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col rounded-2xl border border-slate-200 bg-white shadow-sm lg:w-96">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="text-lg font-bold text-slate-800">Current Order</h2>
          <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
            {cart.reduce((sum, item) => sum + item.quantity, 0)} items
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <AnimatePresence mode="popLayout">
            {cart.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full flex-col items-center justify-center space-y-4 text-slate-400"
              >
                <ShoppingCart className="h-16 w-16 opacity-20" />
                <p>Scan items to add to cart</p>
              </motion.div>
            ) : (
              cart.map((item) => (
                <motion.div
                  key={item.product.id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <h4 className="truncate text-sm font-medium text-slate-800">{item.product.name}</h4>
                    <p className="text-sm font-semibold text-teal-600">D{item.product.price}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center rounded-lg border border-slate-200 bg-white">
                      <button
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="p-1.5 text-slate-500 hover:text-teal-600"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="p-1.5 text-slate-500 hover:text-teal-600"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="rounded-lg p-2 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        <div className="rounded-b-2xl border-t border-slate-100 bg-slate-50 p-4">
          <div className="mb-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Tax (0%)</span>
              <span>D0.00</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-bold text-slate-800">
              <span>Total</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setCart([])}
              disabled={cart.length === 0}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              Clear
            </button>
            <button
              onClick={() => {
                if (cart.length === 0) return
                setPaymentStatus('waiting')
                setPaymentModalOpen(true)
              }}
              disabled={cart.length === 0}
              className="flex flex-1 items-center justify-center rounded-xl bg-teal-600 py-3 text-lg font-bold text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
            >
              Charge {formatMoney(subtotal)}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {paymentModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => {
                if (paymentStatus === 'waiting') {
                  setPaymentModalOpen(false)
                }
              }}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              {paymentStatus === 'waiting' ? (
                <div className="flex flex-col items-center p-8 text-center">
                  <h2 className="mb-2 text-2xl font-bold text-slate-800">Scan to Pay</h2>
                  <p className="mb-6 text-slate-500">
                    Customer scans this QR with their wallet app
                  </p>
                  <div className="relative mb-6 rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-inner">
                    <QrCode className="h-48 w-48 text-slate-800" />
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-transparent to-white/20" />
                  </div>
                  <div className="mb-6 w-full rounded-xl bg-slate-50 p-4">
                    <p className="mb-1 text-sm text-slate-500">Amount Due</p>
                    <p className="text-3xl font-bold text-teal-600">{formatMoney(subtotal)}</p>
                  </div>
                  <div className="flex w-full gap-3">
                    <button
                      onClick={simulatePaymentSuccess}
                      className="flex flex-1 items-center justify-center rounded-xl bg-slate-900 py-3 font-medium text-white transition-colors hover:bg-slate-800"
                    >
                      <CreditCard className="mr-2 h-5 w-5" />
                      Simulate Wallet
                    </button>
                    <button
                      onClick={simulatePaymentSuccess}
                      className="flex flex-1 items-center justify-center rounded-xl border-2 border-slate-200 bg-white py-3 font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <Banknote className="mr-2 h-5 w-5" />
                      Cash
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center bg-emerald-50 p-10 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring' }}
                    className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
                  >
                    <CheckCircle2 className="h-10 w-10" />
                  </motion.div>
                  <h2 className="mb-2 text-2xl font-bold text-emerald-800">Payment Successful!</h2>
                  <p className="mb-8 font-medium text-emerald-600">{formatMoney(subtotal)} received</p>
                  <button
                    onClick={() => {
                      setPaymentModalOpen(false)
                      setCart([])
                    }}
                    className="w-full rounded-xl bg-emerald-600 py-3 font-bold text-white transition-colors hover:bg-emerald-700"
                  >
                    New Order
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function OrdersPage() {
  const [activeTab, setActiveTab] = useState<'All' | 'Pending' | 'Preparing' | 'Served' | 'Completed'>('All')
  const tabs = ['All', 'Pending', 'Preparing', 'Served', 'Completed'] as const
  const filteredOrders =
    activeTab === 'All'
      ? MOCK_ORDERS
      : MOCK_ORDERS.filter(
          (order) => order.status.toLowerCase() === activeTab.toLowerCase(),
        )

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search orders..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-4 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <button className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
            <Filter className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm text-slate-500">
                <th className="p-4 font-medium">Order ID</th>
                <th className="p-4 font-medium">Date & Time</th>
                <th className="p-4 font-medium">Items</th>
                <th className="p-4 font-medium">Table</th>
                <th className="p-4 font-medium">Total</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="group transition-colors hover:bg-slate-50">
                  <td className="p-4 font-mono text-sm font-medium text-slate-800">{order.id}</td>
                  <td className="p-4 text-sm text-slate-500">
                    {new Date(order.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="p-4">
                    <div className="text-sm text-slate-800">{order.items.length} items</div>
                    <div className="max-w-[200px] truncate text-xs text-slate-500">
                      {order.items.map((item) => item.productName).join(', ')}
                    </div>
                  </td>
                  <td className="p-4 text-sm font-medium text-slate-600">{order.tableId ?? '-'}</td>
                  <td className="p-4 font-semibold text-slate-800">D{order.total}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${getStatusColor(order.status)}`}>
                      {getStatusIcon(order.status)}
                      {order.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button className="text-sm font-medium text-teal-600 opacity-0 transition-opacity hover:underline group-hover:opacity-100">
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  )
}

function PaymentsPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="mb-1 text-sm font-medium text-slate-500">Total Processed</p>
          <h3 className="mb-4 text-2xl font-bold text-slate-800">D12,450.00</h3>
          <div className="h-2 w-full rounded-full bg-slate-100">
            <div className="h-2 w-[85%] rounded-full bg-teal-500" />
          </div>
          <p className="mt-2 text-xs text-slate-400">85% via QR Wallet</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="mb-1 text-sm font-medium text-slate-500">Successful</p>
          <h3 className="mb-4 text-2xl font-bold text-emerald-600">42</h3>
          <div className="flex items-center text-sm font-medium text-emerald-600">
            <ArrowUpRight className="mr-1 h-4 w-4" />
            +12% this week
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="mb-1 text-sm font-medium text-slate-500">Failed / Pending</p>
          <h3 className="mb-4 text-2xl font-bold text-amber-600">3</h3>
          <p className="text-sm text-slate-500">Requires attention</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800">Recent Transactions</h2>
          <button className="flex items-center text-sm font-medium text-slate-600 hover:text-teal-600">
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm text-slate-500">
                <th className="p-4 font-medium">Reference</th>
                <th className="p-4 font-medium">Order ID</th>
                <th className="p-4 font-medium">Method</th>
                <th className="p-4 font-medium">Amount</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_PAYMENTS.map((payment) => (
                <tr key={payment.id} className="transition-colors hover:bg-slate-50">
                  <td className="p-4 font-mono text-sm text-slate-600">{payment.reference}</td>
                  <td className="p-4 font-mono text-sm font-medium text-slate-800">{payment.orderId}</td>
                  <td className="p-4">
                    <div className="flex items-center text-sm text-slate-700">
                      {payment.method === 'qr_wallet' ? (
                        <>
                          <CreditCard className="mr-2 h-4 w-4 text-teal-500" />
                          QR Wallet
                        </>
                      ) : (
                        <>
                          <Banknote className="mr-2 h-4 w-4 text-emerald-500" />
                          Cash
                        </>
                      )}
                    </div>
                  </td>
                  <td className="p-4 font-bold text-slate-800">D{payment.amount}</td>
                  <td className="p-4">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium capitalize ${
                      payment.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : payment.status === 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                    }`}>
                      {payment.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-slate-500">
                    {new Date(payment.createdAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  )
}

function ReportsPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-800">Analytics Dashboard</h2>
        <button className="flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <Calendar className="mr-2 h-4 w-4" />
          Last 7 Days
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-lg font-semibold text-slate-800">Sales by Category</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={CATEGORY_DATA} dataKey="value" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5}>
                  {CATEGORY_DATA.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `D${value}`} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-lg font-semibold text-slate-800">Top Selling Products (Units)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={TOP_PRODUCTS} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12 }} />
                <Tooltip contentStyle={{ border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="sales" fill="#0D9488" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function CustomerMenuPage() {
  const { tableId = 'T-01' } = useParams()
  const [activeCategory, setActiveCategory] = useState('All')
  const [cart, setCart] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [orderStatus, setOrderStatus] = useState<'browsing' | 'paying' | 'success'>('browsing')

  const menuItems = MOCK_PRODUCTS.filter((product) => product.businessId === 'b2')
  const categories = ['All', ...new Set(menuItems.map((item) => item.category))]
  const filteredItems =
    activeCategory === 'All'
      ? menuItems
      : menuItems.filter((item) => item.category === activeCategory)
  const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id)
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        )
      }
      return [...current, { product, quantity: 1 }]
    })
  }

  const updateQuantity = (productId: string, delta: number) => {
    setCart((current) =>
      current
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }

  if (orderStatus === 'success') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
        >
          <CheckCircle2 className="h-12 w-12" />
        </motion.div>
        <h1 className="mb-2 text-3xl font-bold text-slate-800">Order Placed!</h1>
        <p className="mb-8 max-w-sm text-slate-600">
          Your order has been sent to the kitchen. We will bring it to {tableId} shortly.
        </p>
        <div className="mb-8 w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="mb-1 text-sm text-slate-500">Order Number</p>
          <p className="font-mono text-2xl font-bold text-slate-800">
            #ORD-{Math.floor(Math.random() * 10000)}
          </p>
        </div>
        <button
          onClick={() => {
            setOrderStatus('browsing')
            setCart([])
          }}
          className="font-medium text-teal-600 hover:underline"
        >
          Order more items
        </button>
      </div>
    )
  }

  if (orderStatus === 'paying') {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <header className="sticky top-0 z-10 flex items-center border-b border-slate-200 bg-white p-4">
          <button onClick={() => setOrderStatus('browsing')} className="-ml-2 p-2 text-slate-600">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="ml-2 text-lg font-bold text-slate-800">Checkout</h1>
        </header>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center p-6">
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="mb-2 text-xl font-bold text-slate-800">Pay via Wallet</h2>
            <p className="mb-8 text-sm text-slate-500">Scan with your mobile money app</p>
            <div className="mb-8 inline-block rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-inner">
              <QrCode className="h-48 w-48 text-slate-800" />
            </div>
            <div className="mb-6 flex items-center justify-between border-t border-slate-100 py-4">
              <span className="font-medium text-slate-600">Total to pay</span>
              <span className="text-2xl font-bold text-teal-600">{formatMoney(total)}</span>
            </div>
            <button
              onClick={() => setOrderStatus('success')}
              className="w-full rounded-xl bg-teal-600 py-4 text-lg font-bold text-white shadow-md shadow-teal-600/20 transition-colors hover:bg-teal-700"
            >
              Simulate Payment
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-10 bg-white px-4 pt-8 pb-4 shadow-sm">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Taste of Gambia</h1>
              <p className="mt-1 flex items-center font-medium text-teal-600">
                <Utensils className="mr-1 h-4 w-4" /> {tableId}
              </p>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`rounded-full px-5 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeCategory === category
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filteredItems.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
            >
              <div className={`flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-xl text-4xl ${item.imageColor}`}>
                {item.imageEmoji}
              </div>
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <h3 className="mb-1 font-bold leading-tight text-slate-800">{item.name}</h3>
                  <p className="line-clamp-2 text-xs text-slate-500">{item.description}</p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-bold text-teal-600">D{item.price}</span>
                  <button
                    onClick={() => addToCart(item)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-teal-600 transition-colors hover:bg-teal-100"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </main>

      <AnimatePresence>
        {itemCount > 0 && !isCartOpen ? (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed right-0 bottom-6 left-0 z-20 mx-auto max-w-3xl px-4"
          >
            <button
              onClick={() => setIsCartOpen(true)}
              className="flex w-full items-center justify-between rounded-2xl bg-slate-900 p-4 text-white shadow-xl"
            >
              <div className="flex items-center">
                <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-teal-500 font-bold">
                  {itemCount}
                </div>
                <span className="font-medium">View Order</span>
              </div>
              <span className="font-bold">{formatMoney(total)}</span>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isCartOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsCartOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 bottom-0 left-0 z-40 mx-auto flex max-h-[85vh] max-w-3xl flex-col rounded-t-3xl bg-white"
            >
              <div className="flex items-center justify-between border-b border-slate-100 p-4">
                <h2 className="text-xl font-bold text-slate-800">Your Order</h2>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="rounded-full bg-slate-100 p-2 text-slate-400"
                >
                  <ChevronLeft className="h-5 w-5 -rotate-90" />
                </button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-4">
                    <div className={`flex h-16 w-16 items-center justify-center rounded-xl text-2xl ${item.product.imageColor}`}>
                      {item.product.imageEmoji}
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-slate-800">{item.product.name}</h4>
                      <p className="text-sm font-semibold text-teal-600">D{item.product.price}</p>
                    </div>
                    <div className="flex items-center rounded-full bg-slate-100 p-1">
                      <button
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="flex h-8 w-8 items-center justify-center text-slate-600"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-t-3xl border-t border-slate-100 bg-slate-50 p-6 pb-8">
                <div className="mb-6 flex items-center justify-between">
                  <span className="font-medium text-slate-500">Total Amount</span>
                  <span className="text-2xl font-bold text-slate-800">{formatMoney(total)}</span>
                </div>
                <button
                  onClick={() => setOrderStatus('paying')}
                  className="w-full rounded-xl bg-teal-600 py-4 text-lg font-bold text-white shadow-lg shadow-teal-600/30 transition-transform active:scale-[0.98]"
                >
                  Place Order & Pay
                </button>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
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
      <Route path="/" element={user ? <Navigate to={user.role === 'cashier' ? '/pos' : '/dashboard'} replace /> : <LoginPage onLogin={setUser} />} />
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
