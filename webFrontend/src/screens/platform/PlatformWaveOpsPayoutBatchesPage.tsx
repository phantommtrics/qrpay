import { useCallback, useEffect, useState } from 'react'
import { generatePath, Link } from 'react-router-dom'
import { Loader2, Waves } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchWaveOpsPayoutBatches,
  type WaveOpsPayoutBatchRow,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

export function PlatformWaveOpsPayoutBatchesPage() {
  const { user, canAccess } = useAuth()
  const [rows, setRows] = useState<WaveOpsPayoutBatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchWaveOpsPayoutBatches(50))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load batches.')
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
            <Waves className="h-8 w-8 text-teal-700" aria-hidden />
            Payout batches
          </h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Asynchronous Wave payout batches. Open a batch to poll status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center justify-center self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
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

      <PageCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Wave batch</th>
                <th className="px-4 py-3">Payouts</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                  </td>
                </tr>
              ) : null}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No batches yet. Create one from Wave payouts → Bulk.
                  </td>
                </tr>
              ) : null}
              {rows.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {new Date(b.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-800">{b.status}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {b.waveBatchId || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-800">{b.payoutCount}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={generatePath(APP_PATHS.platformWaveOpsPayoutBatchDetail, {
                        batchId: b.id,
                      })}
                      className="font-medium text-teal-700 hover:text-teal-800"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageCard>
    </PageTransition>
  )
}
