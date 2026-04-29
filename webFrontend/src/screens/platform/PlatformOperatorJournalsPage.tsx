import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { LineNarrationTextarea, QB_LINE_NARRATION_SHELL } from '../../components/ui/LineNarrationTextarea'
import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { SearchableSelect, type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import { Toast, type ToastVariant } from '../../components/ui/Toast'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformAccountingChart,
  fetchPlatformJournalEntries,
  postPlatformManualJournal,
  type PlatformChartAccountDetail,
  type PlatformJournalEntryRow,
} from '../../services/subscriptionApi'
import { formatMoney } from '../../utils/formatMoney'

type LineDraft = {
  id: string
  chartOfAccountId: string
  debit: string
  credit: string
  description: string
}

function newLineId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint8Array(16)
    c.getRandomValues(buf)
    buf[6] = (buf[6] & 0x0f) | 0x40
    buf[8] = (buf[8] & 0x3f) | 0x80
    const h = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`
}

function emptyLine(): LineDraft {
  return { id: newLineId(), chartOfAccountId: '', debit: '', credit: '', description: '' }
}

function parseNum(value: string): number {
  const n = Number.parseFloat(value.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function accountOptions(accounts: PlatformChartAccountDetail[]): SearchableSelectOption[] {
  return accounts
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((a) => ({
      value: a.id,
      label: `${a.code} — ${a.name}`,
      hint: a.description ?? undefined,
    }))
}

const QB_SELECT_TABLE =
  '!rounded-sm !border-qb-border !px-2 !py-1.5 !text-xs !font-normal !text-qb-heading !shadow-sm focus:!border-qb-primary focus:!ring-1 focus:!ring-qb-primary/35'
const QB_DROPDOWN = '!rounded-md !border-qb-border'
const ACCOUNT_LIST_MAX = 'max-h-[7.5rem]'

export function PlatformOperatorJournalsPage() {
  const { canAccess } = useAuth()
  const allowed =
    canAccess('platform.accounting.view') || canAccess('platform.accounting.journals.access')
  const canCreate =
    canAccess('platform.accounting.create') || canAccess('platform.accounting.journals.post')

  const [accounts, setAccounts] = useState<PlatformChartAccountDetail[]>([])
  const [entries, setEntries] = useState<PlatformJournalEntryRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [postedAt, setPostedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [memo, setMemo] = useState('')
  const [reference, setReference] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(), emptyLine()])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null)

  const dismissToast = useCallback(() => setToast(null), [])
  const lineSelectOptions = useMemo(() => accountOptions(accounts), [accounts])
  const totalDebit = useMemo(() => lines.reduce((sum, l) => sum + parseNum(l.debit), 0), [lines])
  const totalCredit = useMemo(() => lines.reduce((sum, l) => sum + parseNum(l.credit), 0), [lines])
  const outOfBalance = Math.abs(totalDebit - totalCredit) >= 0.005

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

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const addLine = () => setLines((p) => [...p, emptyLine()])
  const removeLine = (id: string) => {
    if (lines.length <= 2) return
    setLines((p) => p.filter((line) => line.id !== id))
  }

  const updateLine = (id: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  }

  const onDebitChange = (id: string, value: string) => {
    setLines((prev) =>
      prev.map((line) =>
        line.id === id ? { ...line, debit: value, credit: value.trim() ? '' : line.credit } : line,
      ),
    )
  }

  const onCreditChange = (id: string, value: string) => {
    setLines((prev) =>
      prev.map((line) =>
        line.id === id ? { ...line, credit: value, debit: value.trim() ? '' : line.debit } : line,
      ),
    )
  }

  const submitManual = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setToast(null)
    const parsed = lines.map((l) => ({
      chartOfAccountId: l.chartOfAccountId.trim(),
      debit: parseNum(l.debit),
      credit: parseNum(l.credit),
      description: l.description.trim() || null,
    }))
    if (parsed.some((l) => !l.chartOfAccountId)) {
      const message = 'Each line needs an account.'
      setFormError(message)
      setToast({ message, variant: 'error' })
      return
    }
    if (parsed.some((l) => (l.debit > 0 && l.credit > 0) || (l.debit === 0 && l.credit === 0))) {
      const message = 'Each line must have either a debit or a credit (not both, not neither).'
      setFormError(message)
      setToast({ message, variant: 'error' })
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
      setToast({ message: 'Journal posted successfully.', variant: 'success' })
      loadEntries()
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not post journal.'
      setFormError(message)
      setToast({ message, variant: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const fieldClass =
    'w-full rounded-sm border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading placeholder:text-qb-muted/60 focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

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
            to={APP_PATHS.platformAccounting}
            className="inline-flex items-center text-sm font-medium text-qb-muted hover:text-qb-heading"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">Operator journals</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-qb-muted">
              Manual journals on the DirectPay platform chart of accounts. Reversals are handled from{' '}
              <Link
                to={APP_PATHS.platformAccountingOperatorMerchantJournals}
                className="font-medium text-qb-heading underline-offset-2 hover:underline"
              >
                Platform operator journal
              </Link>
              . Merchant business postings are under{' '}
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
          </div>
        </PageCard>

        {canCreate ? (
          <PageCard
            variant="default"
            className="space-y-6 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
          >
            <form noValidate onSubmit={(e) => void submitManual(e)} className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-qb-heading">Post manual journal</h2>
                <p className="mt-1 text-sm text-qb-muted">
                  Post a balanced platform operator entry with debit and credit lines.
                </p>
              </div>

              {formError ? (
                <div className="rounded-md border border-red-200 bg-red-50/80 p-3">
                  <p className="text-sm font-medium text-red-800">{formError}</p>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Date</span>
                  <input
                    type="date"
                    value={postedAt}
                    onChange={(e) => setPostedAt(e.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    Reference
                  </span>
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className={fieldClass}
                    placeholder="Optional"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Memo</span>
                  <input
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className={fieldClass}
                    placeholder="What this entry is for"
                  />
                </label>
              </div>

              <div className="overflow-x-auto rounded-sm border border-qb-border bg-white">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-qb-border bg-qb-surface text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      <th className="px-2 py-2.5 pr-2">Account</th>
                      <th className="px-2 py-2.5 pr-2">Description</th>
                      <th className="px-2 py-2.5 pr-2 text-right">Debit</th>
                      <th className="px-2 py-2.5 pr-2 text-right">Credit</th>
                      <th className="w-10 px-1 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-qb-border">
                    {lines.map((line) => (
                      <tr key={line.id} className="align-top hover:bg-qb-surface/40">
                        <td className="py-2 pr-2">
                          <SearchableSelect
                            value={line.chartOfAccountId}
                            onChange={(chartOfAccountId) => updateLine(line.id, { chartOfAccountId })}
                            options={lineSelectOptions}
                            placeholder="Account"
                            emptyMessage="No accounts"
                            noResultsMessage="No match"
                            buttonClassName={QB_SELECT_TABLE}
                            listMaxHeightClass={ACCOUNT_LIST_MAX}
                            dropdownClassName={QB_DROPDOWN}
                            className="min-w-[12rem]"
                          />
                        </td>
                        <td className="max-w-[min(28rem,42vw)] min-w-[10rem] p-2 pr-2 align-top">
                          <div className={QB_LINE_NARRATION_SHELL}>
                            <LineNarrationTextarea
                              value={line.description}
                              onValueChange={(description) => updateLine(line.id, { description })}
                              placeholder="Line description"
                              ariaLabel="Line description"
                            />
                          </div>
                        </td>
                        <td className="p-2 pr-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={line.debit}
                            onChange={(e) => onDebitChange(line.id, e.target.value)}
                            className="w-full rounded-sm border border-qb-border bg-white px-2 py-1.5 text-xs tabular-nums text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="p-2 pr-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={line.credit}
                            onChange={(e) => onCreditChange(line.id, e.target.value)}
                            className="w-full rounded-sm border border-qb-border bg-white px-2 py-1.5 text-xs tabular-nums text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="p-2">
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            className="rounded-sm p-1.5 text-qb-muted hover:bg-qb-surface hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Remove line"
                            disabled={lines.length <= 2}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-qb-border bg-qb-surface/50 px-2 py-2">
                  <button
                    type="button"
                    onClick={addLine}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-qb-heading underline decoration-qb-border underline-offset-2 hover:text-qb-muted"
                  >
                    <Plus className="h-4 w-4" />
                    Add line
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-4 border-t border-qb-border pt-5">
                <div className="space-y-1 text-sm tabular-nums">
                  <p className="text-qb-muted">
                    Total debits{' '}
                    <span className="font-semibold text-qb-heading">
                      {formatMoney(totalDebit, { decimals: 2 })}
                    </span>
                  </p>
                  <p className="text-qb-muted">
                    Total credits{' '}
                    <span className="font-semibold text-qb-heading">
                      {formatMoney(totalCredit, { decimals: 2 })}
                    </span>
                  </p>
                  {outOfBalance ? (
                    <p className="text-sm font-medium text-amber-800">
                      Out of balance by {formatMoney(Math.abs(totalDebit - totalCredit), { decimals: 2 })}
                    </p>
                  ) : null}
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-sm border border-qb-border bg-white px-6 py-2.5 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                >
                  {submitting ? 'Posting…' : 'Post journal'}
                </button>
              </div>
            </form>
          </PageCard>
        ) : null}

        <PageCard
          variant="default"
          className="rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <h2 className="text-lg font-semibold text-qb-heading">Platform ledger — operator entries</h2>
          <p className="mt-1 text-sm text-qb-muted">
            Manual journals on the DirectPay platform chart of accounts (not merchant businesses). Reverse
            posted entries from{' '}
            <Link
              to={APP_PATHS.platformAccountingOperatorMerchantJournals}
              className="font-medium text-qb-heading underline-offset-2 hover:underline"
            >
              Platform operator journal
            </Link>
            .
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
              <div key={e.id} className="overflow-hidden rounded-sm border border-qb-border bg-white">
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
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <tbody>
                      {e.lines.map((ln) => (
                        <tr key={ln.id} className="border-t border-qb-border hover:bg-qb-surface/40">
                          <td className="px-3 py-2 font-mono text-xs text-qb-muted">{ln.code}</td>
                          <td className="px-3 py-2 text-qb-heading">{ln.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-qb-heading">
                            {ln.debit > 0 ? formatMoney(ln.debit, { decimals: 2 }) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-qb-heading">
                            {ln.credit > 0 ? formatMoney(ln.credit, { decimals: 2 }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
