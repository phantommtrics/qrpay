import { useCallback, useEffect, useState } from 'react'
import { Loader2, RotateCcw, Waves } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchWaveOpsTransactions,
  refundWaveOpsTransaction,
  type WaveOpsTransaction,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

const fieldInput =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600/30'

function todayYmd() {
  return new Date().toISOString().slice(0, 10)
}

export function PlatformWaveOpsTransactionsPage() {
  const { user, canAccess } = useAuth()
  const canManage = canAccess('platform.wave_operations.manage')
  const [date, setDate] = useState(todayYmd)
  const [items, setItems] = useState<WaveOpsTransaction[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refundId, setRefundId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(
    async (opts?: { append?: boolean; after?: string }) => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchWaveOpsTransactions({
          date,
          after: opts?.after,
        })
        setItems((prev) => (opts?.append ? [...prev, ...data.items] : data.items))
        setCursor(data.page_info.end_cursor ?? null)
        setHasNext(Boolean(data.page_info.has_next_page))
      } catch (e) {
        if (!opts?.append) setItems([])
        setError(e instanceof ApiError ? e.message : 'Could not load transactions.')
      } finally {
        setLoading(false)
      }
    },
    [date],
  )

  useEffect(() => {
    if (!isPlatformOperator(user) || !canAccess('platform.wave_operations.view')) return
    void load()
  }, [user, canAccess, load])

  const confirmRefund = async () => {
    if (!refundId) return
    setBusyId(refundId)
    setError(null)
    try {
      await refundWaveOpsTransaction(refundId)
      setRefundId(null)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Refund failed.')
    } finally {
      setBusyId(null)
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
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
          Platform · Wave operations
        </p>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-slate-900">
          <Waves className="h-8 w-8 text-teal-700" aria-hidden />
          Transactions
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Wallet transactions for a given day. Refund reverses a received payment including fees.
        </p>
      </div>

      <PageCard className="p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-slate-700">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldInput}
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Transaction</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Fee</th>
                <th className="px-4 py-3">Counterparty</th>
                <th className="px-4 py-3">Flags</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No transactions for this day.
                  </td>
                </tr>
              ) : null}
              {items.map((tx, idx) => (
                <tr key={`${tx.transaction_id}-${idx}`} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {new Date(tx.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-800">{tx.transaction_id}</td>
                  <td className="px-4 py-3 text-slate-800">
                    {tx.amount} {tx.currency}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{tx.fee}</td>
                  <td className="px-4 py-3 text-slate-800">
                    {tx.counterparty_name || '—'}
                    {tx.counterparty_mobile ? (
                      <span className="block text-xs text-slate-500">{tx.counterparty_mobile}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {tx.is_reversal ? (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        Reversal
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage && !tx.is_reversal && Number(tx.amount) > 0 ? (
                      <button
                        type="button"
                        onClick={() => setRefundId(tx.transaction_id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-800"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Refund
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hasNext && cursor ? (
          <div className="mt-4">
            <button
              type="button"
              disabled={loading}
              onClick={() => void load({ append: true, after: cursor })}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Load more
            </button>
          </div>
        ) : null}
      </PageCard>

      {refundId ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Refund transaction?</h3>
            <p className="mt-2 text-sm text-slate-600">
              This reverses payment <span className="font-mono text-xs">{refundId}</span> including
              fees. This cannot be undone from here.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => setRefundId(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => void confirmRefund()}
                className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50"
              >
                {busyId ? 'Refunding…' : 'Confirm refund'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageTransition>
  )
}
