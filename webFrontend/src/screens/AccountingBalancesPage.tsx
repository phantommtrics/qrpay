import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { fetchAccountingSummary, type AccountingSummary } from '../services/accountingApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

export function AccountingBalancesPage() {
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
          setError(e instanceof ApiError ? e.message : 'Could not load balances.')
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
          <h1 className="mt-8 text-xl font-semibold text-slate-900">Balances</h1>
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        </PageCard>

        <PageCard variant="plain">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total</p>
          <p className="mt-3 text-4xl font-semibold tabular-nums text-slate-900">
            {loading ? '…' : formatMoney(data?.cashTotal ?? 0, { decimals: 0 })}
          </p>
        </PageCard>

        <PageCard variant="plain">
          <p className="mb-10 text-xs uppercase tracking-wide text-slate-400">Positions</p>
          <ul className="space-y-10">
            {loading ? (
              <li className="text-sm text-slate-400">Loading…</li>
            ) : (data?.cashPositions.length ?? 0) === 0 ? (
              <li className="text-sm text-slate-500">No cash or clearing accounts yet.</li>
            ) : (
              data!.cashPositions.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{a.name}</p>
                    <p className="text-xs text-slate-400">{a.code}</p>
                  </div>
                  <p className="tabular-nums text-lg font-semibold text-slate-900">
                    {formatMoney(a.balance, { decimals: 0 })}
                  </p>
                </li>
              ))
            )}
          </ul>
        </PageCard>
      </div>
    </PageTransition>
  )
}
