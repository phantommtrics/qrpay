import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformJournalEntries,
  postPlatformJournalReverse,
  type PlatformJournalEntryRow,
} from '../../services/subscriptionApi'
import { formatMoney } from '../../utils/formatMoney'

export function PlatformAccountingJournalsPage() {
  const { canAccess } = useAuth()
  const canReverse = canAccess('platform.accounting.journals.reverse')

  const [entries, setEntries] = useState<PlatformJournalEntryRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadEntries = useCallback(() => {
    setLoading(true)
    setError(null)
    void fetchPlatformJournalEntries(page, pageSize)
      .then((res) => {
        setEntries(res.data)
        setTotal(res.total)
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load journals.'))
      .finally(() => setLoading(false))
  }, [page])

  const reverseEntry = async (journalEntryId: string) => {
    if (!confirm('Post a reversing journal (swap debits and credits)?')) return
    setError(null)
    try {
      const postedAt = new Date().toISOString().slice(0, 10)
      await postPlatformJournalReverse(journalEntryId, { postedAt })
      loadEntries()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reverse journal.')
    }
  }

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  return (
    <PageTransition>
      <div className="space-y-6 py-2">
        <PageCard variant="default" className="rounded-md border-qb-border p-5">
          <Link
            to={APP_PATHS.platformAccounting}
            className="text-sm font-medium text-qb-muted hover:text-qb-heading"
          >
            ← Back to platform accounting
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-qb-heading">Platform journal ledger</h1>
          <p className="mt-2 text-sm text-qb-muted">
            All activity on the platform chart of accounts: subscription payments, checkout settlement,
            aggregator self-settlement (payout cost and withhold), supplier bill payments, refunds, fees,
            and operator-posted journals. To post or review only
            manual entries by platform staff, use{' '}
            <Link
              to={APP_PATHS.platformAccountingOperatorJournals}
              className="font-medium text-qb-heading underline-offset-2 hover:underline"
            >
              Operator journals
            </Link>
            .
          </p>
        </PageCard>

        <PageCard variant="default" className="rounded-md border-qb-border p-5">
          <h2 className="text-lg font-semibold text-qb-heading">Recent entries</h2>
          {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-qb-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : null}
          {!loading && entries.length === 0 ? (
            <p className="py-6 text-sm text-qb-muted">No journal entries yet.</p>
          ) : null}
          <div className="mt-4 space-y-6">
            {entries.map((e) => (
              <div key={e.id} className="rounded-sm border border-qb-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-qb-border bg-qb-surface/50 px-3 py-2 text-xs text-qb-muted">
                  <div className="flex flex-wrap gap-2">
                    <span className="font-mono text-qb-heading">{e.postedAt.slice(0, 10)}</span>
                    {e.sourceType ? (
                      <span className="rounded bg-white px-1.5 py-0.5">{e.sourceType}</span>
                    ) : null}
                    {e.business ? <span>{e.business.name}</span> : null}
                    {e.memo ? <span>{e.memo}</span> : null}
                    {e.reference ? <span className="font-mono">ref {e.reference}</span> : null}
                    {e.hasReversal ? (
                      <span className="text-amber-800">Reversed</span>
                    ) : null}
                  </div>
                  {canReverse &&
                  e.sourceType === 'MANUAL' &&
                  !e.reversesPlatformJournalEntryId &&
                  !e.hasReversal &&
                  !e.billPayment ? (
                    <button
                      type="button"
                      onClick={() => void reverseEntry(e.id)}
                      className="rounded-sm border border-qb-border bg-white px-2 py-1 text-xs font-medium text-qb-heading hover:bg-qb-surface"
                    >
                      Reverse
                    </button>
                  ) : null}
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {e.lines.map((ln) => (
                      <tr key={ln.id} className="border-t border-qb-border">
                        <td className="px-3 py-2 font-mono text-xs text-qb-muted">{ln.code}</td>
                        <td className="px-3 py-2">{ln.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {ln.debit > 0 ? formatMoney(ln.debit, { decimals: 2 }) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {ln.credit > 0 ? formatMoney(ln.credit, { decimals: 2 }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          {total > pageSize ? (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-sm border border-qb-border px-3 py-1 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-sm border border-qb-border px-3 py-1 text-sm disabled:opacity-50"
              >
                Next
              </button>
              <span className="self-center text-xs text-qb-muted">
                Page {page} · {total} total
              </span>
            </div>
          ) : null}
        </PageCard>
      </div>
    </PageTransition>
  )
}
