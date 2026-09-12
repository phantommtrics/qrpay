import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BookOpenText,
  CheckSquare,
  ClipboardList,
  Clock3,
  Package,
  Receipt,
  ShoppingBag,
  Wallet,
} from 'lucide-react'

import { DocumentBucketWidget } from '../components/dashboard/DocumentBucketWidget'
import { DashboardMetricLink, DashboardStatTile } from '../components/dashboard/DashboardStatTile'
import { DashboardWidget, DashboardWidgetLink } from '../components/dashboard/DashboardWidget'
import { OrderStatusBadge } from '../components/status/OrderStatusBadge'
import { PageCard } from '../components/ui/PageCard'
import { PageSectionHeader } from '../components/ui/PageSectionHeader'
import { PageTransition } from '../components/ui/PageTransition'
import {
  APP_PATHS,
  salesBillDetailPath,
  salesInvoiceDetailPath,
  transactionJournalDetailPath,
} from '../config/navigation'
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

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}

function MerchantDashboardPage() {
  const { canAccess, currentOrganization } = useAuth()
  const orgId = currentOrganization?.id
  const industry = currentOrganization?.industry
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canAccounting = canAccess('accounting.view')
  const canInvoices = canAccess('sales.invoice')
  const canBills = canAccess('sales.bill')
  const canOrders = canAccess('orders.view')
  const canTransactionJournal = canAccess('accounting.transaction_journal')
  const canPnl = canAccess('accounting.reports.pnl') || canAccess('accounting.view')
  const showFinance = canAccounting || canInvoices || canBills

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
    if (showFinance) {
      return 'Cash, profitability, invoices, bills, and sales at a glance.'
    }
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
  }, [industry, showFinance])

  const chartData = useMemo(
    () => (summary?.revenueByDayLast7 ?? []).map((d) => ({ name: d.label, revenue: d.revenue })),
    [summary],
  )

  const cashFlowData = useMemo(
    () =>
      (summary?.finance.cashFlowTrend ?? []).map((p) => ({
        name: p.period,
        income: p.income,
        expenses: p.expenses,
        net: p.income - p.expenses,
      })),
    [summary],
  )

  const finance = summary?.finance

  const showRestaurantHints = isRestaurantIndustry(industry)

  const salesTiles = useMemo(() => {
    if (!summary) return []
    const trend = revenueTrendMeta(
      summary.revenueCompletedLast7Days,
      summary.revenueCompletedPrior7Days,
    )
    const tiles: Array<{
      key: string
      title: string
      value: string
      icon: typeof Wallet
      iconColor: string
      iconBg: string
      footnote: string
      footIsTrend?: boolean
      footPositive?: boolean
    }> = [
      {
        key: 'rev',
        title: 'Revenue (7 days)',
        value: formatMoney(summary.revenueCompletedLast7Days, { decimals: 0 }),
        icon: Wallet,
        iconColor: 'text-teal-600',
        iconBg: 'bg-teal-100',
        footnote: trend.text,
        footIsTrend: true,
        footPositive: trend.positive,
      },
      {
        key: 'orders',
        title: 'Orders today',
        value: String(summary.ordersCreatedToday),
        icon: ShoppingBag,
        iconColor: 'text-blue-600',
        iconBg: 'bg-blue-100',
        footnote: 'Created since midnight UTC',
      },
      {
        key: 'await',
        title: 'Awaiting payment',
        value: String(summary.openOrdersCount),
        icon: ClipboardList,
        iconColor: 'text-amber-600',
        iconBg: 'bg-amber-100',
        footnote: 'Orders not yet paid',
      },
    ]
    if (
      summary.catalogEnabled &&
      summary.productCount != null &&
      summary.lowStockCount != null
    ) {
      tiles.push(
        {
          key: 'products',
          title: 'Products',
          value: String(summary.productCount),
          icon: Package,
          iconColor: 'text-indigo-600',
          iconBg: 'bg-indigo-100',
          footnote: 'SKUs in catalog',
        },
        {
          key: 'low',
          title: 'Low stock',
          value: String(summary.lowStockCount),
          icon: Clock3,
          iconColor: 'text-rose-600',
          iconBg: 'bg-rose-100',
          footnote: 'Sellable under 20 units',
          footIsTrend: true,
          footPositive: summary.lowStockCount === 0,
        },
      )
    }
    return tiles
  }, [summary])

  return (
    <PageTransition className="space-y-6" withSlide>
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Business overview</h1>
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
          {/* Sales strip */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sales</h2>
            <div
              className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
                salesTiles.length >= 5 ? 'xl:grid-cols-5' : 'lg:grid-cols-3'
              }`}
            >
              {salesTiles.map((tile) => (
                <DashboardStatTile
                  key={tile.key}
                  title={tile.title}
                  value={tile.value}
                  icon={tile.icon}
                  iconColor={tile.iconColor}
                  iconBg={tile.iconBg}
                  footnote={tile.footnote}
                  footIsTrend={tile.footIsTrend}
                  footPositive={tile.footPositive}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <PageCard className="p-6 xl:col-span-2">
                <PageSectionHeader title="Revenue (completed payments)" className="mb-2" />
                <p className="mb-6 text-xs text-slate-500">
                  Last 7 days, UTC · from wallet and cash settlements
                </p>
                <div className="h-64">
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

              {canOrders ? (
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
                      <p className="text-sm text-slate-500">
                        No orders yet. Use POS to create the first one.
                      </p>
                    ) : (
                      summary.recentOrders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-slate-50"
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-medium text-slate-800">
                              {order.publicCode}
                            </p>
                            <p className="text-xs text-slate-500">
                              {order.lineCount} line{order.lineCount === 1 ? '' : 's'}
                              {showRestaurantHints && order.tableLabel
                                ? ` · ${order.tableLabel}`
                                : ''}
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
              ) : null}
            </div>
          </section>

          {showFinance && finance ? (
            <>
              {/* Cash + P&L */}
              {canAccounting ? (
                <section className="space-y-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Cash &amp; profit
                  </h2>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <DashboardMetricLink
                      to={APP_PATHS.accountingBalances}
                      label="Cash & clearing"
                      value={formatMoney(finance.cashTotal, { decimals: 0 })}
                      hint={`${finance.cashPositions.length} position${
                        finance.cashPositions.length === 1 ? '' : 's'
                      }`}
                    />
                    <DashboardMetricLink
                      to={
                        canPnl
                          ? APP_PATHS.accountingProfitLoss
                          : APP_PATHS.accounting
                      }
                      label="Net profit"
                      value={formatMoney(finance.pnl.netProfit, { decimals: 0 })}
                      hint={`${formatMoney(finance.pnl.grossProfit, { decimals: 0 })} gross`}
                    />
                    <DashboardMetricLink
                      to={
                        canPnl
                          ? APP_PATHS.accountingProfitLoss
                          : APP_PATHS.accounting
                      }
                      label="Income"
                      value={formatMoney(finance.pnl.income, { decimals: 0 })}
                      hint="Ledger revenue balances"
                    />
                    <DashboardMetricLink
                      to={canBills ? APP_PATHS.salesBills : APP_PATHS.accounting}
                      label="Expenses"
                      value={formatMoney(finance.expenses.operatingExpenses, { decimals: 0 })}
                      hint={`${formatMoney(finance.expenses.billsToPayTotal, {
                        decimals: 0,
                      })} in unpaid bills`}
                    />
                  </div>

                  {finance.cashPositions.length > 0 ? (
                    <DashboardWidget
                      title="Cash positions"
                      action={
                        <DashboardWidgetLink to={APP_PATHS.accountingBalances}>
                          View balances
                        </DashboardWidgetLink>
                      }
                    >
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {finance.cashPositions.map((pos) => (
                          <div
                            key={pos.id}
                            className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800">
                                {pos.name}
                              </p>
                              <p className="font-mono text-xs text-slate-500">{pos.code}</p>
                            </div>
                            <p className="shrink-0 tabular-nums text-sm font-semibold text-slate-800">
                              {formatMoney(pos.balance, { decimals: 0 })}
                            </p>
                          </div>
                        ))}
                      </div>
                    </DashboardWidget>
                  ) : null}

                  <DashboardWidget
                    title="Cash in & out"
                    subtitle="Six-month income vs expenses from posted journals"
                    action={
                      <DashboardWidgetLink to={APP_PATHS.accounting}>
                        Accounting
                      </DashboardWidgetLink>
                    }
                  >
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={cashFlowData}>
                          <defs>
                            <linearGradient id="dashIncomeFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0D9488" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="dashExpenseFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#F43F5E" stopOpacity={0} />
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
                              `D${Number(value).toLocaleString(undefined, {
                                maximumFractionDigits: 0,
                              })}`
                            }
                          />
                          <Tooltip
                            formatter={(value, name) => [
                              formatMoney(Number(value ?? 0), { decimals: 0 }),
                              name === 'income'
                                ? 'Income'
                                : name === 'expenses'
                                  ? 'Expenses'
                                  : 'Net',
                            ]}
                            contentStyle={{
                              border: 'none',
                              borderRadius: '12px',
                              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            }}
                          />
                          <Legend />
                          <Area
                            type="monotone"
                            dataKey="income"
                            name="income"
                            stroke="#0D9488"
                            strokeWidth={2}
                            fill="url(#dashIncomeFill)"
                          />
                          <Area
                            type="monotone"
                            dataKey="expenses"
                            name="expenses"
                            stroke="#F43F5E"
                            strokeWidth={2}
                            fill="url(#dashExpenseFill)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </DashboardWidget>
                </section>
              ) : null}

              {/* Invoices + Bills */}
              {canInvoices || canBills ? (
                <section className="space-y-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Invoices &amp; bills
                  </h2>
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {canInvoices ? (
                      <DocumentBucketWidget
                        title="Invoices owed to you"
                        bucket={{
                          ...finance.receivables,
                          samples: finance.receivables.samples.map((s) => ({
                            ...s,
                            partyName: s.contactName,
                          })),
                        }}
                        listPath={APP_PATHS.salesInvoices}
                        newPath={APP_PATHS.salesInvoices}
                        detailPath={salesInvoiceDetailPath}
                        canCreate
                        emptyLabel="No approved invoices awaiting payment."
                      />
                    ) : null}
                    {canBills ? (
                      <DocumentBucketWidget
                        title="Bills to pay"
                        bucket={{
                          ...finance.payables,
                          samples: finance.payables.samples.map((s) => ({
                            ...s,
                            partyName: s.contactName,
                          })),
                        }}
                        listPath={APP_PATHS.salesBills}
                        newPath={APP_PATHS.salesBills}
                        detailPath={salesBillDetailPath}
                        canCreate
                        emptyLabel="No approved bills awaiting payment."
                      />
                    ) : null}
                  </div>

                  {canInvoices && finance.recentPaidInvoices.length > 0 ? (
                    <DashboardWidget
                      title="Recent invoice payments"
                      action={
                        <DashboardWidgetLink to={APP_PATHS.salesInvoices}>
                          View invoices
                        </DashboardWidgetLink>
                      }
                    >
                      <div className="divide-y divide-slate-100">
                        {finance.recentPaidInvoices.map((inv) => (
                          <Link
                            key={inv.id}
                            to={salesInvoiceDetailPath(inv.id)}
                            className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-slate-50"
                          >
                            <div className="min-w-0">
                              <p className="font-mono text-sm font-medium text-slate-800">
                                {inv.publicCode}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {inv.contactName} · paid {formatShortDate(inv.paidAt)}
                              </p>
                            </div>
                            <p className="shrink-0 font-semibold tabular-nums text-emerald-700">
                              {formatMoney(inv.amount, { decimals: 0 })}
                            </p>
                          </Link>
                        ))}
                      </div>
                    </DashboardWidget>
                  ) : null}
                </section>
              ) : null}

              {/* Tasks + Journals */}
              <section className="space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Activity
                </h2>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <DashboardWidget
                    title="Tasks"
                    subtitle="Items that need attention"
                  >
                    {finance.tasks.length === 0 ? (
                      <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
                        <CheckSquare className="mt-0.5 h-5 w-5 shrink-0" />
                        <p>You&apos;re caught up — no overdue documents or drafts flagged.</p>
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {finance.tasks.map((task) => {
                          const allowed =
                            (task.href.startsWith('/sales/invoices') && canInvoices) ||
                            (task.href.startsWith('/sales/bills') && canBills) ||
                            (task.href.startsWith('/orders') && canOrders) ||
                            canAccounting
                          if (!allowed) return null
                          return (
                            <li key={task.id}>
                              <Link
                                to={task.href}
                                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3 transition-colors hover:border-slate-200 hover:bg-slate-50"
                              >
                                <span className="text-sm font-medium text-slate-800">
                                  {task.label}
                                </span>
                                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-800">
                                  {task.count}
                                </span>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </DashboardWidget>

                  {canAccounting ? (
                    <DashboardWidget
                      title="Recent journals"
                      subtitle={`${finance.journals.postedLast7Days} posted in last 7 days · ${finance.journals.postedLast30Days} in 30 days`}
                      action={
                        <DashboardWidgetLink
                          to={
                            canTransactionJournal
                              ? APP_PATHS.accountingTransactionJournal
                              : APP_PATHS.accountingJournals
                          }
                        >
                          View journals
                        </DashboardWidgetLink>
                      }
                    >
                      {finance.journals.recent.length === 0 ? (
                        <p className="text-sm text-slate-500">No journal entries yet.</p>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {finance.journals.recent.map((j) => {
                            const to = canTransactionJournal
                              ? transactionJournalDetailPath(j.id)
                              : APP_PATHS.accountingJournals
                            return (
                              <Link
                                key={j.id}
                                to={to}
                                className="flex items-start justify-between gap-3 py-3 transition-colors hover:bg-slate-50"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-800">
                                    {j.memo?.trim() || j.reference?.trim() || 'Journal entry'}
                                  </p>
                                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                                    <BookOpenText className="h-3.5 w-3.5" />
                                    {j.sourceType?.replace(/_/g, ' ') || 'Manual'}
                                    {' · '}
                                    {formatShortDate(j.postedAt)}
                                  </p>
                                </div>
                                <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </DashboardWidget>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}
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
