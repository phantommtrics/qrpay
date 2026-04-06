import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ContactSearchCombobox } from '../components/ui/ContactSearchCombobox'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { SearchableSelect, type SearchableSelectOption } from '../components/ui/SearchableSelect'
import { Toast, type ToastVariant } from '../components/ui/Toast'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { fetchAccountingSummary, type AccountingAccountRow } from '../services/accountingApi'
import { postBankTransferJournal, postMoneyInJournal, postMoneyOutJournal } from '../services/journalApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

type Tab = 'in' | 'out' | 'transfer'

type LineDraft = {
  id: string
  narration: string
  unitLabel: string
  quantity: string
  unitAmount: string
  taxAmount: string
  chartOfAccountId: string
}

/** Stable unique ids for draft lines; avoids crypto.randomUUID() where unsupported. */
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

const QB_SELECT_TABLE =
  '!rounded-sm !border-qb-border !px-2 !py-1.5 !text-xs !font-normal !text-qb-heading !shadow-sm focus:!border-qb-primary focus:!ring-1 focus:!ring-qb-primary/35'
const QB_SELECT_FORM =
  '!rounded-sm !border-qb-border !px-3 !py-2 !text-sm !font-normal !text-qb-heading !shadow-sm focus:!border-qb-primary focus:!ring-1 focus:!ring-qb-primary/35'
const QB_DROPDOWN = '!rounded-md !border-qb-border'
const ACCOUNT_LIST_MAX = 'max-h-[7.5rem]'

