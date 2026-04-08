import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
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

type LineDraft = {
  chartOfAccountId: string
  narration: string
  quantity: string
  unitAmount: string
  taxAmount: string
}

function emptyLine(): LineDraft {
  return { chartOfAccountId: '', narration: '', quantity: '1', unitAmount: '', taxAmount: '0' }
}

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
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Could not load form data.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!canManage) {
    return (
      <PageTransition>
        <PageCard variant="default" className="p-5">
          <p className="text-sm text-qb-muted">You do not have permission to create platform bills.</p>
          <Link to={APP_PATHS.platformBills} className="mt-2 inline-block text-sm text-qb-primary">
            Back
          </Link>
        </PageCard>
      </PageTransition>
    )
  }

  const submit = async () => {
    setError(null)
    const parsed = lines
      .map((l) => ({
        chartOfAccountId: l.chartOfAccountId.trim(),
        narration: l.narration.trim() || 'Line',
        quantity: parseFloat(l.quantity) || 0,
        unitAmount: parseFloat(l.unitAmount) || 0,
        taxAmount: parseFloat(l.taxAmount) || 0,
      }))
      .filter((l) => l.chartOfAccountId && (l.quantity * l.unitAmount + l.taxAmount > 0))
    if (!supplierId) {
      setError('Select a supplier.')
      return
    }
    if (parsed.length === 0) {
      setError('Add at least one line with an account and amount.')
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
      setError(e instanceof ApiError ? e.message : 'Could not create bill.')
    } finally {
      setSubmitting(false)
    }
  }

  const fieldClass =
    'rounded-sm border border-qb-border bg-white px-2 py-1.5 text-sm text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

  return (
    <PageTransition>
      <div className="space-y-6 py-2">
        <PageCard variant="default" className="rounded-md border-qb-border p-5">
          <Link
            to={APP_PATHS.platformBills}
            className="text-sm font-medium text-qb-muted hover:text-qb-heading"
          >
            ← Back
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-qb-heading">New platform bill</h1>
          {loading ? <p className="mt-4 text-sm text-qb-muted">Loading…</p> : null}
          {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        </PageCard>

        {!loading ? (
          <PageCard variant="default" className="space-y-4 rounded-md border-qb-border p-5">
            {suppliers.length === 0 ? (
              <div className="rounded-sm border border-amber-200 bg-amber-50 p-4 text-sm">
                <p className="font-medium text-amber-900">No suppliers yet</p>
                <p className="mt-1 text-amber-800">
                  Add a supplier (email required before you can approve bills).
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
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
                    onClick={async () => {
                      setError(null)
                      if (!newSupplierName.trim() || !newSupplierEmail.trim()) {
                        setError('Name and email are required.')
                        return
                      }
                      setCreatingSupplier(true)
                      try {
                        const s = await createPlatformSupplier({
                          name: newSupplierName.trim(),
                          email: newSupplierEmail.trim(),
                        })
                        setSuppliers([s])
                        setSupplierId(s.id)
                        setNewSupplierName('')
                        setNewSupplierEmail('')
                      } catch (e) {
                        setError(e instanceof ApiError ? e.message : 'Could not create supplier.')
                      } finally {
                        setCreatingSupplier(false)
                      }
                    }}
                    className="rounded-sm bg-qb-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {creatingSupplier ? 'Saving…' : 'Add supplier'}
                  </button>
                </div>
              </div>
            ) : (
              <label className="block space-y-1 text-sm">
                <span className="text-xs font-semibold uppercase text-qb-muted">Supplier</span>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className={`${fieldClass} w-full max-w-md`}
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {suppliers.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-4">
                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-semibold uppercase text-qb-muted">Issue date</span>
                    <input
                      type="date"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-semibold uppercase text-qb-muted">Due date</span>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="min-w-[10rem] flex-1 space-y-1 text-sm">
                    <span className="text-xs font-semibold uppercase text-qb-muted">Reference</span>
                    <input
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      className={`${fieldClass} w-full`}
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-qb-muted">Lines</p>
                  {lines.map((line, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-end gap-2 rounded-sm border border-qb-border bg-qb-surface/30 p-3"
                >
                  <select
                    value={line.chartOfAccountId}
                    onChange={(e) =>
                      setLines((p) => p.map((x, j) => (j === i ? { ...x, chartOfAccountId: e.target.value } : x)))
                    }
                    className={`${fieldClass} min-w-[10rem] flex-1`}
                  >
                    <option value="">Account…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Description"
                    value={line.narration}
                    onChange={(e) =>
                      setLines((p) => p.map((x, j) => (j === i ? { ...x, narration: e.target.value } : x)))
                    }
                    className={`${fieldClass} min-w-[6rem] flex-1`}
                  />
                  <input
                    type="number"
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((p) => p.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))
                    }
                    className={`${fieldClass} w-20 tabular-nums`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={line.unitAmount}
                    onChange={(e) =>
                      setLines((p) => p.map((x, j) => (j === i ? { ...x, unitAmount: e.target.value } : x)))
                    }
                    className={`${fieldClass} w-28 tabular-nums`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Tax"
                    value={line.taxAmount}
                    onChange={(e) =>
                      setLines((p) => p.map((x, j) => (j === i ? { ...x, taxAmount: e.target.value } : x)))
                    }
                    className={`${fieldClass} w-24 tabular-nums`}
                  />
                  {lines.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
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
                    onClick={() => setLines((p) => [...p, emptyLine()])}
                    className="rounded-sm border border-qb-border bg-white px-3 py-2 text-sm"
                  >
                    Add line
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void submit()}
                    className="rounded-sm bg-qb-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {submitting ? 'Saving…' : 'Save draft'}
                  </button>
                </div>
              </>
            ) : null}
          </PageCard>
        ) : null}
      </div>
    </PageTransition>
  )
}
