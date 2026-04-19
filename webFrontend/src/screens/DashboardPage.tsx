import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight, ClipboardList, Clock3, Package, ShoppingBag, Wallet } from 'lucide-react'

import { OrderStatusBadge } from '../components/status/OrderStatusBadge'
import { PageCard } from '../components/ui/PageCard'
import { PageSectionHeader } from '../components/ui/PageSectionHeader'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { PlatformDashboardPage } from './PlatformDashboardPage'
import { fetchDashboardSummary, type DashboardSummary } from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'
import type { Order } from '../types'
import {
  isPetrolStationIndustry,
  isRestaurantIndustry,
  isRetailOrWholesaleIndustry,
} from '../utils/businessIndustry'
import { formatMoney } from '../utils/formatMoney'

function mapDashboardOrderStatus(
  s: DashboardSummary['recentOrders'][number]['status'],
): Order['status'] {
  if (s === 'paid') return 'completed'
  if (s === 'cancelled') return 'cancelled'
  return 'pending'
}

function revenueTrendMeta(
  current: number,
  prior: number,
): { text: string; positive: boolean } {
  if (prior <= 0 && current <= 0) {
    return { text: 'No completed payments in these windows yet', positive: true }
  }
  if (prior <= 0 && current > 0) {
    return { text: 'New revenue this 7-day window', positive: true }
  }
  const pct = ((current - prior) / prior) * 100
  const rounded = pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`
  return { text: `${rounded} vs prior 7 days`, positive: pct >= 0 }
}

function MerchantDashboardPage() {
  const { currentOrganization } = useAuth()
  const orgId = currentOrganization?.id
  const industry = currentOrganization?.industry
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) {
      setSummary(null)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchDashboardSummary(orgId)
        if (!cancelled) setSummary(data)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'Could not load dashboard.')
          setSummary(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgId])

  const subtitle = useMemo(() => {
    if (isRestaurantIndustry(industry)) {
      return 'Restaurant overview'
    }
    if (isRetailOrWholesaleIndustry(industry)) {
      return 'Retail overview'
    }
    if (isPetrolStationIndustry(industry)) {
      return 'Petrol station overview'
    }
    return 'Overview built from your live sales orders and completed payments.'
  }, [industry])

  const chartData = useMemo(
    () => (summary?.revenueByDayLast7 ?? []).map((d) => ({ name: d.label, revenue: d.revenue })),
    [summary],
  )

  const statCards = useMemo(() => {
    if (!summary) return []
    const trend = revenueTrendMeta(
      summary.revenueCompletedLast7Days,
      summary.revenueCompletedPrior7Days,
    )
    const cards: Array<{
      title: string
      value: string
      icon: typeof Wallet
      color: string
      bg: string
      footnote: string
      /** When true, show green/red trend styling; when false, neutral caption */
      footIsTrend: boolean
      footPositive: boolean
    }> = [
      {
        title: 'Revenue (7 days)',
        value: formatMoney(summary.revenueCompletedLast7Days, { decimals: 0 }),
        icon: Wallet,
        color: 'text-teal-600',
        bg: 'bg-teal-100',
        footnote: trend.text,
        footIsTrend: true,
        footPositive: trend.positive,
      },
      {
        title: 'Orders today',
        value: String(summary.ordersCreatedToday),
        icon: ShoppingBag,
        color: 'text-blue-600',
        bg: 'bg-blue-100',
        footnote: 'Created since midnight UTC',
        footIsTrend: false,
        footPositive: true,
      },
      {
        title: 'Awaiting payment',
        value: String(summary.openOrdersCount),
        icon: ClipboardList,
        color: 'text-amber-600',
        bg: 'bg-amber-100',
        footnote: 'Orders not yet paid',
        footIsTrend: false,
        footPositive: true,
      },
    ]
    if (summary.catalogEnabled && summary.productCount != null && summary.lowStockCount != null) {
      cards.push(
        {
          title: 'Products',
          value: String(summary.productCount),
          icon: Package,
          color: 'text-indigo-600',
          bg: 'bg-indigo-100',
          footnote: 'SKUs in catalog',
          footIsTrend: false,
          footPositive: true,
        },
        {
          title: 'Low stock',
          value: String(summary.lowStockCount),
          icon: Clock3,
          color: 'text-rose-600',
          bg: 'bg-rose-100',
          footnote: 'Sellable under 20 units',
          footIsTrend: true,
          footPositive: summary.lowStockCount === 0,
        },
      )
    }
    return cards
  }, [summary])

  const showRestaurantHints = isRestaurantIndustry(industry)

  return (
    <PageTransition className="space-y-6" withSlide>
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      {error ? (
        <PageCard className="border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</PageCard>
      ) : null}

      {!orgId ? (
        <PageCard className="p-6 text-sm text-slate-600">
          Select an organization to load your dashboard.
        </PageCard>
      ) : loading && !summary ? (
        <PageCard className="p-10 text-center text-slate-500">Loading dashboard…</PageCard>
      ) : null}

      {orgId && summary ? (
        <>
          <div
            className={`grid grid-cols-1 gap-6 sm:grid-cols-2 ${
              statCards.length >= 5 ? 'xl:grid-cols-5' : 'lg:grid-cols-3'
            }`}
          >
            {statCards.map((stat) => (
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
                  {stat.footIsTrend ? (
                    <>
                      {stat.footPositive ? (
                        <ArrowUpRight className="mr-1 h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <ArrowDownRight className="mr-1 h-4 w-4 shrink-0 text-amber-500" />
                      )}
                      <span
                        className={
                          stat.footPositive
                            ? 'font-medium text-emerald-600'
                            : 'font-medium text-amber-600'
                        }
                      >
                        {stat.footnote}
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-500">{stat.footnote}</span>
                  )}
                </div>
              </PageCard>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <PageCard className="p-6 xl:col-span-2">
              <PageSectionHeader
                title="Revenue (completed payments)"
                className="mb-2"
              />
              <p className="mb-6 text-xs text-slate-500">Last 7 days, UTC · from wallet and cash settlements</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="revenueFillLive" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0D9488" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
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
                      tickFormatter={(value) =>
                        `D${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                      }
                    />
                    <Tooltip
                      formatter={(value) => [
                        formatMoney(Number(value ?? 0), { decimals: 0 }),
                        'Revenue',
                      ]}
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
                      fill="url(#revenueFillLive)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </PageCard>

            <PageCard className="p-6">
              <PageSectionHeader
                title="Recent orders"
                className="mb-6"
                action={
                  <Link
                    to={APP_PATHS.orders}
                    className="text-sm font-medium text-teal-600 hover:text-teal-700"
                  >
                    View all
                  </Link>
                }
              />
              <div className="space-y-4">
                {summary.recentOrders.length === 0 ? (
                  <p className="text-sm text-slate-500">No orders yet. Use POS to create the first one.</p>
                ) : (
                  summary.recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-medium text-slate-800">{order.publicCode}</p>
                        <p className="text-xs text-slate-500">
                          {order.lineCount} line{order.lineCount === 1 ? '' : 's'}
                          {showRestaurantHints && order.tableLabel ? ` · ${order.tableLabel}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold text-slate-800">
                          {formatMoney(order.total, { decimals: 0 })}
                        </p>
                        <div className="mt-1">
                          <OrderStatusBadge
                            status={mapDashboardOrderStatus(order.status)}
                            showIcon={false}
                            bordered={false}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PageCard>
          </div>
        </>
      ) : null}
    </PageTransition>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  if (user?.isPlatformOwner || user?.isPlatformAdmin) {
    return <PlatformDashboardPage />
  }
  return <MerchantDashboardPage />
}
