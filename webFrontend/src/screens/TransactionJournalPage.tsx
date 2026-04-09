import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { FinanceReportChrome } from '../components/finance/FinanceReportChrome'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS, transactionJournalDetailPath } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  fetchTransactionJournals,
  type TransactionJournalListRow,
} from '../services/journalApi'
import { ApiError } from '../services/subscriptionApi'

const PAGE_SIZE = 20

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

export function TransactionJournalPage() {
  const { canAccess, currentOrganization } = useAuth()
  const businessId = currentOrganization?.id
  const allowed = canAccess('accounting.transaction_journal')

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<TransactionJournalListRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!businessId || !allowed) return
    setLoading(true)
    setError(null)
    void fetchTransactionJournals(businessId, {
      page,
      pageSize: PAGE_SIZE,
      from: from.trim() || undefined,
      to: to.trim() || undefined,
    })
      .then((res) => {
        setRows(res.data)
        setTotal(res.total)
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load journals.'))
      .finally(() => setLoading(false))
  }, [allowed, businessId, page, from, to])

  useEffect(() => {
    load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const canPrev = page > 1
  const canNext = page < totalPages

  const fieldClass =
    'rounded-sm border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

  if (!businessId) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <p className="text-qb-muted">Select a business.</p>
        </PageCard>
      </PageTransition>
    )
  }

  if (!allowed) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <p className="text-qb-muted">
            Your plan or access configuration does not include transaction journal. Ask the business owner to
            assign the Transaction journal product in Configuration.
          </p>
        </PageCard>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <FinanceReportChrome
        title="Transaction journal"
        description="Review postings for this business. Customer QR / POS sale and wallet-fee journals are exempt from approval. Other postings must be approved before they appear on GL, P&amp;L, and account statements."
        toolbar={null}
      >
        <PageCard
          variant="default"
          className="space-y-5 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value)
                  setPage(1)
                }}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value)
                  setPage(1)
                }}
                className={fieldClass}
              />
            </label>
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              className="rounded-sm border border-qb-border bg-white px-4 py-2 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

          {loading && rows.length === 0 ? (
            <div className="flex items-center gap-2 py-12 text-qb-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-sm border border-qb-border">
                <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-qb-border bg-qb-surface text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      <th className="px-3 py-2.5">Posted</th>
                      <th className="px-3 py-2.5">Source</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Memo</th>
                      <th className="px-3 py-2.5 text-right"> </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-qb-border">
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-qb-muted">
                          No journal entries.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => (
                        <tr key={r.id} className="align-top hover:bg-qb-surface/40">
                          <td className="px-3 py-2 tabular-nums text-qb-muted">
                            {formatShortDate(r.postedAt)}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-qb-heading">
                            {r.sourceType ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {r.cancelledAt ? (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-900">
                                Removed
                              </span>
                            ) : r.journalApprovalExempt ? (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                                Exempt
                              </span>
                            ) : r.approvedAt ? (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-900">
                                Approved
                              </span>
                            ) : (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="max-w-[320px] px-3 py-2 text-xs text-qb-muted">
                            <span className="line-clamp-2">{r.memo ?? '—'}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Link
                              to={transactionJournalDetailPath(r.id)}
                              className="text-sm font-semibold text-qb-primary hover:underline"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-qb-border pt-4">
                <p className="text-sm text-qb-muted">
                  {total === 0
                    ? 'No entries'
                    : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canPrev || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-sm border border-qb-border bg-white px-3 py-1.5 text-sm font-medium text-qb-heading shadow-sm hover:bg-qb-surface disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!canNext || loading}
                    onClick={() => setPage((p) => p + 1)}
                    className="inline-flex items-center gap-1 rounded-sm border border-qb-border bg-white px-3 py-1.5 text-sm font-medium text-qb-heading shadow-sm hover:bg-qb-surface disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </PageCard>
        <div className="mt-4">
          <Link
            to={APP_PATHS.accounting}
            className="inline-flex items-center text-sm font-medium text-qb-muted hover:text-qb-heading"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to accounting
          </Link>
        </div>
      </FinanceReportChrome>
    </PageTransition>
  )
}
