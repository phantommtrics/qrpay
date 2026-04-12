import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ExternalLink, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ContactSearchCombobox } from '../components/ui/ContactSearchCombobox'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { SearchableSelect, type SearchableSelectOption } from '../components/ui/SearchableSelect'
import { Toast, type ToastVariant } from '../components/ui/Toast'
import { APP_PATHS, salesInvoiceDetailPath } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { fetchAccountingSummary, type AccountingAccountRow } from '../services/accountingApi'
import { ApiError } from '../services/subscriptionApi'
import {
  approveSalesInvoice,
  createSalesInvoice,
  fetchSalesInvoices,
  markSalesInvoicePaid,
  patchSalesInvoice,
  voidSalesInvoice,
  type SalesInvoiceRow,
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

function subtotalExTax(lines: LineDraft[]): number {
  return lines.reduce((s, l) => s + parseNum(l.quantity) * parseNum(l.unitAmount), 0)
}

function totalWithTax(lines: LineDraft[]): number {
  return lines.reduce((s, l) => s + lineTotal(l), 0)
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

function linesTotalApi(lines: SalesInvoiceRow['lines']): number {
  return lines.reduce((s, l) => s + l.quantity * l.unitAmount + l.taxAmount, 0)
}

function formatShortDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString()
}

function invoiceStatusBadgeClass(status: string): string {
  const u = status.toUpperCase()
  if (u === 'DRAFT') return 'bg-slate-100 text-slate-700'
  if (u === 'APPROVED') return 'bg-sky-100 text-sky-800'
  if (u === 'PAID') return 'bg-emerald-100 text-emerald-800'
  if (u === 'VOID') return 'bg-red-100 text-red-800'
  return 'bg-slate-100 text-slate-600'
}

const QB_SELECT_TABLE =
  '!rounded-sm !border-qb-border !px-2 !py-1.5 !text-xs !font-normal !text-qb-heading !shadow-sm focus:!border-qb-primary focus:!ring-1 focus:!ring-qb-primary/35'
const QB_SELECT_FORM =
  '!rounded-sm !border-qb-border !px-3 !py-2 !text-sm !font-normal !text-qb-heading !shadow-sm focus:!border-qb-primary focus:!ring-1 focus:!ring-qb-primary/35'
const QB_DROPDOWN = '!rounded-md !border-qb-border'
const ACCOUNT_LIST_MAX = 'max-h-[7.5rem]'

export function SalesInvoicesPage() {
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id

  const [tab, setTab] = useState<Tab>('new')
  const [accounts, setAccounts] = useState<AccountingAccountRow[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)

  const [issueDate, setIssueDate] = useState(todayDateInput)
  const [dueDate, setDueDate] = useState('')
  const [reference, setReference] = useState('')
  /** Bank/cash asset for recording proceeds when the invoice is paid (wallet uses MERCHANT_WALLET_CLEARING in the journal). */
  const [settlementChartAccountId, setSettlementChartAccountId] = useState('')
  const [contactId, setContactId] = useState('')
  const [contactInput, setContactInput] = useState('')
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine()])

  const [rows, setRows] = useState<SalesInvoiceRow[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)

  const [payTarget, setPayTarget] = useState<SalesInvoiceRow | null>(null)
  const [paySettlementId, setPaySettlementId] = useState('')
  const [payPostedAt, setPayPostedAt] = useState(todayDateInput)
  const [payBusy, setPayBusy] = useState(false)

  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null)

  const dismissToast = useCallback(() => setToast(null), [])

  const reportError = useCallback((msg: string) => {
    setError(msg)
    setToast({ message: msg, variant: 'error' })
  }, [])

  const assetAccounts = useMemo(
    () => accounts.filter((a) => a.category === 'ASSET').sort((a, b) => a.code.localeCompare(b.code)),
    [accounts],
  )

  const assetSelectOptions = useMemo(() => accountsToOptions(assetAccounts), [assetAccounts])

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
    void fetchSalesInvoices(businessId)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoadingList(false))
  }, [businessId])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  useEffect(() => {
    if (tab === 'list' && businessId) loadList()
  }, [tab, businessId, loadList])

  const resetForm = () => {
    setIssueDate(todayDateInput())
    setDueDate('')
    setReference('')
    setSettlementChartAccountId('')
    setContactId('')
    setContactInput('')
    setLines([newLine()])
    setEditingInvoiceId(null)
  }

  const hydrateFromInvoice = useCallback((inv: SalesInvoiceRow) => {
    setIssueDate(inv.issueDate.slice(0, 10))
    setDueDate(inv.dueDate ? inv.dueDate.slice(0, 10) : '')
    setReference(inv.reference ?? '')
    setSettlementChartAccountId(inv.settlementChartAccountId ?? '')
    setContactId(inv.contactId)
    setContactInput(inv.contact.name)
    const ordered = [...inv.lines].sort((a, b) => a.sortOrder - b.sortOrder)
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

  const startEditInvoice = (inv: SalesInvoiceRow) => {
    setEditingInvoiceId(inv.id)
    hydrateFromInvoice(inv)
    setTab('new')
    setError(null)
    setToast(null)
    setPayTarget(null)
  }

  const cancelEdit = () => {
    resetForm()
    setError(null)
    setToast(null)
  }

  const updateLine = (id: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const openMarkPaid = (inv: SalesInvoiceRow) => {
    setPayTarget(inv)
    setPaySettlementId(inv.settlementChartAccountId ?? '')
    setPayPostedAt(todayDateInput())
    setError(null)
    setToast(null)
  }

  const submitMarkPaid = async (e: FormEvent) => {
    e.preventDefault()
    if (!businessId || !payTarget) return
    if (!paySettlementId) {
      reportError('Select a settlement account (cash or bank).')
      return
    }
    if (!payPostedAt?.trim()) {
      reportError('Select the payment date.')
      return
    }
    setPayBusy(true)
    setError(null)
    setToast(null)
    try {
      await markSalesInvoicePaid(businessId, payTarget.id, {
        settlementChartAccountId: paySettlementId,
        postedAt: dateInputToIso(payPostedAt),
      })
      setPayTarget(null)
      setToast({ message: 'Payment recorded; journal posted.', variant: 'success' })
      loadList()
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not mark paid.'
      reportError(msg)
    } finally {
      setPayBusy(false)
    }
  }

  const submitNew = async (e: FormEvent) => {
    e.preventDefault()
    if (!businessId) return
    setError(null)
    setToast(null)

    const payloadLines = lines
      .map((l) => ({
        chartOfAccountId: l.chartOfAccountId,
        narration: l.narration.trim(),
        quantity: parseNum(l.quantity),
        unitLabel: l.unitLabel.trim() || null,
        unitAmount: parseNum(l.unitAmount),
        taxAmount: parseNum(l.taxAmount),
      }))
      .filter((l) => l.chartOfAccountId && l.quantity > 0 && l.unitAmount >= 0)

    if (payloadLines.length === 0) {
      reportError('Add at least one line with an account, positive quantity, and amounts.')
      return
    }
    if (!contactId) {
      reportError('Select a contact from the list or use Add contact.')
      return
    }
    if (!issueDate?.trim()) {
      reportError('Select an issue date.')
      return
    }
    if (!settlementChartAccountId.trim()) {
      reportError('Select the settlement account (bank or cash) where invoice proceeds should be recorded when paid.')
      return
    }

    setBusy(true)
    try {
      if (editingInvoiceId) {
        await patchSalesInvoice(businessId, editingInvoiceId, {
          contactId,
          issueDate: dateInputToIso(issueDate),
          dueDate: dueDate.trim() ? dateInputToIso(dueDate.trim()) : null,
          reference: reference.trim() || null,
          settlementChartAccountId: settlementChartAccountId.trim(),
          lines: payloadLines,
        })
        setToast({ message: 'Invoice draft updated.', variant: 'success' })
      } else {
        await createSalesInvoice(businessId, {
          contactId,
          issueDate: dateInputToIso(issueDate),
          dueDate: dueDate.trim() ? dateInputToIso(dueDate.trim()) : null,
          reference: reference.trim() || null,
          settlementChartAccountId: settlementChartAccountId.trim(),
          lines: payloadLines,
        })
        setToast({ message: 'Invoice saved as draft.', variant: 'success' })
      }
      resetForm()
      loadList()
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : editingInvoiceId
              ? 'Could not update invoice.'
              : 'Could not create invoice.'
      reportError(msg)
    } finally {
      setBusy(false)
    }
  }

  const runRowAction = async (id: string, fn: () => Promise<unknown>, success: string) => {
    if (!businessId) return
    setActionBusyId(id)
    setError(null)
    setToast(null)
    try {
      await fn()
      setToast({ message: success, variant: 'success' })
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
      setActionBusyId(null)
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

  const st = subtotalExTax(lines)
  const tt = totalWithTax(lines)
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
            <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">Sales invoices</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-qb-muted">
              Draft invoices can be edited; approving emails the customer and requires their contact
              email. Choose a settlement asset for proceeds when paid. Manual mark-paid posts directly
              there; online wallet payments journal through digital clearing (MERCHANT_WALLET_CLEARING)
              into that account.
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
                  setPayTarget(null)
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

        {tab === 'list' ? (
          <PageCard
            variant="default"
            className="space-y-4 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
          >
            {loadingList ? (
              <div className="flex items-center gap-2 text-qb-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading…
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-qb-muted">No invoices yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-sm border border-qb-border">
                <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-qb-border bg-qb-surface text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      <th className="px-3 py-2.5">Code</th>
                      <th className="px-3 py-2.5">Contact</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Issue</th>
                      <th className="px-3 py-2.5">Due</th>
                      <th className="px-3 py-2.5 text-right">Total</th>
                      <th className="px-3 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-qb-border">
                    {rows.map((inv) => {
                      const busyRow = actionBusyId === inv.id
                      const stUp = inv.status.toUpperCase()
                      const canApprove = stUp === 'DRAFT'
                      const canEditDraft = stUp === 'DRAFT'
                      const canPay = stUp === 'APPROVED' && !inv.journalEntryId
                      const canVoid = stUp !== 'PAID' && stUp !== 'VOID'
                      const hasEmail = Boolean(inv.contact.email?.trim())
                      return (
                        <tr key={inv.id} className="align-top hover:bg-qb-surface/40">
                          <td className="px-3 py-2 font-medium text-qb-heading">{inv.publicCode}</td>
                          <td className="px-3 py-2 text-qb-heading">
                            <div>{inv.contact.name}</div>
                            {!hasEmail ? (
                              <p className="mt-0.5 text-xs text-amber-800">No email on file</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${invoiceStatusBadgeClass(inv.status)}`}
                            >
                              {inv.status}
                            </span>
                            {inv.journalEntry ? (
                              <p className="mt-1 text-xs text-qb-muted">
                                GL {formatShortDate(inv.journalEntry.postedAt)}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-qb-muted">
                            {formatShortDate(inv.issueDate)}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-qb-muted">
                            {formatShortDate(inv.dueDate)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-qb-heading">
                            {formatMoney(linesTotalApi(inv.lines), { decimals: 2 })} {inv.currency}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <Link
                                to={salesInvoiceDetailPath(inv.id)}
                                className="inline-flex items-center gap-1 rounded-sm border border-qb-border bg-white px-2.5 py-1 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                View
                              </Link>
                              {canEditDraft ? (
                                <button
                                  type="button"
                                  disabled={busyRow}
                                  onClick={() => startEditInvoice(inv)}
                                  className="inline-flex items-center gap-1 rounded-sm border border-qb-border bg-white px-2.5 py-1 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                              ) : null}
                              {canApprove ? (
                                <button
                                  type="button"
                                  disabled={busyRow || !hasEmail}
                                  title={
                                    !hasEmail
                                      ? 'Add an email to this contact before approving (notification is sent by email).'
                                      : undefined
                                  }
                                  onClick={() =>
                                    void runRowAction(
                                      inv.id,
                                      () => approveSalesInvoice(businessId, inv.id),
                                      'Invoice approved and customer notified.',
                                    )
                                  }
                                  className="rounded-sm border border-qb-border bg-white px-2.5 py-1 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                                >
                                  {busyRow ? '…' : 'Approve'}
                                </button>
                              ) : null}
                              {canPay ? (
                                <button
                                  type="button"
                                  disabled={busyRow}
                                  onClick={() => openMarkPaid(inv)}
                                  className="rounded-sm border border-qb-border bg-white px-2.5 py-1 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                                >
                                  Mark paid
                                </button>
                              ) : null}
                              {canVoid ? (
                                <button
                                  type="button"
                                  disabled={busyRow}
                                  onClick={() =>
                                    void runRowAction(inv.id, () => voidSalesInvoice(businessId, inv.id), 'Invoice voided.')
                                  }
                                  className="rounded-sm border border-qb-border bg-white px-2.5 py-1 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-50"
                                >
                                  {busyRow ? '…' : 'Void'}
                                </button>
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

            {payTarget ? (
              <form
                noValidate
                onSubmit={(e) => void submitMarkPaid(e)}
                className="mt-6 space-y-4 rounded-md border border-qb-border bg-qb-surface/40 p-4"
              >
                <p className="text-sm font-semibold text-qb-heading">
                  Record payment — {payTarget.publicCode}
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      Payment date
                    </span>
                    <input
                      type="date"
                      value={payPostedAt}
                      onChange={(e) => setPayPostedAt(e.target.value)}
                      className={fieldInput}
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      Settlement account (asset)
                    </span>
                    <div className="mt-1 max-w-md">
                      <SearchableSelect
                        value={paySettlementId}
                        onChange={setPaySettlementId}
                        options={assetSelectOptions}
                        placeholder="Cash or bank account"
                        emptyMessage="No asset accounts"
                        noResultsMessage="No matching account"
                        buttonClassName={QB_SELECT_FORM}
                        listMaxHeightClass={ACCOUNT_LIST_MAX}
                        dropdownClassName={QB_DROPDOWN}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={payBusy}
                    className="rounded-sm border border-qb-border bg-white px-5 py-2 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                  >
                    {payBusy ? 'Posting…' : 'Post payment'}
                  </button>
                  <button
                    type="button"
                    disabled={payBusy}
                    onClick={() => setPayTarget(null)}
                    className="rounded-sm border border-transparent px-4 py-2 text-sm font-medium text-qb-muted hover:text-qb-heading"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </PageCard>
        ) : (
          <PageCard
            variant="default"
            className="space-y-6 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
          >
            {editingInvoiceId ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                <p>
                  Editing{' '}
                  <span className="font-mono font-semibold">
                    {rows.find((r) => r.id === editingInvoiceId)?.publicCode ?? 'invoice'}
                  </span>
                  — only drafts can be edited.
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
            <form noValidate onSubmit={(e) => void submitNew(e)} className="space-y-6">
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
                    Issue date
                  </span>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className={fieldInput}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    Due date
                  </span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={fieldInput}
                  />
                </label>
              </div>
              <label className="block max-w-md space-y-1.5">
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

              <div className="max-w-md space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                  Settlement account (asset)
                </span>
                <p className="text-xs leading-relaxed text-qb-muted">
                  Bank or cash account where paid proceeds are recorded. Required for new invoices; used
                  when customers pay online (wallet entries clear through MERCHANT_WALLET_CLEARING).
                </p>
                <SearchableSelect
                  value={settlementChartAccountId}
                  onChange={setSettlementChartAccountId}
                  options={assetSelectOptions}
                  placeholder="Cash or bank for proceeds"
                  emptyMessage="No asset accounts"
                  noResultsMessage="No matching account"
                  buttonClassName={QB_SELECT_FORM}
                  listMaxHeightClass={ACCOUNT_LIST_MAX}
                  dropdownClassName={QB_DROPDOWN}
                />
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
                        <td className="p-2 pr-2">
                          <input
                            value={l.narration}
                            onChange={(e) => updateLine(l.id, { narration: e.target.value })}
                            className="w-full min-w-[120px] rounded-sm border border-qb-border bg-white px-2 py-1.5 text-xs text-qb-heading placeholder:text-qb-muted/60 focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35"
                            placeholder="Description"
                          />
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
                <div className="space-y-1 text-sm tabular-nums">
                  <p className="text-qb-muted">
                    Subtotal (qty × unit){' '}
                    <span className="font-semibold text-qb-heading">
                      {formatMoney(st, { decimals: 2 })}
                    </span>
                  </p>
                  <p className="text-qb-heading">
                    Total (incl. tax){' '}
                    <span className="text-lg font-semibold text-qb-heading">
                      {formatMoney(tt, { decimals: 2 })}
                    </span>
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-sm border border-qb-border bg-white px-6 py-2.5 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                >
                  {busy ? 'Saving…' : editingInvoiceId ? 'Save changes' : 'Save draft'}
                </button>
              </div>
            </form>
          </PageCard>
        )}
      </div>
    </PageTransition>
  )
}
