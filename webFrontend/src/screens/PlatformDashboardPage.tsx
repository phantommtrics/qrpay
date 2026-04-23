import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Building2,
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

import { PageCard } from '../components/ui/PageCard'
import { PageSectionHeader } from '../components/ui/PageSectionHeader'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformDashboardSummary,
  fetchPlatformProfitLossReport,
  type PlatformDashboardSummary,
} from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

function firstOfMonthYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

type Shortcut = {
  to: string
  title: string
  description: string
  icon: typeof Building2
  ok: boolean
}

export function PlatformDashboardPage() {
  const { user, canAccess } = useAuth()
  const [summary, setSummary] = useState<PlatformDashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [netProfitMtd, setNetProfitMtd] = useState<number | null>(null)
  const [pnlLoading, setPnlLoading] = useState(false)

  const canPnl = canAccess('platform.accounting.reports.pnl')
  const roleLabel = user?.isPlatformOwner ? 'DPay' : 'DPay admin'

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

  useEffect(() => {
    if (!canPnl) {
      setNetProfitMtd(null)
      return
    }
    let cancelled = false
    setPnlLoading(true)
    void fetchPlatformProfitLossReport(firstOfMonthYmd(), todayYmd())
      .then((d) => {
        if (!cancelled) setNetProfitMtd(d.netProfit)
      })
      .catch(() => {
        if (!cancelled) setNetProfitMtd(null)
      })
      .finally(() => {
        if (!cancelled) setPnlLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [canPnl])

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
        to: APP_PATHS.payments,
        title: 'Payments',
        description: 'Incoming wallet and gateway activity',
        icon: Banknote,
        ok: canAccess('payments.view'),
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

  /** API returns ≤6; sort newest-first and cap at 6 for the table. */
  const recentBusinessRows = useMemo(() => {
    const rows = summary?.recentBusinesses ?? []
    return [...rows]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6)
  }, [summary?.recentBusinesses])

  const statClass =
    'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md'

  return (
    <PageTransition className="space-y-8" withSlide>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Platform dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {roleLabel} · DPay-wide health, subscriptions, and shortcuts into operator tools.
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

      {canPnl ? (
        <PageCard className="border border-teal-100 bg-gradient-to-br from-teal-50/80 to-white p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-800/80">
                Platform net profit (month to date)
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
                {pnlLoading ? (
                  <span className="inline-flex items-center gap-2 text-lg font-medium text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin" /> Loading…
                  </span>
                ) : netProfitMtd === null ? (
                  '—'
                ) : (
                  formatMoney(netProfitMtd, { decimals: 0 })
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">From platform chart of accounts · same period as P&amp;L report</p>
            </div>
            <Link
              to={APP_PATHS.platformAccountingReportPnl}
              className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-800"
            >
              Open P&amp;L
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className={statClass}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Businesses</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
                    {summary.businessesTotal}
                  </p>
                </div>
                <div className="rounded-xl bg-indigo-100 p-3 text-indigo-600">
                  <Building2 className="h-6 w-6" />
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                +{summary.businessesCreatedLast7Days} new in the last 7 days
              </p>
            </div>

            <div className={statClass}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Active subscriptions</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
                    {summary.subscriptionsActive}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-100 p-3 text-emerald-600">
                  <CreditCard className="h-6 w-6" />
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                {summary.subscriptionsTrialing} in trial · see past due below
              </p>
            </div>

            <div className={statClass}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Past due subscriptions</p>
                  <p
                    className={`mt-1 text-3xl font-bold tabular-nums ${
                      summary.subscriptionsPastDue > 0 ? 'text-amber-700' : 'text-slate-900'
                    }`}
                  >
                    {summary.subscriptionsPastDue}
                  </p>
                </div>
                <div
                  className={`rounded-xl p-3 ${
                    summary.subscriptionsPastDue > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <AlertTriangle className="h-6 w-6" />
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-500">Needs payment or attention</p>
            </div>

            <div className={statClass}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Pending invoices</p>
                  <p
                    className={`mt-1 text-3xl font-bold tabular-nums ${
                      summary.invoicesPendingPayment > 0 ? 'text-rose-700' : 'text-slate-900'
                    }`}
                  >
                    {summary.invoicesPendingPayment}
                  </p>
                </div>
                <div className="rounded-xl bg-rose-100 p-3 text-rose-600">
                  <Receipt className="h-6 w-6" />
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-500">Subscription invoices not yet paid</p>
            </div>

            <div className={statClass}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Refund reviews</p>
                  <p
                    className={`mt-1 text-3xl font-bold tabular-nums ${
                      summary.refundReviewsPending > 0 ? 'text-violet-800' : 'text-slate-900'
                    }`}
                  >
                    {summary.refundReviewsPending}
                  </p>
                </div>
                <div className="rounded-xl bg-violet-100 p-3 text-violet-700">
                  <ClipboardList className="h-6 w-6" />
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-500">Awaiting finance decision</p>
            </div>

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
                              to={generatePath(APP_PATHS.platformBusinessDetail, { businessId: b.id })}
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
