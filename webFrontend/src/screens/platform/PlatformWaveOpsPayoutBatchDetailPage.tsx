import { useCallback, useEffect, useRef, useState } from 'react'
import { generatePath, Link, useParams } from 'react-router-dom'
import { Loader2, Waves } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchWaveOpsPayoutBatch,
  type WaveOpsPayoutBatchRow,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

export function PlatformWaveOpsPayoutBatchDetailPage() {
  const { batchId } = useParams<{ batchId: string }>()
  const { user, canAccess } = useAuth()
  const [batch, setBatch] = useState<WaveOpsPayoutBatchRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    if (!batchId) return
    try {
      const data = await fetchWaveOpsPayoutBatch(batchId)
      setBatch(data)
      setError(null)
      return data
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load batch.')
      return null
    } finally {
      setLoading(false)
    }
  }, [batchId])

  useEffect(() => {
    if (!isPlatformOperator(user) || !canAccess('platform.wave_operations.view')) return
    void load()
  }, [user, canAccess, load])

  useEffect(() => {
    if (!batch || batch.status === 'complete' || batch.status === 'failed') {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    pollRef.current = setInterval(() => {
      void load()
    }, 2000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [batch?.status, load])

  if (!isPlatformOperator(user) || !canAccess('platform.wave_operations.view')) {
    return (
      <PageTransition className="space-y-6" withSlide>
        <PageCard className="p-6">
          <p className="text-slate-600">You do not have access to Wave operations.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const polling =
    batch != null && batch.status !== 'complete' && batch.status !== 'failed'

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
            Platform · Wave operations
          </p>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-slate-900">
            <Waves className="h-8 w-8 text-teal-700" aria-hidden />
            Payout batch
          </h1>
          <p className="mt-2 text-slate-600">
            {polling
              ? 'Polling Wave every 2 seconds until complete…'
              : 'Batch finished.'}
          </p>
        </div>
        <Link
          to={APP_PATHS.platformWaveOpsPayoutBatches}
          className="inline-flex items-center justify-center self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          All batches
        </Link>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      <PageCard className="p-5 sm:p-6">
        {loading && !batch ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : null}

        {batch ? (
          <div className="space-y-5">
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="font-medium text-slate-500">Status</dt>
                <dd className="mt-1 font-semibold text-slate-900">{batch.status}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Wave batch id</dt>
                <dd className="mt-1 font-mono text-xs text-slate-800">
                  {batch.waveBatchId || '—'}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Created</dt>
                <dd className="mt-1 text-slate-800">
                  {new Date(batch.createdAt).toLocaleString()}
                </dd>
              </div>
            </dl>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Error</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batch.payouts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-slate-800">
                        {p.name}
                        <span className="block text-xs text-slate-500">{p.mobile}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {p.receiveAmount} {p.currency}
                      </td>
                      <td className="px-4 py-3 text-slate-800">{p.status}</td>
                      <td className="px-4 py-3 text-xs text-rose-700">{p.errorMessage || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={generatePath(APP_PATHS.platformWaveOpsPayoutDetail, {
                            payoutId: p.id,
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
          </div>
        ) : null}
      </PageCard>
    </PageTransition>
  )
}
