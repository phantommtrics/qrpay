import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { LineNarrationTextarea, QB_LINE_NARRATION_SHELL } from '../components/ui/LineNarrationTextarea'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { SearchableSelect, type SearchableSelectOption } from '../components/ui/SearchableSelect'
import { Toast, type ToastVariant } from '../components/ui/Toast'
import { APP_PATHS, platformBillDetailPath } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  ApiError,
  createPlatformBillApi,
  createPlatformSupplier,
  fetchPlatformAccountingChart,
  fetchPlatformSuppliers,
  type PlatformChartAccountDetail,
  type PlatformSupplierRow,
} from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

type LineDraft = {
  id: string
  chartOfAccountId: string
  narration: string
  quantity: string
  unitAmount: string
  taxAmount: string
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
  return {
    id: newLineId(),
    chartOfAccountId: '',
    narration: '',
    quantity: '1',
    unitAmount: '',
    taxAmount: '0',
  }
}

function parseNum(value: string): number {
  const n = Number.parseFloat(value.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function lineTotal(line: LineDraft): number {
  return parseNum(line.quantity) * parseNum(line.unitAmount) + parseNum(line.taxAmount)
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

export function PlatformBillNewPage() {
  const navigate = useNavigate()
  const { canAccess } = useAuth()
  const canManage = canAccess('platform.bills.manage')

  const [suppliers, setSuppliers] = useState<PlatformSupplierRow[]>([])
  const [accounts, setAccounts] = useState<PlatformChartAccountDetail[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [reference, setReference] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(), emptyLine()])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierEmail, setNewSupplierEmail] = useState('')
  const [creatingSupplier, setCreatingSupplier] = useState(false)
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null)

  const dismissToast = useCallback(() => setToast(null), [])
  const lineSelectOptions = useMemo(() => accountOptions(accounts), [accounts])
  const billTotal = useMemo(() => lines.reduce((sum, line) => sum + lineTotal(line), 0), [lines])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const [s, a] = await Promise.all([fetchPlatformSuppliers(), fetchPlatformAccountingChart()])
        if (cancelled) return
        setSuppliers(s)
        setAccounts(a)
        if (s[0]) setSupplierId(s[0].id)
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof ApiError ? e.message : 'Could not load form data.'
          setError(message)
          setToast({ message, variant: 'error' })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const reportError = (message: string) => {
    setError(message)
    setToast({ message, variant: 'error' })
  }

  const updateLine = (id: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  }

  const addLine = () => setLines((prev) => [...prev, emptyLine()])

  const removeLine = (id: string) => {
    if (lines.length <= 2) return
    setLines((prev) => prev.filter((line) => line.id !== id))
  }

  const createSupplier = async () => {
    setError(null)
    setToast(null)
    if (!newSupplierName.trim() || !newSupplierEmail.trim()) {
      reportError('Name and email are required.')
      return
    }
    setCreatingSupplier(true)
    try {
      const supplier = await createPlatformSupplier({
        name: newSupplierName.trim(),
        email: newSupplierEmail.trim(),
      })
      setSuppliers([supplier])
      setSupplierId(supplier.id)
      setNewSupplierName('')
      setNewSupplierEmail('')
      setToast({ message: 'Supplier added.', variant: 'success' })
    } catch (e) {
      reportError(e instanceof ApiError ? e.message : 'Could not create supplier.')
    } finally {
      setCreatingSupplier(false)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setToast(null)
    const parsed = lines
      .map((line) => ({
        chartOfAccountId: line.chartOfAccountId.trim(),
        narration: line.narration.trim() || 'Line',
        quantity: parseNum(line.quantity),
        unitAmount: parseNum(line.unitAmount),
        taxAmount: parseNum(line.taxAmount),
      }))
      .filter((line) => line.chartOfAccountId && line.quantity * line.unitAmount + line.taxAmount > 0)

    if (!supplierId) {
      reportError('Select a supplier.')
      return
    }
    if (parsed.length === 0) {
      reportError('Add at least one line with an account and amount.')
      return
    }

    setSubmitting(true)
    try {
      const row = await createPlatformBillApi({
        supplierId,
        issueDate,
        dueDate: dueDate.trim() || null,
        reference: reference.trim() || null,
        lines: parsed,
      })
      navigate(platformBillDetailPath(row.id))
    } catch (e) {
      reportError(e instanceof ApiError ? e.message : 'Could not create bill.')
    } finally {
      setSubmitting(false)
    }
  }

  const fieldClass =
    'w-full rounded-sm border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading placeholder:text-qb-muted/60 focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'
  const amountInputClass =
    'w-full rounded-sm border border-qb-border bg-white px-2 py-1.5 text-xs tabular-nums text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

  if (!canManage) {
    return (
      <PageTransition>
        <PageCard
          variant="default"
          className="space-y-3 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <p className="text-sm text-qb-muted">You do not have permission to create platform bills.</p>
          <Link
            to={APP_PATHS.platformBills}
            className="inline-flex items-center text-sm font-medium text-qb-muted hover:text-qb-heading"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
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
            to={APP_PATHS.platformBills}
            className="inline-flex items-center text-sm font-medium text-qb-muted hover:text-qb-heading"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">New platform bill</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-qb-muted">
              Create a supplier bill against the DirectPay platform chart of accounts. Add line
              items with an account, narration, quantity, amount, and tax.
            </p>
          </div>
        </PageCard>

        {loading ? (
          <PageCard
            variant="default"
            className="flex items-center gap-2 rounded-md border-qb-border py-10 text-qb-muted shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
          >
            <Loader2 className="h-5 w-5 animate-spin text-qb-muted" />
            Loading form data...
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

        {!loading ? (
          <PageCard
            variant="default"
            className="space-y-6 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
          >
            {suppliers.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50/90 p-4 text-sm shadow-[0_1px_2px_rgba(57,58,61,0.06)]">
                <p className="font-semibold text-amber-950">No suppliers yet</p>
                <p className="mt-1 text-amber-900">
                  Add a supplier first. Email is required before bills can be approved.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <input
                    placeholder="Supplier name"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    className={fieldClass}
                  />
                  <input
                    placeholder="Email"
                    type="email"
                    value={newSupplierEmail}
                    onChange={(e) => setNewSupplierEmail(e.target.value)}
                    className={fieldClass}
                  />
                  <button
                    type="button"
                    disabled={creatingSupplier}
                    onClick={() => void createSupplier()}
                    className="rounded-sm border border-qb-border bg-white px-4 py-2 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                  >
                    {creatingSupplier ? 'Saving...' : 'Add supplier'}
                  </button>
                </div>
              </div>
            ) : (
              <form noValidate onSubmit={(e) => void submit(e)} className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      Supplier
                    </span>
                    <select
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      className={fieldClass}
                    >
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      Issue date
                    </span>
                    <input
                      type="date"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className={fieldClass}
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
                </div>

                <div className="overflow-x-auto rounded-sm border border-qb-border bg-white">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-qb-border bg-qb-surface text-xs font-semibold uppercase tracking-wide text-qb-muted">
                        <th className="px-2 py-2.5 pr-2">Account</th>
                        <th className="px-2 py-2.5 pr-2">Narration</th>
                        <th className="px-2 py-2.5 pr-2 text-right">Qty</th>
                        <th className="px-2 py-2.5 pr-2 text-right">Amount</th>
                        <th className="px-2 py-2.5 pr-2 text-right">Tax</th>
                        <th className="px-2 py-2.5 pr-2 text-right">Line total</th>
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
                                value={line.narration}
                                onValueChange={(narration) => updateLine(line.id, { narration })}
                                placeholder="Line narration"
                                ariaLabel="Line narration"
                              />
                            </div>
                          </td>
                          <td className="p-2 pr-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={line.quantity}
                              onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                              className={amountInputClass}
                              placeholder="1"
                            />
                          </td>
                          <td className="p-2 pr-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={line.unitAmount}
                              onChange={(e) => updateLine(line.id, { unitAmount: e.target.value })}
                              className={amountInputClass}
                              placeholder="0.00"
                            />
                          </td>
                          <td className="p-2 pr-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={line.taxAmount}
                              onChange={(e) => updateLine(line.id, { taxAmount: e.target.value })}
                              className={amountInputClass}
                              placeholder="0.00"
                            />
                          </td>
                          <td className="p-2 pr-2 text-right text-xs tabular-nums text-qb-heading">
                            {formatMoney(lineTotal(line), { decimals: 2 })}
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
                      Bill total{' '}
                      <span className="font-semibold text-qb-heading">
                        {formatMoney(billTotal, { decimals: 2 })}
                      </span>
                    </p>
                    <p className="text-xs text-qb-muted">
                      Empty or zero-value lines are ignored when the draft is saved.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-sm border border-qb-border bg-white px-6 py-2.5 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : 'Save draft'}
                  </button>
                </div>
              </form>
            )}
          </PageCard>
        ) : null}
      </div>
    </PageTransition>
  )
}
