import { useCallback, useEffect, useMemo, useState } from 'react'
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
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  Building2,
  CheckSquare,
  ClipboardList,
  CreditCard,
  FileText,
  Landmark,
  Loader2,
  Receipt,
  RefreshCw,
  Settings2,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { generatePath, Link } from 'react-router-dom'

import { DocumentBucketWidget } from '../components/dashboard/DocumentBucketWidget'
import { DashboardMetricLink, DashboardStatTile } from '../components/dashboard/DashboardStatTile'
import { DashboardWidget, DashboardWidgetLink } from '../components/dashboard/DashboardWidget'
import { PageCard } from '../components/ui/PageCard'
import { PageSectionHeader } from '../components/ui/PageSectionHeader'
import { PageTransition } from '../components/ui/PageTransition'
import {
  APP_PATHS,
  platformBillDetailPath,
  platformInvoiceDetailPath,
  platformMerchantJournalDetailPath,
} from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformDashboardSummary,
  type PlatformDashboardSummary,
} from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

type Shortcut = {
  to: string
  title: string
  description: string
  icon: typeof Building2
  ok: boolean
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}

export function PlatformDashboardPage() {
  const { user, canAccess } = useAuth()
  const [summary, setSummary] = useState<PlatformDashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canAccounting = canAccess('platform.accounting.view')
  const canPnl = canAccess('platform.accounting.reports.pnl')
  const canInvoices = canAccess('platform.invoices.view')
  const canBills = canAccess('platform.bills.view')
  const canBillingReview = canAccess('platform.billing_review.view')
  const canSubscriptions = canAccess('platform.subscriptions.view')
  const canDigitalOcean = canAccess('platform.digitalocean_billing.view')
  const canMerchantJournals = canAccess('platform.accounting.transaction_journal')
  const showFinance = canAccounting || canInvoices || canBills || canPnl

  const roleLabel = user?.isPlatformOwner ? 'DirectPay' : 'DirectPay admin'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPlatformDashboardSummary()
      setSummary(data)
    } catch (e) {
      setSummary(null)
      setError(e instanceof ApiError ? e.message : 'Could not load platform overview.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const shortcuts: Shortcut[] = useMemo(
    () => [
      {
        to: APP_PATHS.platformBusinesses,
        title: 'Businesses',
        description: 'Directory, owners, and subscriptions',
        icon: Building2,
        ok: canAccess('platform.businesses.manage'),
      },
      {
        to: APP_PATHS.platformSubscriptions,
        title: 'Subscriptions',
        description: 'Status and billing periods',
        icon: CreditCard,
        ok: canAccess('platform.subscriptions.view'),
      },
      {
        to: APP_PATHS.platformInvoices,
        title: 'Invoices',
        description: 'Subscription invoices and payments',
        icon: Receipt,
        ok: canAccess('platform.invoices.view'),
      },
      {
        to: APP_PATHS.platformBillingReview,
        title: 'Billing review',
        description: 'Refunds and manual review',
        icon: ClipboardList,
        ok: canAccess('platform.billing_review.view'),
      },
      {
        to: APP_PATHS.platformBillings,
        title: 'Plan pricing',
        description: 'Plans and catalog pricing',
        icon: Wallet,
        ok: canAccess('platform.billing.manage'),
      },
      {
        to: APP_PATHS.platformAccounting,
        title: 'Platform accounting',
        description: 'Chart, journals, GL reports',
        icon: Landmark,
        ok: canAccess('platform.accounting.view'),
      },
      {
        to: APP_PATHS.activityLog,
        title: 'Tenant activity',
        description: 'Cross-business audit log',
        icon: FileText,
        ok: canAccess('activity.log') || canAccess('platform.activity.log'),
      },
      {
        to: APP_PATHS.platformActivityLog,
        title: 'Platform activity',
        description: 'Operator actions (GL, bills)',
        icon: Sparkles,
        ok: canAccess('platform.activity.log'),
      },
      {
        to: APP_PATHS.platformSystemConfiguration,
        title: 'System configuration',
        description: 'Services, products, plans',
        icon: Settings2,
        ok: canAccess('platform.system.view'),
      },
    ],
    [canAccess],
  )

  const visibleShortcuts = shortcuts.filter((s) => s.ok)

  const recentBusinessRows = useMemo(() => {
    const rows = summary?.recentBusinesses ?? []
    return [...rows]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6)
  }, [summary?.recentBusinesses])

  const finance = summary?.finance

  const cashFlowData = useMemo(
    () =>
      (finance?.cashFlowTrend ?? []).map((p) => ({
        name: p.period,
        income: p.income,
        expenses: p.expenses,
      })),
    [finance],
  )

  const opsTiles = useMemo(() => {
    if (!summary) return []
    return [
      {
        key: 'biz',
        title: 'Businesses',
        value: String(summary.businessesTotal),
        icon: Building2,
        iconColor: 'text-indigo-600',
        iconBg: 'bg-indigo-100',
        footnote: `+${summary.businessesCreatedLast7Days} new in the last 7 days`,
      },
      {
        key: 'active',
        title: 'Active subscriptions',
        value: String(summary.subscriptionsActive),
        icon: CreditCard,
        iconColor: 'text-emerald-600',
        iconBg: 'bg-emerald-100',
        footnote: `${summary.subscriptionsTrialing} in trial`,
      },
      {
        key: 'pastdue',
        title: 'Past due subscriptions',
        value: String(summary.subscriptionsPastDue),
        icon: AlertTriangle,
        iconColor:
          summary.subscriptionsPastDue > 0 ? 'text-amber-700' : 'text-slate-500',
        iconBg: summary.subscriptionsPastDue > 0 ? 'bg-amber-100' : 'bg-slate-100',
        footnote: 'Needs payment or attention',
        footIsTrend: summary.subscriptionsPastDue > 0,
        footPositive: false,
      },
      {
        key: 'pending',
        title: 'Pending invoices',
        value: String(summary.invoicesPendingPayment),
        icon: Receipt,
        iconColor: summary.invoicesPendingPayment > 0 ? 'text-rose-600' : 'text-slate-500',
        iconBg: summary.invoicesPendingPayment > 0 ? 'bg-rose-100' : 'bg-slate-100',
        footnote: 'Subscription invoices not yet paid',
      },
      {
        key: 'refunds',
        title: 'Refund reviews',
        value: String(summary.refundReviewsPending),
        icon: ClipboardList,
        iconColor: summary.refundReviewsPending > 0 ? 'text-violet-700' : 'text-slate-500',
        iconBg: summary.refundReviewsPending > 0 ? 'bg-violet-100' : 'bg-slate-100',
        footnote: 'Awaiting finance decision',
      },
    ]
  }, [summary])

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Platform overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            {roleLabel} · Cash, profitability, subscriptions, bills, and operator tasks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <PageCard className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <span className="font-medium">Overview unavailable.</span> {error} You can still use the
          shortcuts below if your role allows.
        </PageCard>
      ) : null}

      {loading && !summary ? (
        <PageCard className="flex items-center justify-center gap-3 p-12 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading platform metrics…
        </PageCard>
      ) : null}

      {summary ? (
        <>
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Operations
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {opsTiles.map((tile) => (
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

            <PageCard className="p-6">
              <PageSectionHeader
                title="Recently onboarded businesses"
                subtitle="Latest 6 by sign-up date (newest first)."
                className="mb-4"
                action={
                  canAccess('platform.businesses.manage') ? (
                    <Link
                      to={APP_PATHS.platformBusinesses}
                      className="text-sm font-medium text-teal-600 hover:text-teal-700"
                    >
                      View all
                    </Link>
                  ) : null
                }
              />
              {recentBusinessRows.length === 0 ? (
                <p className="text-sm text-slate-500">No businesses yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="pb-2 font-medium">Business</th>
                        <th className="pb-2 font-medium">Owner email</th>
                        <th className="pb-2 font-medium">Industry</th>
                        <th className="pb-2 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recentBusinessRows.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50/80">
                          <td className="py-2.5 pr-3 font-medium text-slate-800">
                            {canAccess('platform.businesses.manage') ? (
                              <Link
                                to={generatePath(APP_PATHS.platformBusinessDetail, {
                                  businessId: b.id,
                                })}
                                className="text-teal-700 hover:underline"
                              >
                                {b.name}
                              </Link>
                            ) : (
                              b.name
                            )}
                          </td>
                          <td className="py-2.5 text-slate-600">{b.ownerEmail}</td>
                          <td className="py-2.5 text-slate-500">{b.industry ?? '—'}</td>
                          <td className="py-2.5 tabular-nums text-slate-500">
                            {new Date(b.createdAt).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PageCard>
          </section>

          {showFinance && finance ? (
            <>
              {canAccounting || canPnl ? (
                <section className="space-y-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Cash &amp; profit
                  </h2>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {canAccounting ? (
                      <DashboardMetricLink
                        to={APP_PATHS.platformAccounting}
                        label="Cash & clearing"
                        value={formatMoney(finance.cashTotal, { decimals: 0 })}
                        hint={`${finance.cashPositions.length} position${
                          finance.cashPositions.length === 1 ? '' : 's'
                        }`}
                      />
                    ) : null}
                    {canPnl || canAccounting ? (
                      <DashboardMetricLink
                        to={
                          canPnl
                            ? APP_PATHS.platformAccountingReportPnl
                            : APP_PATHS.platformAccounting
                        }
                        label="Net profit (MTD)"
                        value={formatMoney(finance.netProfitMtd, { decimals: 0 })}
                        hint={`${formatMoney(finance.pnl.netProfit, {
                          decimals: 0,
                        })} all-time net`}
                      />
                    ) : null}
                    {canAccounting ? (
                      <DashboardMetricLink
                        to={
                          canPnl
                            ? APP_PATHS.platformAccountingReportPnl
                            : APP_PATHS.platformAccounting
                        }
                        label="Income"
                        value={formatMoney(finance.pnl.income, { decimals: 0 })}
                        hint="Ledger revenue balances"
                      />
                    ) : null}
                    {canAccounting ? (
                      <DashboardMetricLink
                        to={canBills ? APP_PATHS.platformBills : APP_PATHS.platformAccounting}
                        label="Expenses"
                        value={formatMoney(finance.expenses.operatingExpenses, { decimals: 0 })}
                        hint={`${formatMoney(finance.expenses.billsToPayTotal, {
                          decimals: 0,
                        })} in unpaid bills`}
                      />
                    ) : null}
                  </div>

                  {canAccounting && finance.cashPositions.length > 0 ? (
                    <DashboardWidget
                      title="Cash positions"
                      action={
                        <DashboardWidgetLink to={APP_PATHS.platformAccounting}>
                          Accounting
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

                  {canAccounting ? (
                    <DashboardWidget
                      title="Cash in & out"
                      subtitle="Six-month income vs expenses from platform journals"
                      action={
                        canPnl ? (
                          <DashboardWidgetLink to={APP_PATHS.platformAccountingReportPnl}>
                            Open P&amp;L
                          </DashboardWidgetLink>
                        ) : (
                          <DashboardWidgetLink to={APP_PATHS.platformAccounting}>
                            Accounting
                          </DashboardWidgetLink>
                        )
                      }
                    >
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={cashFlowData}>
                            <defs>
                              <linearGradient id="platIncomeFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0D9488" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="platExpenseFill" x1="0" y1="0" x2="0" y2="1">
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
                                name === 'income' ? 'Income' : 'Expenses',
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
                              fill="url(#platIncomeFill)"
                            />
                            <Area
                              type="monotone"
                              dataKey="expenses"
                              name="expenses"
                              stroke="#F43F5E"
                              strokeWidth={2}
                              fill="url(#platExpenseFill)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </DashboardWidget>
                  ) : null}
                </section>
              ) : null}

              {canInvoices || canBills ? (
                <section className="space-y-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Invoices &amp; bills
                  </h2>
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {canInvoices ? (
                      <DocumentBucketWidget
                        title="Subscription invoices owed to you"
                        bucket={finance.receivables}
                        listPath={APP_PATHS.platformInvoices}
                        newPath={APP_PATHS.platformInvoices}
                        detailPath={platformInvoiceDetailPath}
                        canCreate={false}
                        emptyLabel="No pending subscription invoices."
                      />
                    ) : null}
                    {canBills ? (
                      <DocumentBucketWidget
                        title="Bills to pay"
                        bucket={finance.payables}
                        listPath={APP_PATHS.platformBills}
                        newPath={APP_PATHS.platformBillNew}
                        detailPath={platformBillDetailPath}
                        canCreate={canAccess('platform.bills.manage')}
                        emptyLabel="No approved supplier bills awaiting payment."
                      />
                    ) : null}
                  </div>

                  {canInvoices && finance.recentPaidInvoices.length > 0 ? (
                    <DashboardWidget
                      title="Recent subscription payments"
                      action={
                        <DashboardWidgetLink to={APP_PATHS.platformInvoices}>
                          View invoices
                        </DashboardWidgetLink>
                      }
                    >
                      <div className="divide-y divide-slate-100">
                        {finance.recentPaidInvoices.map((inv) => (
                          <Link
                            key={inv.id}
                            to={platformInvoiceDetailPath(inv.id)}
                            className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-slate-50"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800">
                                {inv.partyName}
                              </p>
                              <p className="text-xs text-slate-500">
                                {inv.publicCode} · paid {formatShortDate(inv.paidAt)}
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

              <section className="space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Activity
                </h2>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <DashboardWidget title="Tasks" subtitle="Items that need operator attention">
                    {finance.tasks.length === 0 ? (
                      <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
                        <CheckSquare className="mt-0.5 h-5 w-5 shrink-0" />
                        <p>You&apos;re caught up — no flagged subscriptions, bills, or reviews.</p>
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {finance.tasks.map((task) => {
                          const allowed =
                            (task.href.startsWith('/platform/subscriptions') &&
                              canSubscriptions) ||
                            (task.href.startsWith('/platform/invoices') && canInvoices) ||
                            (task.href.startsWith('/platform/billing-review') &&
                              canBillingReview) ||
                            (task.href.startsWith('/platform/bills') && canBills) ||
                            (task.href.startsWith('/platform/digitalocean-billing') &&
                              canDigitalOcean) ||
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
                            canMerchantJournals
                              ? APP_PATHS.platformAccountingMerchantJournalEntries
                              : APP_PATHS.platformAccountingJournals
                          }
                        >
                          View journals
                        </DashboardWidgetLink>
                      }
                    >
                      {finance.journals.recent.length === 0 ? (
                        <p className="text-sm text-slate-500">No platform journal entries yet.</p>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {finance.journals.recent.map((j) => {
                            const to = canMerchantJournals
                              ? platformMerchantJournalDetailPath(j.id)
                              : APP_PATHS.platformAccountingJournals
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

      {visibleShortcuts.length > 0 ? (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-800">Shortcuts</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleShortcuts.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className="group flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-teal-200 hover:shadow-md"
              >
                <div className="rounded-xl bg-slate-100 p-3 text-slate-700 transition-colors group-hover:bg-teal-50 group-hover:text-teal-700">
                  <s.icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{s.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{s.description}</p>
                  <p className="mt-2 inline-flex items-center text-sm font-medium text-teal-600 group-hover:text-teal-700">
                    Open
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </PageTransition>
  )
}
