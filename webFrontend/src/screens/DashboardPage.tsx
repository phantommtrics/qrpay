import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  Package,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react'

import { OrderStatusBadge } from '../components/status/OrderStatusBadge'
import { PageCard } from '../components/ui/PageCard'
import { PageSectionHeader } from '../components/ui/PageSectionHeader'
import { PageTransition } from '../components/ui/PageTransition'
import { MOCK_ORDERS, MOCK_PAYMENTS, MOCK_PRODUCTS, REVENUE_DATA } from '../data/mockData'
import { useAuth } from '../features/auth/AuthContext'
import { formatMoney } from '../utils/formatMoney'

export function DashboardPage() {
  const { user } = useAuth()
  const businessId = user?.businessId
  const orders = businessId
    ? MOCK_ORDERS.filter((order) => order.businessId === businessId)
    : MOCK_ORDERS
  const products = businessId
    ? MOCK_PRODUCTS.filter((product) => product.businessId === businessId)
    : MOCK_PRODUCTS
  const payments = businessId
    ? MOCK_PAYMENTS.filter((payment) => payment.businessId === businessId)
    : MOCK_PAYMENTS
  const totalRevenue = payments
    .filter((payment) => payment.status === 'completed')
    .reduce((sum, payment) => sum + payment.amount, 0)
  const lowStockCount = products.filter((product) => product.stock < 20).length
  const stats = [
    {
      title: 'Total Revenue',
      value: `D${totalRevenue.toLocaleString()}`,
      icon: TrendingUp,
      color: 'text-teal-600',
      bg: 'bg-teal-100',
      trend: '+12.5%',
      positive: true,
    },
    {
      title: 'Orders Today',
      value: orders.length,
      icon: ShoppingBag,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
      trend: '+5.2%',
      positive: true,
    },
    {
      title: 'Total Products',
      value: products.length,
      icon: Package,
      color: 'text-indigo-600',
      bg: 'bg-indigo-100',
      trend: '0%',
      positive: true,
    },
    {
      title: 'Low Stock Alerts',
      value: lowStockCount,
      icon: Clock3,
      color: 'text-amber-600',
      bg: 'bg-amber-100',
      trend: '-2',
      positive: false,
    },
  ]

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <PageCard key={stat.title} className="p-6">
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
              <span
                className={
                  stat.positive
                    ? 'font-medium text-emerald-600'
                    : 'font-medium text-amber-600'
                }
              >
                {stat.trend}
              </span>
              <span className="ml-2 text-slate-400">vs last week</span>
            </div>
          </PageCard>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <PageCard className="p-6 xl:col-span-2">
          <PageSectionHeader title="Revenue Overview" className="mb-6" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={REVENUE_DATA}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0D9488" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="#E2E8F0"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748B', fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  tickFormatter={(value) => `D${value}`}
                />
                <Tooltip
                  formatter={(value) => [`D${value ?? 0}`, 'Revenue']}
                  contentStyle={{
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0D9488"
                  strokeWidth={3}
                  fill="url(#revenueFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </PageCard>

        <PageCard className="p-6">
          <PageSectionHeader
            title="Recent Orders"
            className="mb-6"
            action={
              <button className="text-sm font-medium text-teal-600 hover:text-teal-700">
                View All
              </button>
            }
          />
          <div className="space-y-4">
            {orders.slice(0, 5).map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-slate-50"
              >
                <div>
                  <p className="font-mono text-sm font-medium text-slate-800">
                    {order.id}
                  </p>
                  <p className="text-xs text-slate-500">{order.items.length} items</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-800">
                    {formatMoney(order.total, { decimals: 0 })}
                  </p>
                  <div className="mt-1">
                    <OrderStatusBadge
                      status={order.status}
                      showIcon={false}
                      bordered={false}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PageCard>
      </div>
    </PageTransition>
  )
}
