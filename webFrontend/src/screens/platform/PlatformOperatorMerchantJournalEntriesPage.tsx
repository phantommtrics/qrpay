import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, Loader2, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'

import { FinanceReportChrome } from '../../components/finance/FinanceReportChrome'
import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { Toast, type ToastVariant } from '../../components/ui/Toast'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformJournalEntries,
  postPlatformJournalReverse,
  type PlatformJournalEntryRow,
} from '../../services/subscriptionApi'
import { formatMoney } from '../../utils/formatMoney'

const PAGE_SIZE = 10

function localDateYmd(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatShortDate(iso: string): string {
  const dateOnly = iso.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  return dateOnly ?? '—'
}

function platformEntryDebitTotal(e: PlatformJournalEntryRow): number {
  return e.lines.reduce((s, ln) => s + ln.debit, 0)
}

function canReversePlatformEntry(e: PlatformJournalEntryRow): boolean {
  return (
    e.sourceType === 'MANUAL' &&
    !e.reversesPlatformJournalEntryId &&
    !e.hasReversal &&
    !e.billPayment
  )
}

export function PlatformOperatorMerchantJournalEntriesPage() {
  const { canAccess } = useAuth()
  const allowed =
    canAccess('platform.accounting.view') || canAccess('platform.accounting.journals.access')
  const canReverse = canAccess('platform.accounting.journals.reverse')

  const [from, setFrom] = useState(() => localDateYmd())
  const [to, setTo] = useState(() => localDateYmd())
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<PlatformJournalEntryRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewEntry, setViewEntry] = useState<PlatformJournalEntryRow | null>(null)
  const [reverseEntry, setReverseEntry] = useState<PlatformJournalEntryRow | null>(null)
  const [reversalDate, setReversalDate] = useState(() => localDateYmd())
  const [reversalMemo, setReversalMemo] = useState('')
  const [reversing, setReversing] = useState(false)
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null)

  const dismissToast = useCallback(() => setToast(null), [])

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

  const openReversal = (entry: PlatformJournalEntryRow) => {
    setReverseEntry(entry)
    setViewEntry(null)
    setReversalDate(localDateYmd())
    setReversalMemo('')
    setToast(null)
  }

  const openView = (entry: PlatformJournalEntryRow) => {
    setViewEntry(entry)
    setReverseEntry(null)
  }

  const submitReversal = async (e: FormEvent) => {
    e.preventDefault()
    if (!reverseEntry || !canReversePlatformEntry(reverseEntry)) return
    setReversing(true)
    setToast(null)
    setError(null)
    try {
      await postPlatformJournalReverse(reverseEntry.id, {
        postedAt: reversalDate,
        memo: reversalMemo.trim() || null,
      })
      setToast({ message: 'Reversal journal posted.', variant: 'success' })
      setReverseEntry(null)
      load()
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not post reversal.'
      setToast({ message, variant: 'error' })
    } finally {
      setReversing(false)
    }
  }

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
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant ?? 'success'}
        onDismiss={dismissToast}
      />
      <FinanceReportChrome
        title="Platform operator journal"
        description="Manual and reversal journals on the DirectPay platform chart of accounts (operator-posted only). Use Operator journals to post entries; review and reverse posted entries here. For all platform GL activity including subscriptions, see Journal entries."
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
              Post entries:{' '}
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
              Transaction-style list with totals per entry. Open an eligible manual entry to preview
              lines and post a reversal, or use{' '}
              <Link
                to={APP_PATHS.platformAccountingOperatorJournals}
                className="font-medium text-qb-heading underline-offset-2 hover:underline"
              >
                Operator journals
              </Link>
              {' '}to post a new manual entry
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
                      <th className="px-3 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-qb-border">
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-4 text-qb-muted">
                          No platform operator journal entries in this period.
                        </td>
                      </tr>
                    ) : (
                      rows.map((e) => {
                        const reversible = canReverse && canReversePlatformEntry(e)
                        return (
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
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openView(e)}
                                  className="inline-flex items-center gap-1.5 rounded-sm border border-qb-border bg-white px-2.5 py-1.5 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  View
                                </button>
                                {reversible ? (
                                  <button
                                    type="button"
                                    onClick={() => openReversal(e)}
                                    className="inline-flex items-center gap-1.5 rounded-sm border border-qb-border bg-white px-2.5 py-1.5 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    Reverse
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {viewEntry ? (
                <div className="rounded-md border border-qb-border bg-white p-5 shadow-[0_1px_2px_rgba(57,58,61,0.06)]">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-qb-heading">Journal entry details</h3>
                      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-qb-muted">
                        Posting details and line distribution for this platform operator journal entry.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewEntry(null)}
                      className="rounded-sm border border-transparent px-3 py-1.5 text-sm font-medium text-qb-muted hover:text-qb-heading"
                    >
                      Close
                    </button>
                  </div>

                  <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Posted</p>
                      <p className="mt-1 tabular-nums text-qb-heading">
                        {formatShortDate(viewEntry.postedAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Source</p>
                      <p className="mt-1 font-mono text-xs text-qb-heading">
                        {viewEntry.sourceType ?? '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                        Reference
                      </p>
                      <p className="mt-1 font-mono text-xs text-qb-heading">
                        {viewEntry.reference ?? '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Total</p>
                      <p className="mt-1 tabular-nums font-semibold text-qb-heading">
                        {formatMoney(platformEntryDebitTotal(viewEntry), { decimals: 2 })}
                      </p>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Memo</p>
                      <p className="mt-1 text-qb-heading">{viewEntry.memo ?? '—'}</p>
                    </div>
                  </div>

                  <div className="mt-5 overflow-x-auto rounded-sm border border-qb-border">
                    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-qb-border bg-qb-surface text-xs font-semibold uppercase tracking-wide text-qb-muted">
                          <th className="px-3 py-2.5">Account</th>
                          <th className="px-3 py-2.5">Category</th>
                          <th className="px-3 py-2.5">Description</th>
                          <th className="px-3 py-2.5 text-right">Debit</th>
                          <th className="px-3 py-2.5 text-right">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-qb-border">
                        {viewEntry.lines.map((ln) => (
                          <tr key={ln.id} className="align-top">
                            <td className="px-3 py-2.5 text-qb-heading">
                              {ln.code} — {ln.name}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs text-qb-muted">
                              {ln.category}
                            </td>
                            <td className="max-w-[280px] px-3 py-2.5 text-xs text-qb-muted">
                              <span className="line-clamp-2">{ln.description ?? '—'}</span>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {ln.debit > 0 ? formatMoney(ln.debit, { decimals: 2 }) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {ln.credit > 0 ? formatMoney(ln.credit, { decimals: 2 }) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {reverseEntry ? (
                <div className="rounded-md border border-qb-border bg-white p-5 shadow-[0_1px_2px_rgba(57,58,61,0.06)]">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-qb-heading">Reverse journal entry</h3>
                      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-qb-muted">
                        Review the lines below. Posting a reversal creates a new platform entry with
                        debits and credits swapped on the same accounts.
                      </p>
                    </div>
                    <span className="font-mono text-xs text-qb-muted">ID: {reverseEntry.id}</span>
                  </div>

                  <div className="overflow-x-auto rounded-sm border border-qb-border">
                    <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-qb-border bg-qb-surface text-xs font-semibold uppercase tracking-wide text-qb-muted">
                          <th className="px-3 py-2.5">Account</th>
                          <th className="px-3 py-2.5">Description</th>
                          <th className="px-3 py-2.5 text-right">Debit</th>
                          <th className="px-3 py-2.5 text-right">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-qb-border">
                        {reverseEntry.lines.map((ln) => (
                          <tr key={ln.id} className="align-top">
                            <td className="px-3 py-2.5 text-qb-heading">
                              {ln.code} — {ln.name}
                            </td>
                            <td className="max-w-[280px] px-3 py-2.5 text-xs text-qb-muted">
                              <span className="line-clamp-2">{ln.description ?? '—'}</span>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {formatMoney(ln.debit, { decimals: 2 })}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {formatMoney(ln.credit, { decimals: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-3 text-xs text-qb-muted">
                    The reversal will post the same amounts with debit and credit swapped on each line.
                  </p>

                  <form onSubmit={(e) => void submitReversal(e)} className="mt-5 space-y-4 border-t border-qb-border pt-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                          Reversal date
                        </span>
                        <input
                          type="date"
                          value={reversalDate}
                          onChange={(e) => setReversalDate(e.target.value)}
                          className={fieldClass}
                        />
                      </label>
                      <label className="block space-y-1.5 sm:col-span-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                          Reversal memo (optional)
                        </span>
                        <input
                          value={reversalMemo}
                          onChange={(e) => setReversalMemo(e.target.value)}
                          className={fieldClass}
                          placeholder="Shown on the new journal entry"
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={reversing}
                        className="inline-flex items-center gap-2 rounded-sm border border-qb-border bg-white px-5 py-2 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                      >
                        {reversing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}
                        Post reversal
                      </button>
                      <button
                        type="button"
                        onClick={() => setReverseEntry(null)}
                        className="rounded-sm border border-transparent px-4 py-2 text-sm font-medium text-qb-muted hover:text-qb-heading"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}

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
