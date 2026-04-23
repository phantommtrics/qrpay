import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { FinanceReportChrome } from '../../components/finance/FinanceReportChrome'
import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformJournalEntries,
  type PlatformJournalEntryRow,
} from '../../services/subscriptionApi'
import { formatMoney } from '../../utils/formatMoney'

const PAGE_SIZE = 20

function localDateYmd(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function platformEntryDebitTotal(e: PlatformJournalEntryRow): number {
  return e.lines.reduce((s, ln) => s + ln.debit, 0)
}

export function PlatformOperatorMerchantJournalEntriesPage() {
  const { canAccess } = useAuth()
  const allowed =
    canAccess('platform.accounting.view') || canAccess('platform.accounting.journals.access')

  const [from, setFrom] = useState(() => localDateYmd())
  const [to, setTo] = useState(() => localDateYmd())
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<PlatformJournalEntryRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!allowed) return
    setLoading(true)
    setError(null)
    void fetchPlatformJournalEntries(page, PAGE_SIZE, {
      scope: 'operator',
      from: from.trim() || undefined,
      to: to.trim() || undefined,
    })
      .then((res) => {
        setRows(res.data)
        setTotal(res.total)
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : 'Could not load platform operator journals.'),
      )
      .finally(() => setLoading(false))
  }, [allowed, page, from, to])

  useEffect(() => {
    load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const canPrev = page > 1
  const canNext = page < totalPages

  const fieldClass =
    'rounded-sm border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

  const onFromToChange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom)
    setTo(nextTo)
    setPage(1)
  }

  if (!allowed) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <p className="text-qb-muted">You do not have access to this page.</p>
        </PageCard>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <FinanceReportChrome
        title="Platform operator journal"
        description="Manual and reversal journals on the DPay platform chart of accounts (operator-posted only). Use Operator journals to post or reverse entries. For all platform GL activity including subscriptions, see Journal entries."
        toolbar={null}
      >
        <PageCard
          variant="default"
          className="space-y-5 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <div className="flex flex-wrap gap-4 text-sm text-qb-muted">
            <span>
              All platform GL activity:{' '}
              <Link
                to={APP_PATHS.platformAccountingJournals}
                className="font-medium text-qb-heading underline-offset-2 hover:underline"
              >
                Journal entries
              </Link>
            </span>
            <span className="text-qb-border">|</span>
            <span>
              Post / reverse:{' '}
              <Link
                to={APP_PATHS.platformAccountingOperatorJournals}
                className="font-medium text-qb-heading underline-offset-2 hover:underline"
              >
                Operator journals
              </Link>
            </span>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => onFromToChange(e.target.value, to)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => onFromToChange(from, e.target.value)}
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

          <div>
            <h2 className="text-lg font-semibold text-qb-heading">Platform ledger — operator entries</h2>
            <p className="mt-1 text-sm text-qb-muted">
              Transaction-style list with totals per entry. Line detail and reverse on{' '}
              <Link
                to={APP_PATHS.platformAccountingOperatorJournals}
                className="font-medium text-qb-heading underline-offset-2 hover:underline"
              >
                Operator journals
              </Link>
              .
            </p>
          </div>

          {loading && rows.length === 0 ? (
            <div className="flex items-center gap-2 py-12 text-qb-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-sm border border-qb-border">
                <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-qb-border bg-qb-surface text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      <th className="px-3 py-2.5">Posted</th>
                      <th className="px-3 py-2.5">Source</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Memo</th>
                      <th className="px-3 py-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-qb-border">
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-qb-muted">
                          No platform operator journal entries in this period.
                        </td>
                      </tr>
                    ) : (
                      rows.map((e) => (
                        <tr key={e.id} className="align-top hover:bg-qb-surface/40">
                          <td className="px-3 py-2 tabular-nums text-qb-muted">
                            {formatShortDate(e.postedAt)}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-qb-heading">
                            {e.sourceType ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {e.hasReversal ? (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">
                                Reversed
                              </span>
                            ) : e.reversesPlatformJournalEntryId ? (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                                Reversal
                              </span>
                            ) : (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-900">
                                Posted
                              </span>
                            )}
                          </td>
                          <td className="max-w-[320px] px-3 py-2 text-xs text-qb-muted">
                            <span className="line-clamp-2">{e.memo ?? '—'}</span>
                            {e.reference ? (
                              <span className="mt-0.5 block font-mono text-[10px] text-qb-muted">
                                ref {e.reference}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-qb-heading">
                            {formatMoney(platformEntryDebitTotal(e), { decimals: 2 })}
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
            to={APP_PATHS.platformAccounting}
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
