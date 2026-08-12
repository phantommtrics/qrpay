import { useCallback, useEffect, useState } from 'react'
import { generatePath, Link, useParams } from 'react-router-dom'
import { Loader2, RefreshCw, Waves } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchWaveOpsPayout,
  reverseWaveOpsPayout,
  type WaveOpsPayoutRow,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

export function PlatformWaveOpsPayoutDetailPage() {
  const { payoutId } = useParams<{ payoutId: string }>()
  const { user, canAccess } = useAuth()
  const canManage = canAccess('platform.wave_operations.manage')
  const [row, setRow] = useState<WaveOpsPayoutRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmReverse, setConfirmReverse] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (refresh = false) => {
      if (!payoutId) return
      setLoading(true)
      setError(null)
      try {
        const data = await fetchWaveOpsPayout(payoutId, refresh)
        setRow(data)
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not load payout.')
      } finally {
        setLoading(false)
      }
    },
    [payoutId],
  )

  useEffect(() => {
    if (!isPlatformOperator(user) || !canAccess('platform.wave_operations.view')) return
    void load(true)
  }, [user, canAccess, load])

  const doReverse = async () => {
    if (!payoutId) return
    setBusy(true)
    setError(null)
    try {
      const data = await reverseWaveOpsPayout(payoutId)
      setRow(data)
      setConfirmReverse(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Reverse failed.')
    } finally {
      setBusy(false)
    }
  }

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
            Payout detail
          </h1>
          <p className="mt-2 text-slate-600">Wave wallet payout record.</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <Link
            to={APP_PATHS.platformWaveOpsPayouts}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back
          </Link>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
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
        {loading && !row ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : null}

        {row ? (
          <>
            <dl className="grid gap-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-slate-500">Status</dt>
                <dd className="mt-1 font-semibold text-slate-900">{row.status}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Wave payout id</dt>
                <dd className="mt-1 font-mono text-xs text-slate-800">{row.wavePayoutId || '—'}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Recipient</dt>
                <dd className="mt-1 text-slate-900">
                  {row.name}
                  <span className="block text-slate-500">{row.mobile}</span>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Amount</dt>
                <dd className="mt-1 text-slate-900">
                  {row.receiveAmount} {row.currency}
                  {row.fee ? <span className="block text-slate-500">Fee: {row.fee}</span> : null}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium text-slate-500">Client reference</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-3 py-2 text-slate-800">
                  {row.clientReference || '—'}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Created</dt>
                <dd className="mt-1 text-slate-800">{new Date(row.createdAt).toLocaleString()}</dd>
              </div>
              {row.waveTimestamp ? (
                <div>
                  <dt className="font-medium text-slate-500">Wave timestamp</dt>
                  <dd className="mt-1 text-slate-800">
                    {new Date(row.waveTimestamp).toLocaleString()}
                  </dd>
                </div>
              ) : null}
              {row.reversedAt ? (
                <div>
                  <dt className="font-medium text-slate-500">Reversed at</dt>
                  <dd className="mt-1 text-slate-800">
                    {new Date(row.reversedAt).toLocaleString()}
                  </dd>
                </div>
              ) : null}
              {row.errorMessage ? (
                <div className="sm:col-span-2">
                  <dt className="font-medium text-slate-500">Error</dt>
                  <dd className="mt-1 text-rose-800">
                    {row.errorCode ? `${row.errorCode}: ` : ''}
                    {row.errorMessage}
                  </dd>
                </div>
              ) : null}
              {row.batch ? (
                <div>
                  <dt className="font-medium text-slate-500">Batch</dt>
                  <dd className="mt-1">
                    <Link
                      to={generatePath(APP_PATHS.platformWaveOpsPayoutBatchDetail, {
                        batchId: row.batch.id,
                      })}
                      className="font-medium text-teal-700 hover:text-teal-800"
                    >
                      Open batch
                    </Link>
                  </dd>
                </div>
              ) : null}
              {row.bill ? (
                <div>
                  <dt className="font-medium text-slate-500">Bill</dt>
                  <dd className="mt-1">
                    <Link
                      to={generatePath(APP_PATHS.platformBillDetail, { billId: row.bill.id })}
                      className="font-medium text-teal-700 hover:text-teal-800"
                    >
                      {row.bill.publicCode}
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>

            {canManage && row.canReverse ? (
              <div className="mt-8 border-t border-slate-100 pt-6">
                <button
                  type="button"
                  onClick={() => setConfirmReverse(true)}
                  className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-rose-800"
                >
                  Reverse payout
                </button>
                <p className="mt-2 text-xs text-slate-500">
                  Available until {new Date(row.reverseDeadline).toLocaleString()} (3-day window).
                </p>
              </div>
            ) : null}
          </>
        ) : null}
      </PageCard>

      {confirmReverse ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Reverse this payout?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Wave will reverse the payout including fees. This is idempotent on Wave&apos;s side.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmReverse(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void doReverse()}
                className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? 'Reversing…' : 'Confirm reverse'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageTransition>
  )
}
