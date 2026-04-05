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
import { ArrowRight, BookOpenText, ChartNoAxesCombined, Wallet } from 'lucide-react'
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
          <h1 className="text-xl font-semibold text-slate-900">Accounting</h1>
          <p className="mt-4 text-slate-500">Select a business to continue.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const pnl = data?.pnl
  const trend = data ? trendWithGrossProfit(data.trend) : []
  const cashTotal = data?.cashTotal ?? 0
  const cashCount = data?.cashPositions.length ?? 0

  return (
    <PageTransition>
      <div className="space-y-16 py-4">
        <PageCard variant="plain">
          <h1 className="text-xl font-semibold text-slate-900">Accounting</h1>
          {currentOrganization?.name ? (
            <p className="mt-1 text-sm text-slate-500">{currentOrganization.name}</p>
          ) : null}
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        </PageCard>

        <div className="grid gap-12 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => navigate(APP_PATHS.accountingBalances)}
            className="text-left transition-opacity hover:opacity-80"
          >
            <PageCard variant="plain" className="space-y-6">
              <Wallet className="h-5 w-5 text-slate-400" strokeWidth={1.5} />
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Cash &amp; clearing</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
                  {loading ? '…' : formatMoney(cashTotal, { decimals: 0 })}
                </p>
              </div>
              <p className="flex items-center text-sm text-slate-500">
                {cashCount} position{cashCount === 1 ? '' : 's'}
                <ArrowRight className="ml-1 h-4 w-4" />
              </p>
            </PageCard>
          </button>

          <button
            type="button"
            onClick={() => navigate(APP_PATHS.accountingProfitLoss)}
            className="text-left transition-opacity hover:opacity-80"
          >
            <PageCard variant="plain" className="space-y-6">
              <ChartNoAxesCombined className="h-5 w-5 text-slate-400" strokeWidth={1.5} />
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Net profit</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
                  {loading || !pnl ? '…' : formatMoney(pnl.netProfit, { decimals: 0 })}
                </p>
              </div>
              <p className="flex items-center text-sm text-slate-500">
                {pnl ? `${formatMoney(pnl.grossProfit, { decimals: 0 })} gross` : '…'}
                <ArrowRight className="ml-1 h-4 w-4" />
              </p>
            </PageCard>
          </button>

          <button
            type="button"
            disabled={!canOpenChartOfAccounts}
            onClick={() => canOpenChartOfAccounts && navigate(APP_PATHS.accountingChart)}
            className="text-left transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PageCard variant="plain" className="space-y-6">
              <BookOpenText className="h-5 w-5 text-slate-400" strokeWidth={1.5} />
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Chart of accounts</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">
                  {canOpenChartOfAccounts ? 'View' : '—'}
                </p>
              </div>
              <p className="text-sm text-slate-500">
                {canOpenChartOfAccounts ? 'Open' : 'No access'}
                {canOpenChartOfAccounts ? <ArrowRight className="ml-1 inline h-4 w-4" /> : null}
              </p>
            </PageCard>
          </button>
        </div>

        <div className="grid gap-16 lg:grid-cols-[1.2fr_0.8fr]">
          <PageCard variant="plain">
            <p className="mb-8 text-xs uppercase tracking-wide text-slate-400">Six-month trend</p>
            <div className="h-72">
              {loading ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend}>
                    <defs>
                      <linearGradient id="accTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0d9488" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f1f5f9" strokeDasharray="4 4" vertical={false} />
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
                      formatter={(value: number | string) =>
                        formatMoney(Number(value), { decimals: 0 })
                      }
                      contentStyle={{
                        border: 'none',
                        borderRadius: '8px',
                        boxShadow: '0 4px 20px rgb(0 0 0 / 0.06)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="grossProfit"
                      stroke="#0d9488"
                      strokeWidth={2}
                      fill="url(#accTrendFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </PageCard>

          <PageCard variant="plain">
            <p className="mb-8 text-xs uppercase tracking-wide text-slate-400">P&amp;L</p>
            <ul className="space-y-8">
              {[
                { label: 'Income', value: pnl?.income },
                { label: 'COGS', value: pnl?.costOfSales },
                { label: 'Gross profit', value: pnl?.grossProfit },
                { label: 'Operating expenses', value: pnl?.operatingExpenses },
              ].map((row) => (
                <li key={row.label} className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-slate-500">{row.label}</span>
                  <span className="tabular-nums text-sm font-medium text-slate-900">
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
