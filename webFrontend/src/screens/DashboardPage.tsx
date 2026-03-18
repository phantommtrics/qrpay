import { motion } from 'framer-motion'
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

import { MOCK_ORDERS, MOCK_STATS, REVENUE_DATA } from '../data/mockData'

export function DashboardPage() {
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
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
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm xl:col-span-2">
          <h3 className="mb-6 text-lg font-semibold text-slate-800">
            Revenue Overview
          </h3>
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
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Recent Orders</h3>
            <button className="text-sm font-medium text-teal-600 hover:text-teal-700">
              View All
            </button>
          </div>
          <div className="space-y-4">
            {MOCK_ORDERS.slice(0, 5).map((order) => (
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
                  <p className="font-semibold text-slate-800">D{order.total}</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-1 text-xs font-medium capitalize ${
                      order.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : order.status === 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                    }`}
                  >
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
