import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchPlansRaw,
  updatePlatformPlanPricing,
  type BackendPlan,
  type BackendPlanCode,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

const PLAN_ORDER: BackendPlanCode[] = ['BASIC', 'PRO', 'BUSINESS_PRO']

type RowPricing = { monthly: string; yearly: string }

function emptyRowMap(): Record<BackendPlanCode, RowPricing> {
  return {
    BASIC: { monthly: '', yearly: '' },
    PRO: { monthly: '', yearly: '' },
    BUSINESS_PRO: { monthly: '', yearly: '' },
  }
}

function plansToRowMap(plans: BackendPlan[]): Record<BackendPlanCode, RowPricing> {
  const base = emptyRowMap()
  for (const p of plans) {
    const y =
      p.yearlyPrice !== undefined && p.yearlyPrice !== ''
        ? Number(p.yearlyPrice)
        : Number(p.monthlyPrice) * 12
    base[p.code] = {
      monthly: String(Number(p.monthlyPrice)),
      yearly: String(y),
    }
  }
  return base
}

function displayNameForCode(code: BackendPlanCode) {
  switch (code) {
    case 'BASIC':
      return 'Basic'
    case 'PRO':
      return 'Pro'
    case 'BUSINESS_PRO':
      return 'Pro Business'
    default:
      return code
  }
}

function rowDirty(baseline: RowPricing, draft: RowPricing) {
  return baseline.monthly !== draft.monthly || baseline.yearly !== draft.yearly
}

export function PlatformBillingsPage() {
  const { user, refreshPlans } = useAuth()
  const [rows, setRows] = useState<BackendPlan[]>([])
  const [baseline, setBaseline] = useState<Record<BackendPlanCode, RowPricing>>(emptyRowMap)
  const [draft, setDraft] = useState<Record<BackendPlanCode, RowPricing>>(emptyRowMap)
  const [editing, setEditing] = useState<BackendPlanCode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingCode, setSavingCode] = useState<BackendPlanCode | null>(null)

  const load = useCallback(async () => {
    if (!isPlatformOperator(user)) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPlansRaw()
      setRows(data)
      const next = plansToRowMap(data)
      setBaseline(next)
      setDraft(next)
      setEditing(null)
    } catch (e) {
      setRows([])
      const empty = emptyRowMap()
      setBaseline(empty)
      setDraft(empty)
      setEditing(null)
      setError(e instanceof ApiError ? e.message : 'Could not load subscription plans.')
    } finally {
      setLoading(false)
    }
  }, [user?.isPlatformOwner, user?.isPlatformAdmin])

  useEffect(() => {
    void load()
  }, [load])

  const sortedRows = useMemo(() => {
    const order = new Map(PLAN_ORDER.map((c, i) => [c, i]))
    return [...rows].sort((a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99))
  }, [rows])

  const beginEdit = (code: BackendPlanCode) => {
    setEditing(code)
    setDraft((d) => ({ ...d, [code]: { ...baseline[code] } }))
    setError(null)
  }

  const cancelEdit = (code: BackendPlanCode) => {
    setDraft((d) => ({ ...d, [code]: { ...baseline[code] } }))
    setEditing(null)
    setError(null)
  }

  const savePlan = async (code: BackendPlanCode) => {
    const dr = draft[code]
    const bl = baseline[code]
    const patch: { monthlyPrice?: number; yearlyPrice?: number } = {}
    if (dr.monthly !== bl.monthly) {
      const n = Number(dr.monthly.trim())
      if (!Number.isFinite(n) || n <= 0) {
        setError('Monthly price must be a positive number.')
        return
      }
      patch.monthlyPrice = n
    }
    if (dr.yearly !== bl.yearly) {
      const n = Number(dr.yearly.trim())
      if (!Number.isFinite(n) || n <= 0) {
        setError('Yearly price must be a positive number.')
        return
      }
      patch.yearlyPrice = n
    }
    if (Object.keys(patch).length === 0) {
      return
    }

    setSavingCode(code)
    setError(null)
    try {
      await updatePlatformPlanPricing(code, patch)
      await refreshPlans()
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update plan pricing.')
    } finally {
      setSavingCode(null)
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
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Billings</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Set monthly and yearly subscription charges. Businesses choose a billing cycle at signup;
            renewals use the same interval and current catalog prices. Access is controlled by the{' '}
            <span className="font-medium text-slate-800">Plan billing &amp; pricing</span> module in
            Security → Role templates.
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
          <p className="p-6 text-sm text-slate-500">Loading plans…</p>
        ) : sortedRows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No plans returned from the server.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {sortedRows.map((plan) => {
              const code = plan.code
              const isEditing = editing === code
              const dirty = rowDirty(baseline[code], draft[code])
              const disabledInputs = !isEditing

              return (
                <div key={plan.id} className="flex flex-col gap-4 p-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Subscription type
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">
                      {displayNameForCode(code)}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">{plan.description}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Staff limit (from plan): {plan.staffLimit}
                    </p>
                  </div>
                  <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[280px]">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Monthly (GMD)</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          disabled={disabledInputs}
                          value={draft[code]?.monthly ?? ''}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [code]: { ...prev[code], monthly: e.target.value },
                            }))
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-100"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Yearly (GMD)</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          disabled={disabledInputs}
                          value={draft[code]?.yearly ?? ''}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [code]: { ...prev[code], yearly: e.target.value },
                            }))
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-100"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!isEditing ? (
                        <button
                          type="button"
                          onClick={() => beginEdit(code)}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                        >
                          Edit
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => void savePlan(code)}
                            disabled={!dirty || savingCode === code}
                            className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingCode === code ? 'Saving…' : 'Save changes'}
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelEdit(code)}
                            disabled={savingCode === code}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </PageCard>
    </PageTransition>
  )
}
