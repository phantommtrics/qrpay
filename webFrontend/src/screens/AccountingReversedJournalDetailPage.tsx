import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2, RotateCcw } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { Toast, type ToastVariant } from '../components/ui/Toast'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  fetchJournalEntryReversalDetail,
  postJournalReversal,
  type JournalReversalDetail,
} from '../services/journalApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

function todayDateInput(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateInputToIso(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`)
  return d.toISOString()
}

function decStr(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export function AccountingReversedJournalDetailPage() {
  const { journalEntryId } = useParams<{ journalEntryId: string }>()
  const navigate = useNavigate()
  const { canAccess, currentOrganization } = useAuth()
  const businessId = currentOrganization?.id
  const allowed = canAccess('accounting.journals.reversal')

  const [detail, setDetail] = useState<JournalReversalDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [postedAt, setPostedAt] = useState(todayDateInput)
  const [memo, setMemo] = useState('')
  const [submitBusy, setSubmitBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null)

  const load = useCallback(() => {
    if (!businessId || !journalEntryId || !allowed) return
    setLoading(true)
    void fetchJournalEntryReversalDetail(businessId, journalEntryId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [businessId, journalEntryId, allowed])

  useEffect(() => {
    load()
  }, [load])

  const dismissToast = useCallback(() => setToast(null), [])

  const submitReverse = async (e: FormEvent) => {
    e.preventDefault()
    if (!businessId || !journalEntryId || !detail?.canReverse) return
    setSubmitBusy(true)
    setToast(null)
    try {
      await postJournalReversal(businessId, journalEntryId, {
        postedAt: dateInputToIso(postedAt),
        memo: memo.trim() || null,
      })
      setToast({ message: 'Reversal journal posted.', variant: 'success' })
      navigate(APP_PATHS.accountingJournalsReversed)
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not post reversal.'
      setToast({ message: msg, variant: 'error' })
    } finally {
      setSubmitBusy(false)
    }
  }

  if (!businessId) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <p className="text-slate-500">Select a business.</p>
        </PageCard>
      </PageTransition>
    )
  }

  if (!allowed) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <p className="text-slate-600">Your plan does not include reversed journal access.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const fieldInput =
    'w-full rounded-sm border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading placeholder:text-qb-muted/60 focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

  return (
    <PageTransition>
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant ?? 'success'}
        onDismiss={dismissToast}
      />
      <div className="space-y-5 py-2 lg:space-y-6">
        <PageCard
          variant="default"
          className="space-y-4 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <Link
            to={APP_PATHS.accountingJournalsReversed}
            className="inline-flex items-center text-sm font-medium text-qb-muted hover:text-qb-heading"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to journal list
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">Reverse journal entry</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-qb-muted">
              Review the lines below. Posting a reversal creates a new entry with debits and credits
              swapped on the same accounts.
            </p>
          </div>
        </PageCard>

        <PageCard
          variant="default"
          className="rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          {loading ? (
            <div className="flex items-center gap-2 text-qb-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : !detail ? (
            <p className="text-sm text-red-700">Could not load this entry.</p>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-4 text-sm text-qb-muted">
                <span className="font-mono text-xs">ID: {detail.entry.id}</span>
                {detail.entry.sourceType ? (
                  <span>
                    Type: <span className="font-mono text-qb-heading">{detail.entry.sourceType}</span>
                  </span>
                ) : null}
              </div>
              {detail.blockReason ? (
                <p className="rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
                  {detail.blockReason}
                </p>
              ) : null}
              <div className="overflow-x-auto rounded-sm border border-qb-border">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-qb-border bg-qb-surface text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      <th className="px-3 py-2.5">Account</th>
                      <th className="px-3 py-2.5 text-right">Debit</th>
                      <th className="px-3 py-2.5 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-qb-border">
                    {detail.entry.lines.map((ln) => (
                      <tr key={ln.id} className="align-top">
                        <td className="px-3 py-2.5 text-qb-heading">
                          {ln.chartOfAccount.code} — {ln.chartOfAccount.name}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatMoney(decStr(ln.debitAmount), { decimals: 2 })}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatMoney(decStr(ln.creditAmount), { decimals: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-qb-muted">
                The reversal will post the same amounts with debit and credit swapped on each line.
              </p>
              {detail.canReverse ? (
                <form
                  onSubmit={(e) => void submitReverse(e)}
                  className="space-y-4 border-t border-qb-border pt-6"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                        Reversal date
                      </span>
                      <input
                        type="date"
                        value={postedAt}
                        onChange={(e) => setPostedAt(e.target.value)}
                        className={fieldInput}
                      />
                    </label>
                    <label className="block space-y-1.5 sm:col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                        Reversal memo (optional)
                      </span>
                      <input
                        value={memo}
                        onChange={(e) => setMemo(e.target.value)}
                        className={fieldInput}
                        placeholder="Shown on the new journal entry"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={submitBusy}
                      className="inline-flex items-center gap-2 rounded-sm border border-qb-border bg-white px-5 py-2 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                    >
                      {submitBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      Post reversal
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(APP_PATHS.accountingJournalsReversed)}
                      className="rounded-sm border border-transparent px-4 py-2 text-sm font-medium text-qb-muted hover:text-qb-heading"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          )}
        </PageCard>
      </div>
    </PageTransition>
  )
}
