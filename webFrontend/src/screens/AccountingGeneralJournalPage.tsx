import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ContactSearchCombobox } from '../components/ui/ContactSearchCombobox'
import { LineNarrationTextarea, QB_LINE_NARRATION_SHELL } from '../components/ui/LineNarrationTextarea'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { SearchableSelect, type SearchableSelectOption } from '../components/ui/SearchableSelect'
import { Toast, type ToastVariant } from '../components/ui/Toast'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { fetchAccountingSummary, type AccountingAccountRow } from '../services/accountingApi'
import { postGeneralJournal } from '../services/journalApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

type LineDraft = {
  id: string
  description: string
  debit: string
  credit: string
  chartOfAccountId: string
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

function newLine(): LineDraft {
  return {
    id: newLineId(),
    description: '',
    debit: '',
    credit: '',
    chartOfAccountId: '',
  }
}

function parseNum(s: string): number {
  const n = Number.parseFloat(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

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

function accountsToOptions(accounts: AccountingAccountRow[]): SearchableSelectOption[] {
  return accounts.map((a) => ({
    value: a.id,
    label: `${a.code} — ${a.name}`,
    hint: a.description ?? undefined,
  }))
}

const QB_SELECT_TABLE =
  '!rounded-sm !border-qb-border !px-2 !py-1.5 !text-xs !font-normal !text-qb-heading !shadow-sm focus:!border-qb-primary focus:!ring-1 focus:!ring-qb-primary/35'
const QB_DROPDOWN = '!rounded-md !border-qb-border'
const ACCOUNT_LIST_MAX = 'max-h-[7.5rem]'

function lineIsValid(l: LineDraft): boolean {
  const dr = parseNum(l.debit)
  const cr = parseNum(l.credit)
  const oneSide = (dr > 0 && cr === 0) || (cr > 0 && dr === 0)
  return Boolean(l.chartOfAccountId && oneSide)
}

export function AccountingGeneralJournalPage() {
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id

  const [accounts, setAccounts] = useState<AccountingAccountRow[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)

  const [postedAt, setPostedAt] = useState(todayDateInput)
  const [reference, setReference] = useState('')
  const [memo, setMemo] = useState('')

  const [contactId, setContactId] = useState('')
  const [contactInput, setContactInput] = useState('')

  const [lines, setLines] = useState<LineDraft[]>(() => [newLine(), newLine()])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null)

  const dismissToast = useCallback(() => setToast(null), [])

  const reportError = useCallback((msg: string) => {
    setError(msg)
    setToast({ message: msg, variant: 'error' })
  }, [])

  const lineAccountOptions = useMemo(
    () => [...accounts].sort((a, b) => a.code.localeCompare(b.code)),
    [accounts],
  )

  const lineSelectOptions = useMemo(() => accountsToOptions(lineAccountOptions), [lineAccountOptions])

  const loadAccounts = useCallback(() => {
    if (!businessId) return
    setLoadingAccounts(true)
    void fetchAccountingSummary(businessId)
      .then((d) => setAccounts(d.accounts))
      .catch(() => setAccounts([]))
      .finally(() => setLoadingAccounts(false))
  }, [businessId])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  const validLines = useMemo(() => lines.filter(lineIsValid), [lines])

  const { totalDebit, totalCredit } = useMemo(() => {
    let td = 0
    let tc = 0
    for (const l of validLines) {
      td += parseNum(l.debit)
      tc += parseNum(l.credit)
    }
    return { totalDebit: td, totalCredit: tc }
  }, [validLines])

  const balanced = Math.abs(totalDebit - totalCredit) < 0.005
  const canSubmit = validLines.length >= 2 && balanced && !busy

  const resetForm = () => {
    setPostedAt(todayDateInput())
    setReference('')
    setMemo('')
    setContactId('')
    setContactInput('')
    setLines([newLine(), newLine()])
  }

  const updateLine = (id: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const onDebitChange = (id: string, value: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, debit: value, credit: value.trim() ? '' : l.credit } : l,
      ),
    )
  }

  const onCreditChange = (id: string, value: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, credit: value, debit: value.trim() ? '' : l.debit } : l,
      ),
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!businessId) return
    setError(null)
    setToast(null)

    if (!postedAt?.trim()) {
      reportError('Select a date.')
      return
    }

    if (validLines.length < 2) {
      reportError('Add at least two lines with an account and either a debit or a credit amount.')
      return
    }

    if (!balanced) {
      reportError('Total debits must equal total credits.')
      return
    }

    const payloadLines = validLines.map((l) => ({
      chartOfAccountId: l.chartOfAccountId,
      description: l.description.trim() || null,
      debit: parseNum(l.debit),
      credit: parseNum(l.credit),
    }))

    setBusy(true)
    try {
      await postGeneralJournal(businessId, {
        postedAt: dateInputToIso(postedAt),
        reference: reference.trim() || null,
        memo: memo.trim() || null,
        contactId: contactId.trim() || null,
        newContactName: null,
        newContactEmail: null,
        newContactPhone: null,
        lines: payloadLines,
      })
      setError(null)
      setToast({ message: 'Journal posted successfully.', variant: 'success' })
      resetForm()
      loadAccounts()
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not post journal.'
      reportError(msg)
    } finally {
      setBusy(false)
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
            to={APP_PATHS.accounting}
            className="inline-flex items-center text-sm font-medium text-qb-muted hover:text-qb-heading"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">General journal</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-qb-muted">
              Post a balanced entry with debit and credit lines only — no automatic cash or bank
              settlement. Each line must have either a debit or a credit (not both).
            </p>
          </div>
        </PageCard>

        {loadingAccounts ? (
          <PageCard
            variant="default"
            className="flex items-center gap-2 rounded-md border-qb-border py-10 text-qb-muted shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
          >
            <Loader2 className="h-5 w-5 animate-spin text-qb-muted" />
            Loading accounts…
          </PageCard>
        ) : null}

        {error ? (
          <PageCard
            variant="default"
            className="rounded-md border-red-200 bg-red-50/80 p-4 shadow-[0_1px_2px_rgba(57,58,61,0.06)]"
          >
            <p className="text-sm font-medium text-red-800">{error}</p>
          </PageCard>
        ) : null}

        <PageCard
          variant="default"
          className="space-y-6 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <form noValidate onSubmit={(e) => void submit(e)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-1">
                <ContactSearchCombobox
                  businessId={businessId}
                  selectedId={contactId}
                  inputValue={contactInput}
                  onInputChange={(v) => {
                    setContactInput(v)
                    setContactId('')
                  }}
                  onSelectContact={(id, name) => {
                    setContactId(id)
                    setContactInput(name)
                  }}
                  label="Contact (optional)"
                  listMaxHeightClass={ACCOUNT_LIST_MAX}
                />
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Date</span>
                <input
                  type="date"
                  value={postedAt}
                  onChange={(e) => setPostedAt(e.target.value)}
                  className={fieldInput}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                  Reference
                </span>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className={fieldInput}
                  placeholder="Optional"
                />
              </label>
              <label className="block space-y-1.5 lg:col-span-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Memo</span>
                <input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className={fieldInput}
                  placeholder="Optional header memo"
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
                  {lines.map((l) => (
                    <tr key={l.id} className="align-top hover:bg-qb-surface/40">
                      <td className="py-2 pr-2">
                        <SearchableSelect
                          value={l.chartOfAccountId}
                          onChange={(id) => updateLine(l.id, { chartOfAccountId: id })}
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
                            value={l.description}
                            onValueChange={(description) => updateLine(l.id, { description })}
                            placeholder="Line description"
                            ariaLabel="Line description"
                          />
                        </div>
                      </td>
                      <td className="p-2 pr-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={l.debit}
                          onChange={(e) => onDebitChange(l.id, e.target.value)}
                          className="w-full rounded-sm border border-qb-border bg-white px-2 py-1.5 text-xs tabular-nums text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="p-2 pr-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={l.credit}
                          onChange={(e) => onCreditChange(l.id, e.target.value)}
                          className="w-full rounded-sm border border-qb-border bg-white px-2 py-1.5 text-xs tabular-nums text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() =>
                            lines.length > 2 && setLines((p) => p.filter((x) => x.id !== l.id))
                          }
                          className="rounded-sm p-1.5 text-qb-muted hover:bg-qb-surface hover:text-red-600"
                          aria-label="Remove line"
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
                  onClick={() => setLines((p) => [...p, newLine()])}
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
                {!balanced && validLines.length >= 2 ? (
                  <p className="text-sm font-medium text-amber-800">
                    Out of balance by {formatMoney(Math.abs(totalDebit - totalCredit), { decimals: 2 })}
                  </p>
                ) : null}
              </div>
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-sm border border-qb-border bg-white px-6 py-2.5 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
              >
                {busy ? 'Posting…' : 'Post journal'}
              </button>
            </div>
          </form>
        </PageCard>
      </div>
    </PageTransition>
  )
}
