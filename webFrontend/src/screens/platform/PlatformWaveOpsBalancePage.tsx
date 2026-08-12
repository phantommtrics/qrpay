import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Wallet, Waves } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { useAuth } from '../../features/auth/AuthContext'
import { ApiError, fetchWaveOpsBalance, type WaveOpsBalance } from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

export function PlatformWaveOpsBalancePage() {
  const { user, canAccess } = useAuth()
  const [data, setData] = useState<WaveOpsBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const balance = await fetchWaveOpsBalance()
      setData(balance)
    } catch (e) {
      setData(null)
      setError(e instanceof ApiError ? e.message : 'Could not load Wave balance.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isPlatformOperator(user) || !canAccess('platform.wave_operations.view')) return
    void load()
  }, [user, canAccess, load])

  if (!isPlatformOperator(user) || !canAccess('platform.wave_operations.view')) {
    return (
      <PageTransition className="space-y-6" withSlide>
        <PageCard className="p-6">
          <p className="text-slate-600">You do not have access to Wave operations.</p>
        </PageCard>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
            Platform · Wave operations
          </p>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-slate-900">
            <Wallet className="h-8 w-8 text-teal-700" aria-hidden />
            Balance
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Live balance for the platform Wave business wallet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      <PageCard className="p-6 sm:p-8">
        <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-slate-500">
          <Waves className="h-4 w-4 text-teal-600" aria-hidden />
          Available balance
        </div>
        {loading && !data ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : data ? (
          <>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              {data.amount}{' '}
              <span className="text-2xl font-medium text-slate-500">{data.currency}</span>
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Retrieved {new Date(data.retrievedAt).toLocaleString()}
            </p>
          </>
        ) : null}
      </PageCard>
    </PageTransition>
  )
}
