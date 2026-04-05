import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

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

export function AccountingProfitLossPage() {
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id
  const [data, setData] = useState<AccountingSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchAccountingSummary(businessId)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'Could not load P&L.')
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
          <p className="text-slate-500">Select a business.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const pnl = data?.pnl
  const trend = data ? trendWithGrossProfit(data.trend) : []

  return (
    <PageTransition>
      <div className="space-y-16 py-4">
        <PageCard variant="plain">
          <Link
            to={APP_PATHS.accounting}
            className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
          <h1 className="mt-8 text-xl font-semibold text-slate-900">Profit &amp; loss</h1>
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        </PageCard>

        <PageCard variant="plain">
          <p className="text-xs uppercase tracking-wide text-slate-400">Summary</p>
          <dl className="mt-10 space-y-8">
            {[
              ['Income', pnl?.income],
              ['Cost of sales', pnl?.costOfSales],
              ['Gross profit', pnl?.grossProfit],
              ['Operating expenses', pnl?.operatingExpenses],
              ['Net profit', pnl?.netProfit],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-8">
                <dt className="text-sm text-slate-500">{label}</dt>
                <dd className="tabular-nums text-sm font-medium text-slate-900">
                  {loading || value === undefined ? '…' : formatMoney(Number(value), { decimals: 0 })}
                </dd>
              </div>
            ))}
          </dl>
        </PageCard>

        <div className="grid gap-16 lg:grid-cols-3">
          {[
            { title: 'Income', rows: data?.incomeAccounts ?? [] },
            { title: 'COGS', rows: data?.costOfGoodsSoldAccounts ?? [] },
            { title: 'Operating expenses', rows: data?.operatingExpenseAccounts ?? [] },
          ].map((block) => (
            <PageCard key={block.title} variant="plain">
              <p className="text-xs uppercase tracking-wide text-slate-400">{block.title}</p>
              <ul className="mt-8 space-y-6">
                {loading ? (
                  <li className="text-sm text-slate-400">…</li>
                ) : block.rows.length === 0 ? (
                  <li className="text-sm text-slate-400">—</li>
                ) : (
                  block.rows.map((a) => (
                    <li
                      key={a.id}
                      className="flex justify-between gap-4 text-sm"
                    >
                      <span className="text-slate-600">{a.name}</span>
                      <span className="tabular-nums font-medium text-slate-900">
                        {formatMoney(a.balance, { decimals: 0 })}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </PageCard>
          ))}
        </div>

        <PageCard variant="plain">
          <p className="mb-8 text-xs uppercase tracking-wide text-slate-400">Monthly gross profit</p>
          <ul className="space-y-4">
            {loading
              ? null
              : trend.map((point) => (
                  <li key={point.period} className="flex justify-between text-sm">
                    <span className="text-slate-500">{point.period}</span>
                    <span className="tabular-nums font-medium text-slate-900">
                      {formatMoney(point.grossProfit, { decimals: 0 })}
                    </span>
                  </li>
                ))}
          </ul>
        </PageCard>
      </div>
    </PageTransition>
  )
}