export function AccountingJournalsPage() {
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id

  const [tab, setTab] = useState<Tab>('in')
  const [accounts, setAccounts] = useState<AccountingAccountRow[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)

  const [postedAt, setPostedAt] = useState(todayDateInput)
  const [reference, setReference] = useState('')
  const [settlementId, setSettlementId] = useState('')

  const [contactId, setContactId] = useState('')
  const [contactInput, setContactInput] = useState('')

  const [lines, setLines] = useState<LineDraft[]>(() => [newLine()])

  const [fromBankId, setFromBankId] = useState('')
  const [toBankId, setToBankId] = useState('')
  const [transferAmount, setTransferAmount] = useState('')

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

  const bankAccounts = useMemo(
    () =>
      accounts
        .filter((a) => a.kind === 'BANK')
        .sort((a, b) => a.code.localeCompare(b.code)),
    [accounts],
  )

  const lineAccountOptions = useMemo(
    () => [...accounts].sort((a, b) => a.code.localeCompare(b.code)),
    [accounts],
  )

  const bankSelectOptions = useMemo(() => accountsToOptions(bankAccounts), [bankAccounts])
  const assetSelectOptions = useMemo(() => accountsToOptions(assetAccounts), [assetAccounts])
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

  const resetInOutForm = () => {
    setPostedAt(todayDateInput())
    setReference('')
    setSettlementId('')
    setContactId('')
    setContactInput('')
    setLines([newLine()])
  }

  const resetTransferForm = () => {
    setPostedAt(todayDateInput())
    setReference('')
    setFromBankId('')
    setToBankId('')
    setTransferAmount('')
  }

  const updateLine = (id: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const submitInOut = async (e: FormEvent, direction: 'in' | 'out') => {
    e.preventDefault()
    if (!businessId) return
    setError(null)
    setToast(null)

    if (!postedAt?.trim()) {
      reportError('Select a date.')
      return
    }

    const payloadLines = lines
      .map((l) => ({
        chartOfAccountId: l.chartOfAccountId,
        narration: l.narration.trim(),
        quantity: parseNum(l.quantity),
        unitLabel: l.unitLabel.trim() || null,
        unitAmount: parseNum(l.unitAmount),
        taxAmount: parseNum(l.taxAmount),
      }))
      .filter((l) => l.chartOfAccountId && (l.quantity * l.unitAmount + l.taxAmount > 0))

    if (payloadLines.length === 0) {
      reportError('Add at least one line with an account and amounts.')
      return
    }
    if (!settlementId) {
      reportError('Select a settlement account (cash or bank).')
      return
    }

    if (!contactId) {
      reportError('Select a contact from the list or use Add contact.')
      return
    }

    const base = {
      postedAt: dateInputToIso(postedAt),
      reference: reference.trim() || null,
      settlementChartAccountId: settlementId,
      lines: payloadLines,
      contactId,
      newContactName: null,
      newContactEmail: null,
      newContactPhone: null,
    }

    setBusy(true)
    try {
      if (direction === 'in') {
        await postMoneyInJournal(businessId, base)
      } else {
        await postMoneyOutJournal(businessId, base)
      }
      setError(null)
      setToast({ message: 'Transaction saved successfully.', variant: 'success' })
      resetInOutForm()
      loadAccounts()
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not save journal.'
      reportError(msg)
    } finally {
      setBusy(false)
    }
  }

  const submitTransfer = async (e: FormEvent) => {
    e.preventDefault()
    if (!businessId) return
    setError(null)
    setToast(null)

    if (!postedAt?.trim()) {
      reportError('Select a date.')
      return
    }

    const amt = parseNum(transferAmount)
    if (!fromBankId || !toBankId) {
      reportError('Select from and to bank accounts.')
      return
    }
    if (fromBankId === toBankId) {
      reportError('From and to must differ.')
      return
    }
    if (amt <= 0) {
      reportError('Enter a positive amount.')
      return
    }
    setBusy(true)
    try {
      await postBankTransferJournal(businessId, {
        fromChartAccountId: fromBankId,
        toChartAccountId: toBankId,
        amount: amt,
        postedAt: dateInputToIso(postedAt),
        reference: reference.trim() || null,
      })
      setError(null)
      setToast({ message: 'Transaction saved successfully.', variant: 'success' })
      resetTransferForm()
      loadAccounts()
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not post transfer.'
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
            <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">Journal entries</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-qb-muted">
              Record money in, money out, or bank-to-bank transfers. Lines update chart balances;
              negative balances are allowed (overdrafts).
            </p>
          </div>

          <div className="flex flex-wrap gap-0 border-b border-qb-border">
            {(
              [
                ['in', 'Money in'],
                ['out', 'Money out'],
                ['transfer', 'Bank transfer'],
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
        {tab === 'transfer' ? (
          <PageCard
            variant="default"
            className="space-y-6 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
          >
            <form noValidate onSubmit={(e) => void submitTransfer(e)} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    From bank
                  </span>
                  <div className="mt-1">
                    <SearchableSelect
                      value={fromBankId}
                      onChange={setFromBankId}
                      options={bankSelectOptions}
                      placeholder="Select source bank"
                      emptyMessage="No bank accounts"
                      noResultsMessage="No matching account"
                      buttonClassName={QB_SELECT_FORM}
                      listMaxHeightClass={ACCOUNT_LIST_MAX}
                      dropdownClassName={QB_DROPDOWN}
                    />
                  </div>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">To bank</span>
                  <div className="mt-1">
                    <SearchableSelect
                      value={toBankId}
                      onChange={setToBankId}
                      options={bankSelectOptions}
                      placeholder="Select destination bank"
                      emptyMessage="No bank accounts"
                      noResultsMessage="No matching account"
                      buttonClassName={QB_SELECT_FORM}
                      listMaxHeightClass={ACCOUNT_LIST_MAX}
                      dropdownClassName={QB_DROPDOWN}
                    />
                  </div>
                </div>
              </div>
              {bankAccounts.length === 0 ? (
                <p className="text-sm text-amber-800">
                  Add bank-type accounts on the chart of accounts to use transfers.
                </p>
              ) : null}
              <label className="block max-w-xs space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Amount</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  className={`${fieldInput} tabular-nums`}
                  placeholder="0.00"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="rounded-sm border border-qb-border bg-white px-5 py-2.5 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save transfer'}
              </button>
            </form>
          </PageCard>
        ) : (
          <PageCard
            variant="default"
            className="space-y-6 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
          >
            <form
              noValidate
              onSubmit={(e) => void submitInOut(e, tab === 'in' ? 'in' : 'out')}
              className="space-y-6"
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <div className="mt-0">
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
                      label={tab === 'in' ? 'Received from' : 'Paid to'}
                      listMaxHeightClass={ACCOUNT_LIST_MAX}
                    />
                  </div>
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
                    placeholder="Invoice, cheque, etc."
                  />
                </label>
              </div>

              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                  {tab === 'in' ? 'Deposit to (asset)' : 'Pay from (asset)'}
                </span>
                <div className="mt-1 max-w-md">
                  <SearchableSelect
                    value={settlementId}
                    onChange={setSettlementId}
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
                  {busy ? 'Saving…' : 'Save journal'}
                </button>
              </div>
            </form>
          </PageCard>
        )}
      </div>
    </PageTransition>
  )
}
