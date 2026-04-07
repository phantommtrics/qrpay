import { useEffect, useState } from 'react'
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
  ArrowRight,
  BookOpenText,
  ChartNoAxesCombined,
  FileSpreadsheet,
  NotebookPen,
  Scale,
  ScrollText,
  Wallet,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  fetchAccountingSummary,
  trendWithGrossProfit,
  type AccountingSummary,
} from '../services/accountingApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

export function AccountingPage() {
  const navigate = useNavigate()
  const { canAccess, currentOrganization } = useAuth()
  const businessId = currentOrganization?.id
  const canOpenChartOfAccounts = canAccess('accounting.chart.view')
  const canGlReport = canAccess('accounting.reports.gl')
  const canPnlReport = canAccess('accounting.reports.pnl')
  const canStatement = canAccess('accounting.reports.statement')
  const canGeneralJournal = canAccess('accounting.journals.general')
  const hasFinanceReports = canGlReport || canPnlReport || canStatement
  const [data, setData] = useState<AccountingSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!businessId) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchAccountingSummary(businessId)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) {
          setData(null)
          setError(e instanceof ApiError ? e.message : 'Could not load accounting data.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [businessId])

  if (!businessId) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <h1 className="text-xl font-semibold text-qb-heading">Accounting</h1>
          <p className="mt-4 text-qb-muted">Select a business to continue.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const pnl = data?.pnl
  const trend = data ? trendWithGrossProfit(data.trend) : []
  const cashTotal = data?.cashTotal ?? 0
  const cashCount = data?.cashPositions.length ?? 0

  const tileCard =
    'space-y-6 rounded-md border border-qb-border bg-white p-6 shadow-[0_1px_2px_rgba(57,58,61,0.08)] transition-shadow hover:shadow-[0_2px_8px_rgba(57,58,61,0.1)]'

  return (
    <PageTransition>
      <div className="space-y-12 py-4 lg:space-y-14">
        <PageCard variant="plain">
          <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">Accounting</h1>
          {currentOrganization?.name ? (
            <p className="mt-1 text-sm text-qb-muted">{currentOrganization.name}</p>
          ) : null}
          {error ? <p className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}
        </PageCard>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <button
            type="button"
            onClick={() => navigate(APP_PATHS.accountingBalances)}
            className="text-left"
          >
            <div className={tileCard}>
              <Wallet className="h-5 w-5 text-qb-heading" strokeWidth={1.5} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                  Cash &amp; clearing
                </p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-qb-heading">
                  {loading ? '…' : formatMoney(cashTotal, { decimals: 0 })}
                </p>
              </div>
              <p className="flex items-center text-sm text-qb-muted">
                {cashCount} position{cashCount === 1 ? '' : 's'}
                <ArrowRight className="ml-1 h-4 w-4 text-qb-heading" />
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate(APP_PATHS.accountingProfitLoss)}
            className="text-left"
          >
            <div className={tileCard}>
              <ChartNoAxesCombined className="h-5 w-5 text-qb-heading" strokeWidth={1.5} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Net profit</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-qb-heading">
                  {loading || !pnl ? '…' : formatMoney(pnl.netProfit, { decimals: 0 })}
                </p>
              </div>
              <p className="flex items-center text-sm text-qb-muted">
                {pnl ? `${formatMoney(pnl.grossProfit, { decimals: 0 })} gross` : '…'}
                <ArrowRight className="ml-1 h-4 w-4 text-qb-heading" />
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled={!canOpenChartOfAccounts}
            onClick={() => canOpenChartOfAccounts && navigate(APP_PATHS.accountingChart)}
            className="text-left disabled:cursor-not-allowed disabled:opacity-45"
          >
            <div className={tileCard}>
              <BookOpenText className="h-5 w-5 text-qb-heading" strokeWidth={1.5} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                  Chart of accounts
                </p>
                <p className="mt-2 text-3xl font-semibold text-qb-heading">
                  {canOpenChartOfAccounts ? 'View' : '—'}
                </p>
              </div>
              <p className="text-sm text-qb-muted">
                {canOpenChartOfAccounts ? 'Open' : 'No access'}
                {canOpenChartOfAccounts ? <ArrowRight className="ml-1 inline h-4 w-4 text-qb-heading" /> : null}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate(APP_PATHS.accountingJournals)}
            className="text-left"
          >
            <div className={tileCard}>
              <NotebookPen className="h-5 w-5 text-qb-heading" strokeWidth={1.5} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                  Journal entries
                </p>
                <p className="mt-2 text-3xl font-semibold text-qb-heading">Post</p>
              </div>
              <p className="flex items-center text-sm text-qb-muted">
                Money in, out, transfers
                <ArrowRight className="ml-1 h-4 w-4 text-qb-heading" />
              </p>
            </div>
          </button>

          {canGeneralJournal ? (
            <button
              type="button"
              onClick={() => navigate(APP_PATHS.accountingGeneralJournal)}
              className="text-left"
            >
              <div className={tileCard}>
                <ScrollText className="h-5 w-5 text-qb-heading" strokeWidth={1.5} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    General journal
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-qb-heading">GL</p>
                </div>
                <p className="flex items-center text-sm text-qb-muted">
                  Debit / credit only
                  <ArrowRight className="ml-1 h-4 w-4 text-qb-heading" />
                </p>
              </div>
            </button>
          ) : null}
        </div>

        {hasFinanceReports ? (
          <PageCard
            variant="default"
            className="rounded-md border-qb-border p-6 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
          >
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-qb-muted">
              Financial reports
            </p>
            <p className="mb-6 max-w-2xl text-sm text-qb-muted">
              Period-based reports similar to Xero: trial balance, detailed profit &amp; loss, and
              single-account activity. Export to CSV or PDF when your plan includes export access.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {canGlReport ? (
                <button
                  type="button"
                  onClick={() => navigate(APP_PATHS.accountingReportGlBalance)}
                  className="text-left"
                >
                  <div className="rounded-md border border-qb-border bg-qb-surface/40 p-4 transition-shadow hover:shadow-md">
                    <Scale className="h-5 w-5 text-qb-heading" strokeWidth={1.5} />
                    <p className="mt-3 text-sm font-semibold text-qb-heading">GL balance</p>
                    <p className="mt-1 text-xs text-qb-muted">Trial balance as at a date</p>
                    <p className="mt-2 flex items-center text-xs font-medium text-qb-heading">
                      Open <ArrowRight className="ml-1 h-3 w-3" />
                    </p>
                  </div>
                </button>
              ) : null}
              {canPnlReport ? (
                <button
                  type="button"
                  onClick={() => navigate(APP_PATHS.accountingReportProfitLoss)}
                  className="text-left"
                >
                  <div className="rounded-md border border-qb-border bg-qb-surface/40 p-4 transition-shadow hover:shadow-md">
                    <FileSpreadsheet className="h-5 w-5 text-qb-heading" strokeWidth={1.5} />
                    <p className="mt-3 text-sm font-semibold text-qb-heading">Profit &amp; loss</p>
                    <p className="mt-1 text-xs text-qb-muted">Revenue &amp; expenses by period</p>
                    <p className="mt-2 flex items-center text-xs font-medium text-qb-heading">
                      Open <ArrowRight className="ml-1 h-3 w-3" />
                    </p>
                  </div>
                </button>
              ) : null}
              {canStatement ? (
                <button
                  type="button"
                  onClick={() => navigate(APP_PATHS.accountingReportAccountStatement)}
                  className="text-left"
                >
                  <div className="rounded-md border border-qb-border bg-qb-surface/40 p-4 transition-shadow hover:shadow-md">
                    <BookOpenText className="h-5 w-5 text-qb-heading" strokeWidth={1.5} />
                    <p className="mt-3 text-sm font-semibold text-qb-heading">Account statement</p>
                    <p className="mt-1 text-xs text-qb-muted">Running balance for one account</p>
                    <p className="mt-2 flex items-center text-xs font-medium text-qb-heading">
                      Open <ArrowRight className="ml-1 h-3 w-3" />
                    </p>
                  </div>
                </button>
              ) : null}
            </div>
          </PageCard>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:gap-10">
          <PageCard
            variant="default"
            className="rounded-md border-qb-border p-6 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
          >
            <p className="mb-6 text-xs font-semibold uppercase tracking-wide text-qb-muted">
              Six-month trend
            </p>
            <div className="h-72">
              {loading ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend}>
                    <defs>
                      <linearGradient id="accTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#64748b" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e8eaef" strokeDasharray="4 4" vertical={false} />
                    <XAxis
                      dataKey="period"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickFormatter={(v) => `D${v}`}
                    />
                    <Tooltip
                      formatter={(value) => {
                        const n = Array.isArray(value) ? value[0] : value
                        return formatMoney(Number(n ?? 0), { decimals: 0 })
                      }}
                      contentStyle={{
                        border: 'none',
                        borderRadius: '8px',
                        boxShadow: '0 4px 20px rgb(0 0 0 / 0.06)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="grossProfit"
                      stroke="#64748b"
                      strokeWidth={2}
                      fill="url(#accTrendFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </PageCard>

          <PageCard
            variant="default"
            className="rounded-md border-qb-border p-6 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
          >
            <p className="mb-6 text-xs font-semibold uppercase tracking-wide text-qb-muted">P&amp;L</p>
            <ul className="divide-y divide-qb-border">
              {[
                { label: 'Income', value: pnl?.income },
                { label: 'COGS', value: pnl?.costOfSales },
                { label: 'Gross profit', value: pnl?.grossProfit },
                { label: 'Operating expenses', value: pnl?.operatingExpenses },
              ].map((row) => (
                <li
                  key={row.label}
                  className="flex items-baseline justify-between gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <span className="text-sm text-qb-muted">{row.label}</span>
                  <span className="tabular-nums text-sm font-semibold text-qb-heading">
                    {loading || row.value === undefined ? '…' : formatMoney(row.value, { decimals: 0 })}
                  </span>
                </li>
              ))}
            </ul>
          </PageCard>
        </div>
      </div>
    </PageTransition>
  )
}
