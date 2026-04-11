import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  createCorporateBillingPlan,
  fetchCorporateBillingPlans,
  updateCorporateBillingPlan,
  type CorporateBillingPlanRow,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

export function PlatformCorporateBillingsPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<CorporateBillingPlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [newRow, setNewRow] = useState({
    name: '',
    monthly: '',
    quarterly: '',
    halfYearly: '',
    yearly: '',
    twoYear: '',
    contract: '',
  })

  const load = useCallback(async () => {
    if (!isPlatformOperator(user)) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchCorporateBillingPlans()
      setRows(data)
    } catch (e) {
      setRows([])
      setError(e instanceof ApiError ? e.message : 'Could not load corporate billing templates.')
    } finally {
      setLoading(false)
    }
  }, [user?.isPlatformOwner, user?.isPlatformAdmin])

  useEffect(() => {
    void load()
  }, [load])

  const saveRow = async (
    row: CorporateBillingPlanRow,
    draft: {
      monthly: string
      quarterly: string
      halfYearly: string
      yearly: string
      twoYear: string
      contract: string
    },
  ) => {
    const m = Number(draft.monthly.trim())
    const q = Number(draft.quarterly.trim())
    const hy = Number(draft.halfYearly.trim())
    const y = Number(draft.yearly.trim())
    const ty = Number(draft.twoYear.trim())
    const c = Number(draft.contract.trim())
    if (!Number.isFinite(m) || m <= 0 || !Number.isFinite(y) || y <= 0) {
      setError('Monthly and yearly list prices must be positive numbers.')
      return
    }
    const extras = [q, hy, ty, c]
    if (extras.some((n) => !Number.isFinite(n) || n < 0)) {
      setError('Quarterly, half-yearly, two-year, and contract amounts must be zero or positive.')
      return
    }
    setSavingId(row.id)
    setError(null)
    try {
      await updateCorporateBillingPlan(row.id, {
        monthlyPrice: m,
        quarterlyPrice: q,
        halfYearlyPrice: hy,
        yearlyPrice: y,
        twoYearPrice: ty,
        contractPrice: c,
      })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.')
    } finally {
      setSavingId(null)
    }
  }

  const createRow = async () => {
    const name = newRow.name.trim()
    const m = Number(newRow.monthly.trim())
    const q = Number(newRow.quarterly.trim())
    const hy = Number(newRow.halfYearly.trim())
    const y = Number(newRow.yearly.trim())
    const ty = Number(newRow.twoYear.trim())
    const c = Number(newRow.contract.trim())
    if (name.length < 2) {
      setError('Enter a template name.')
      return
    }
    if (!Number.isFinite(m) || m <= 0 || !Number.isFinite(y) || y <= 0) {
      setError('Monthly and yearly list prices must be positive numbers.')
      return
    }
    const extras = [q, hy, ty, c]
    if (extras.some((n) => !Number.isFinite(n) || n < 0)) {
      setError('Quarterly, half-yearly, two-year, and contract amounts must be zero or positive.')
      return
    }
    setSavingId('__new__')
    setError(null)
    try {
      await createCorporateBillingPlan({
        name,
        monthlyPrice: m,
        yearlyPrice: y,
        quarterlyPrice: q,
        halfYearlyPrice: hy,
        twoYearPrice: ty,
        contractPrice: c,
      })
      setNewRow({
        name: '',
        monthly: '',
        quarterly: '',
        halfYearly: '',
        yearly: '',
        twoYear: '',
        contract: '',
      })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create template.')
    } finally {
      setSavingId(null)
    }
  }

  const toggleActive = async (row: CorporateBillingPlanRow) => {
    setSavingId(row.id)
    setError(null)
    try {
      await updateCorporateBillingPlan(row.id, { isActive: !row.isActive })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update.')
    } finally {
      setSavingId(null)
    }
  }

  if (!isPlatformOperator(user)) {
    return null
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">Platform</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Corporate bill</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Set list prices for each billing cycle (monthly through signed contract). Assign a template and
            cycle on <span className="font-medium text-slate-800">Corporate → Businesses</span>. Unused
            cycles can stay at zero until you need them.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <PageCard className="overflow-hidden p-0">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading templates…</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row) => (
              <CorporateTemplateRow
                key={row.id}
                row={row}
                disabled={savingId === row.id}
                onSave={(draft) => void saveRow(row, draft)}
                onToggleActive={() => void toggleActive(row)}
              />
            ))}
            <div className="space-y-4 p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                New template
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block sm:col-span-2 lg:col-span-3">
                  <span className="text-xs font-medium text-slate-600">Name</span>
                  <input
                    value={newRow.name}
                    onChange={(e) => setNewRow((p) => ({ ...p, name: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    placeholder="e.g. Enterprise bundle A"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Monthly (GMD)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={newRow.monthly}
                    onChange={(e) => setNewRow((p) => ({ ...p, monthly: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Quarterly (GMD)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={newRow.quarterly}
                    onChange={(e) => setNewRow((p) => ({ ...p, quarterly: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Half-yearly (GMD)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={newRow.halfYearly}
                    onChange={(e) => setNewRow((p) => ({ ...p, halfYearly: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Yearly (GMD)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={newRow.yearly}
                    onChange={(e) => setNewRow((p) => ({ ...p, yearly: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Two years (GMD)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={newRow.twoYear}
                    onChange={(e) => setNewRow((p) => ({ ...p, twoYear: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Signed contract (GMD)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={newRow.contract}
                    onChange={(e) => setNewRow((p) => ({ ...p, contract: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={savingId === '__new__'}
                onClick={() => void createRow()}
                className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingId === '__new__' ? 'Saving…' : 'Add template'}
              </button>
            </div>
          </div>
        )}
      </PageCard>
    </PageTransition>
  )
}

function CorporateTemplateRow({
  row,
  disabled,
  onSave,
  onToggleActive,
}: {
  row: CorporateBillingPlanRow
  disabled: boolean
  onSave: (draft: {
    monthly: string
    quarterly: string
    halfYearly: string
    yearly: string
    twoYear: string
    contract: string
  }) => void
  onToggleActive: () => void
}) {
  const [monthly, setMonthly] = useState(row.monthlyPrice)
  const [quarterly, setQuarterly] = useState(row.quarterlyPrice)
  const [halfYearly, setHalfYearly] = useState(row.halfYearlyPrice)
  const [yearly, setYearly] = useState(row.yearlyPrice)
  const [twoYear, setTwoYear] = useState(row.twoYearPrice)
  const [contract, setContract] = useState(row.contractPrice)

  useEffect(() => {
    setMonthly(row.monthlyPrice)
    setQuarterly(row.quarterlyPrice)
    setHalfYearly(row.halfYearlyPrice)
    setYearly(row.yearlyPrice)
    setTwoYear(row.twoYearPrice)
    setContract(row.contractPrice)
  }, [
    row.monthlyPrice,
    row.quarterlyPrice,
    row.halfYearlyPrice,
    row.yearlyPrice,
    row.twoYearPrice,
    row.contractPrice,
  ])

  const dirty =
    monthly !== row.monthlyPrice ||
    quarterly !== row.quarterlyPrice ||
    halfYearly !== row.halfYearlyPrice ||
    yearly !== row.yearlyPrice ||
    twoYear !== row.twoYearPrice ||
    contract !== row.contractPrice

  return (
    <div className="flex flex-col gap-4 p-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Template</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">{row.name}</h2>
        <p className="mt-2 text-xs text-slate-500">
          {row.isActive ? (
            <span className="text-emerald-700">Active</span>
          ) : (
            <span className="text-amber-700">Inactive (hidden from assignment)</span>
          )}
        </p>
      </div>
      <div className="flex w-full flex-col gap-3 lg:min-w-0 lg:flex-1">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Monthly (GMD)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              disabled={disabled}
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Quarterly (GMD)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              disabled={disabled}
              value={quarterly}
              onChange={(e) => setQuarterly(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Half-yearly (GMD)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              disabled={disabled}
              value={halfYearly}
              onChange={(e) => setHalfYearly(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Yearly (GMD)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              disabled={disabled}
              value={yearly}
              onChange={(e) => setYearly(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Two years (GMD)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              disabled={disabled}
              value={twoYear}
              onChange={(e) => setTwoYear(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Signed contract (GMD)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              disabled={disabled}
              value={contract}
              onChange={(e) => setContract(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || !dirty}
            onClick={() =>
              onSave({ monthly, quarterly, halfYearly, yearly, twoYear, contract })
            }
            className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onToggleActive}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            {row.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
    </div>
  )
}
