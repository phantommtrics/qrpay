import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformAccountingChart,
  fetchPlatformJournalEntries,
  postPlatformJournalReverse,
  postPlatformManualJournal,
  type PlatformChartAccountDetail,
  type PlatformJournalEntryRow,
} from '../../services/subscriptionApi'
import { formatMoney } from '../../utils/formatMoney'

type LineDraft = {
  chartOfAccountId: string
  debit: string
  credit: string
  description: string
}

function emptyLine(): LineDraft {
  return { chartOfAccountId: '', debit: '', credit: '', description: '' }
}

export function PlatformOperatorJournalsPage() {
  const { canAccess } = useAuth()
  const allowed =
    canAccess('platform.accounting.view') || canAccess('platform.accounting.journals.access')
  const canCreate =
    canAccess('platform.accounting.create') || canAccess('platform.accounting.journals.post')
  const canReverse = canAccess('platform.accounting.journals.reverse')

  const [accounts, setAccounts] = useState<PlatformChartAccountDetail[]>([])
  const [entries, setEntries] = useState<PlatformJournalEntryRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [postedAt, setPostedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [memo, setMemo] = useState('')
  const [reference, setReference] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(), emptyLine()])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadAccounts = useCallback(() => {
    void fetchPlatformAccountingChart()
      .then(setAccounts)
      .catch(() => setAccounts([]))
  }, [])

  const loadEntries = useCallback(() => {
    setLoading(true)
    setError(null)
    void fetchPlatformJournalEntries(page, pageSize, { scope: 'operator' })
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
    loadAccounts()
  }, [loadAccounts])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const addLine = () => setLines((p) => [...p, emptyLine()])
  const removeLine = (i: number) => {
    if (lines.length <= 2) return
    setLines((p) => p.filter((_, j) => j !== i))
  }

  const submitManual = async () => {
    setFormError(null)
    const parsed = lines.map((l) => ({
      chartOfAccountId: l.chartOfAccountId.trim(),
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
      description: l.description.trim() || null,
    }))
    if (parsed.some((l) => !l.chartOfAccountId)) {
      setFormError('Each line needs an account.')
      return
    }
    if (parsed.some((l) => (l.debit > 0 && l.credit > 0) || (l.debit === 0 && l.credit === 0))) {
      setFormError('Each line must have either a debit or a credit (not both, not neither).')
      return
    }
    setSubmitting(true)
    try {
      await postPlatformManualJournal({
        postedAt,
        memo: memo.trim() || null,
        reference: reference.trim() || null,
        lines: parsed,
      })
      setMemo('')
      setReference('')
      setLines([emptyLine(), emptyLine()])
      loadEntries()
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not post journal.')
    } finally {
      setSubmitting(false)
    }
  }

  const fieldClass =
    'rounded-sm border border-qb-border bg-white px-2 py-1.5 text-sm text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

  if (!allowed) {
    return (
      <PageTransition>
        <PageCard variant="default" className="rounded-md border-qb-border p-5">
          <p className="text-sm text-qb-muted">You do not have access to operator journals.</p>
        </PageCard>
      </PageTransition>
    )
  }

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
          <h1 className="mt-3 text-2xl font-semibold text-qb-heading">Operator journals</h1>
          <p className="mt-2 text-sm text-qb-muted">
            Manual journals and reversals on the DPay platform chart of accounts. Merchant business postings
            are under{' '}
            <Link
              to={APP_PATHS.platformAccountingMerchantJournalEntries}
              className="font-medium text-qb-heading underline-offset-2 hover:underline"
            >
              Transaction journal
            </Link>
            . All platform GL activity including automation is under{' '}
            <Link
              to={APP_PATHS.platformAccountingJournals}
              className="font-medium text-qb-heading underline-offset-2 hover:underline"
            >
              Journal entries
            </Link>
            .
          </p>
        </PageCard>

        {canCreate ? (
          <PageCard variant="default" className="space-y-4 rounded-md border-qb-border p-5">
            <h2 className="text-lg font-semibold text-qb-heading">Post manual journal</h2>
            {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
            <div className="flex flex-wrap gap-4">
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase text-qb-muted">Posted date</span>
                <input
                  type="date"
                  value={postedAt}
                  onChange={(e) => setPostedAt(e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="min-w-[10rem] flex-1 space-y-1">
                <span className="text-xs font-semibold uppercase text-qb-muted">Reference</span>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className={`${fieldClass} w-full`}
                  placeholder="Optional"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase text-qb-muted">Memo</span>
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className={`${fieldClass} w-full`}
                placeholder="What this entry is for"
              />
            </label>
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-end gap-2 rounded-sm border border-qb-border bg-qb-surface/30 p-3"
                >
                  <select
                    value={line.chartOfAccountId}
                    onChange={(e) => {
                      const v = e.target.value
                      setLines((p) =>
                        p.map((x, j) => (j === i ? { ...x, chartOfAccountId: v } : x)),
                      )
                    }}
                    className={`${fieldClass} min-w-[12rem] flex-1`}
                  >
                    <option value="">Account…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Debit"
                    value={line.debit}
                    onChange={(e) =>
                      setLines((p) =>
                        p.map((x, j) => (j === i ? { ...x, debit: e.target.value } : x)),
                      )
                    }
                    className={`${fieldClass} w-24 tabular-nums`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Credit"
                    value={line.credit}
                    onChange={(e) =>
                      setLines((p) =>
                        p.map((x, j) => (j === i ? { ...x, credit: e.target.value } : x)),
                      )
                    }
                    className={`${fieldClass} w-24 tabular-nums`}
                  />
                  <input
                    placeholder="Line description"
                    value={line.description}
                    onChange={(e) =>
                      setLines((p) =>
                        p.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                      )
                    }
                    className={`${fieldClass} min-w-[8rem] flex-1`}
                  />
                  {lines.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="text-xs text-qb-muted hover:text-red-600"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addLine}
                className="rounded-sm border border-qb-border bg-white px-3 py-2 text-sm font-medium text-qb-heading hover:bg-qb-surface"
              >
                Add line
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitManual()}
                className="rounded-sm border border-qb-border bg-white px-4 py-2 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
              >
                {submitting ? 'Posting…' : 'Post journal'}
              </button>
            </div>
          </PageCard>
        ) : null}

        <PageCard variant="default" className="rounded-md border-qb-border p-5">
          <h2 className="text-lg font-semibold text-qb-heading">Platform ledger — operator entries</h2>
          <p className="mt-1 text-sm text-qb-muted">
            Manual journals and reversals on the DPay platform chart of accounts (not merchant businesses).
          </p>
          {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-qb-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : null}
          {!loading && entries.length === 0 ? (
            <p className="py-6 text-sm text-qb-muted">No operator journal entries yet.</p>
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
