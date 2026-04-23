import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ExternalLink, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ContactSearchCombobox } from '../components/ui/ContactSearchCombobox'
import { LineNarrationTextarea, QB_LINE_NARRATION_SHELL } from '../components/ui/LineNarrationTextarea'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { SearchableSelect, type SearchableSelectOption } from '../components/ui/SearchableSelect'
import { Toast, type ToastVariant } from '../components/ui/Toast'
import { APP_PATHS, salesQuotationDetailPath } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { fetchAccountingSummary, type AccountingAccountRow } from '../services/accountingApi'
import { ApiError } from '../services/subscriptionApi'
import {
  acceptSalesQuotation,
  createSalesQuotation,
  fetchSalesQuotations,
  patchSalesQuotation,
  rejectSalesQuotation,
  sendSalesQuotation,
  type SalesQuotationRow,
} from '../services/salesDocumentsApi'
import { formatMoney } from '../utils/formatMoney'

type Tab = 'new' | 'list'

type LineDraft = {
  id: string
  narration: string
  unitLabel: string
  quantity: string
  unitAmount: string
  taxAmount: string
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
    narration: '',
    unitLabel: '',
    quantity: '1',
    unitAmount: '',
    taxAmount: '0',
    chartOfAccountId: '',
  }
}

function parseNum(s: string): number {
  const n = Number.parseFloat(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function lineTotal(l: LineDraft): number {
  return parseNum(l.quantity) * parseNum(l.unitAmount) + parseNum(l.taxAmount)
}

function totalWithTax(lines: LineDraft[]): number {
  return lines.reduce((s, l) => s + lineTotal(l), 0)
}

function docLineTotal(l: SalesQuotationRow['lines'][0]): number {
  return l.quantity * l.unitAmount + l.taxAmount
}

function quotationTotal(q: SalesQuotationRow): number {
  return q.lines.reduce((s, l) => s + docLineTotal(l), 0)
}

function dateInputToIso(dateStr: string): string | null {
  if (!dateStr?.trim()) return null
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

function statusBadge(status: string) {
  const base =
    'inline-flex rounded-sm px-2 py-0.5 text-xs font-semibold uppercase tracking-wide'
  switch (status) {
    case 'DRAFT':
      return <span className={`${base} bg-slate-100 text-slate-700`}>Draft</span>
    case 'SENT':
      return <span className={`${base} bg-sky-100 text-sky-800`}>Sent</span>
    case 'ACCEPTED':
      return <span className={`${base} bg-emerald-100 text-emerald-800`}>Accepted</span>
    case 'REJECTED':
      return <span className={`${base} bg-red-100 text-red-800`}>Rejected</span>
    default:
      return <span className={`${base} bg-qb-surface text-qb-muted`}>{status}</span>
  }
}

export function SalesQuotationsPage() {
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id

  const [tab, setTab] = useState<Tab>('new')
  const [accounts, setAccounts] = useState<AccountingAccountRow[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)

  const [reference, setReference] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [contactId, setContactId] = useState('')
  const [contactInput, setContactInput] = useState('')
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine()])

  const [listRows, setListRows] = useState<SalesQuotationRow[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null)

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

  const loadList = useCallback(() => {
    if (!businessId) return
    setLoadingList(true)
    void fetchSalesQuotations(businessId)
      .then(setListRows)
      .catch(() => setListRows([]))
      .finally(() => setLoadingList(false))
  }, [businessId])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  useEffect(() => {
    if (tab === 'list' && businessId) loadList()
  }, [tab, businessId, loadList])

  const resetForm = () => {
    setReference('')
    setValidUntil('')
    setContactId('')
    setContactInput('')
    setLines([newLine()])
    setEditingQuotationId(null)
  }

  const hydrateFromQuotation = useCallback((q: SalesQuotationRow) => {
    setReference(q.reference ?? '')
    setValidUntil(q.validUntil ? q.validUntil.slice(0, 10) : '')
    setContactId(q.contactId)
    setContactInput(q.contact.name)
    const ordered = [...q.lines].sort((a, b) => a.sortOrder - b.sortOrder)
    setLines(
      ordered.length
        ? ordered.map((l) => ({
            id: newLineId(),
            narration: l.narration,
            unitLabel: l.unitLabel ?? '',
            quantity: String(l.quantity),
            unitAmount: String(l.unitAmount),
            taxAmount: String(l.taxAmount),
            chartOfAccountId: l.chartOfAccountId,
          }))
        : [newLine()],
    )
  }, [])

  const startEditQuotation = (q: SalesQuotationRow) => {
    setEditingQuotationId(q.id)
    hydrateFromQuotation(q)
    setTab('new')
    setError(null)
    setToast(null)
  }

  const cancelEdit = () => {
    resetForm()
    setError(null)
    setToast(null)
  }

  const updateLine = (id: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!businessId) return
    setError(null)
    setToast(null)

    if (!contactId) {
      reportError('Select a contact from the list or use Add contact.')
      return
    }

    const payloadLines = lines
      .map((l) => ({
        chartOfAccountId: l.chartOfAccountId,
        narration: l.narration.trim() || undefined,
        quantity: parseNum(l.quantity),
        unitLabel: l.unitLabel.trim() || null,
        unitAmount: parseNum(l.unitAmount),
        taxAmount: parseNum(l.taxAmount),
      }))
      .filter((l) => l.chartOfAccountId && l.quantity > 0 && l.unitAmount >= 0)

    if (payloadLines.length === 0) {
      reportError('Add at least one line with an account, quantity, and unit amount.')
      return
    }

    setBusy(true)
    try {
      if (editingQuotationId) {
        await patchSalesQuotation(businessId, editingQuotationId, {
          contactId,
          reference: reference.trim() || null,
          validUntil: dateInputToIso(validUntil),
          lines: payloadLines,
        })
        setToast({ message: 'Quotation updated.', variant: 'success' })
      } else {
        await createSalesQuotation(businessId, {
          contactId,
          reference: reference.trim() || null,
          validUntil: dateInputToIso(validUntil),
          lines: payloadLines,
        })
        setToast({ message: 'Quotation created.', variant: 'success' })
      }
      resetForm()
      loadList()
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : editingQuotationId
              ? 'Could not update quotation.'
              : 'Could not create quotation.'
      reportError(msg)
    } finally {
      setBusy(false)
    }
  }

  const runRow = async (id: string, fn: () => Promise<unknown>, successMessage = 'Updated.') => {
    if (!businessId) return
    setRowBusy(id)
    setError(null)
    setToast(null)
    try {
      await fn()
      setToast({ message: successMessage, variant: 'success' })
      loadList()
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Action failed.'
      reportError(msg)
    } finally {
      setRowBusy(null)
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
  const tt = totalWithTax(lines)

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
            <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">Sales quotations</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-qb-muted">
              Build quotes with revenue lines on your chart of accounts. Send to the customer, then accept
              to create a draft sales invoice or reject to close the quote.
            </p>
          </div>

          <div className="flex flex-wrap gap-0 border-b border-qb-border">
            {(
              [
                ['new', 'New'],
                ['list', 'List'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setTab(k)
                  setError(null)
                  setToast(null)
                }}
                className={`relative -mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === k
                    ? 'border-qb-primary text-qb-heading'
                    : 'border-transparent text-qb-muted hover:border-qb-border hover:text-qb-heading'
                }`}
              >
                {label}
              </button>
            ))}
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

        {tab === 'new' ? (
          <PageCard
            variant="default"
            className="space-y-6 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
          >
            {editingQuotationId ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                <p>
                  Editing{' '}
                  <span className="font-mono font-semibold">
                    {listRows.find((r) => r.id === editingQuotationId)?.publicCode ?? 'quotation'}
                  </span>
                  — draft only can be edited.
                </p>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-sm border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-sm hover:bg-amber-50"
                >
                  Cancel edit
                </button>
              </div>
            ) : null}
            <form noValidate onSubmit={(e) => void submitCreate(e)} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-1">
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
                    label="Customer"
                    listMaxHeightClass={ACCOUNT_LIST_MAX}
                  />
                </div>
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
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    Valid until
                  </span>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className={fieldInput}
                  />
                </label>
              </div>

              <div className="overflow-x-auto rounded-sm border border-qb-border bg-white">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-qb-border bg-qb-surface text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      <th className="px-2 py-2.5 pr-2">Narration</th>
                      <th className="px-2 py-2.5 pr-2">Unit</th>
                      <th className="px-2 py-2.5 pr-2">Qty</th>
                      <th className="px-2 py-2.5 pr-2">Unit amt</th>
                      <th className="px-2 py-2.5 pr-2">Tax</th>
                      <th className="px-2 py-2.5 pr-2 text-right">Line total</th>
                      <th className="px-2 py-2.5 pr-2">Account</th>
                      <th className="w-10 px-1 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-qb-border">
                    {lines.map((l) => (
                      <tr key={l.id} className="align-top hover:bg-qb-surface/40">
                        <td className="max-w-[min(28rem,42vw)] min-w-[10rem] p-2 pr-2 align-top">
                          <div className={QB_LINE_NARRATION_SHELL}>
                            <LineNarrationTextarea
                              value={l.narration}
                              onValueChange={(narration) => updateLine(l.id, { narration })}
                              placeholder="Description"
                              ariaLabel="Line narration"
                            />
                          </div>
                        </td>
                        <td className="p-2 pr-2">
                          <input
                            value={l.unitLabel}
                            onChange={(e) => updateLine(l.id, { unitLabel: e.target.value })}
                            className="w-16 rounded-sm border border-qb-border bg-white px-2 py-1.5 text-xs text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35"
                            placeholder="—"
                          />
                        </td>
                        <td className="p-2 pr-2">
                          <input
                            value={l.quantity}
                            onChange={(e) => updateLine(l.id, { quantity: e.target.value })}
                            className="w-16 rounded-sm border border-qb-border bg-white px-2 py-1.5 text-xs tabular-nums text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35"
                          />
                        </td>
                        <td className="p-2 pr-2">
                          <input
                            value={l.unitAmount}
                            onChange={(e) => updateLine(l.id, { unitAmount: e.target.value })}
                            className="w-24 rounded-sm border border-qb-border bg-white px-2 py-1.5 text-xs tabular-nums text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35"
                          />
                        </td>
                        <td className="p-2 pr-2">
                          <input
                            value={l.taxAmount}
                            onChange={(e) => updateLine(l.id, { taxAmount: e.target.value })}
                            className="w-20 rounded-sm border border-qb-border bg-white px-2 py-1.5 text-xs tabular-nums text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35"
                          />
                        </td>
                        <td className="p-2 pr-2 text-right tabular-nums font-medium text-qb-heading">
                          {formatMoney(lineTotal(l), { decimals: 2 })}
                        </td>
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
                        <td className="p-2">
                          <button
                            type="button"
                            onClick={() =>
                              lines.length > 1 && setLines((p) => p.filter((x) => x.id !== l.id))
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
                <p className="text-sm tabular-nums text-qb-heading">
                  Total (incl. tax){' '}
                  <span className="text-lg font-semibold">{formatMoney(tt, { decimals: 2 })}</span>
                </p>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-sm border border-qb-border bg-white px-6 py-2.5 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                >
                  {busy ? 'Saving…' : editingQuotationId ? 'Save changes' : 'Create quotation'}
                </button>
              </div>
            </form>
          </PageCard>
        ) : (
          <PageCard
            variant="default"
            className="space-y-4 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
          >
            {loadingList ? (
              <div className="flex items-center gap-2 py-8 text-qb-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading…
              </div>
            ) : listRows.length === 0 ? (
              <p className="py-8 text-sm text-qb-muted">No quotations yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-qb-border text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      <th className="py-2 pr-3">Code</th>
                      <th className="py-2 pr-3">Contact</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Valid until</th>
                      <th className="py-2 pr-3 text-right">Total</th>
                      <th className="py-2 pr-3">Invoice</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-qb-border">
                    {listRows.map((q) => {
                      const canSend = q.status === 'DRAFT'
                      const canEdit = q.status === 'DRAFT'
                      const canAcceptReject =
                        q.status !== 'ACCEPTED' && q.status !== 'REJECTED' && !q.invoiceFromQuote
                      const busyThis = rowBusy === q.id
                      return (
                        <tr key={q.id} className="align-top">
                          <td className="py-3 pr-3 font-medium text-qb-heading">{q.publicCode}</td>
                          <td className="py-3 pr-3 text-qb-heading">{q.contact.name}</td>
                          <td className="py-3 pr-3">{statusBadge(q.status)}</td>
                          <td className="py-3 pr-3 tabular-nums text-qb-muted">
                            {q.validUntil
                              ? new Date(q.validUntil).toLocaleDateString()
                              : '—'}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums font-medium text-qb-heading">
                            {formatMoney(quotationTotal(q), { decimals: 2 })} {q.currency}
                          </td>
                          <td className="py-3 pr-3 text-qb-muted">
                            {q.invoiceFromQuote ? q.invoiceFromQuote.publicCode : '—'}
                          </td>
                          <td className="py-3">
                            <div className="flex flex-wrap gap-2">
                              <Link
                                to={salesQuotationDetailPath(q.id)}
                                className="inline-flex items-center gap-1 rounded-sm border border-qb-border bg-white px-2.5 py-1 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                View
                              </Link>
                              {canEdit ? (
                                <button
                                  type="button"
                                  disabled={busyThis}
                                  onClick={() => startEditQuotation(q)}
                                  className="inline-flex items-center gap-1 rounded-sm border border-qb-border bg-white px-2.5 py-1 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                              ) : null}
                              {canSend ? (
                                <button
                                  type="button"
                                  disabled={busyThis}
                                  onClick={() =>
                                    void runRow(q.id, () => sendSalesQuotation(businessId, q.id))
                                  }
                                  className="rounded-sm border border-qb-border bg-white px-2.5 py-1 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                                >
                                  Send
                                </button>
                              ) : null}
                              {canAcceptReject ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={busyThis}
                                    onClick={() =>
                                      void runRow(
                                        q.id,
                                        () => acceptSalesQuotation(businessId, q.id),
                                        'Draft sales invoice created from quotation.',
                                      )
                                    }
                                    className="rounded-sm border border-qb-border bg-white px-2.5 py-1 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                                  >
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyThis}
                                    onClick={() =>
                                      void runRow(q.id, () => rejectSalesQuotation(businessId, q.id))
                                    }
                                    className="rounded-sm border border-qb-border bg-white px-2.5 py-1 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-50"
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </PageCard>
        )}
      </div>
    </PageTransition>
  )
}
