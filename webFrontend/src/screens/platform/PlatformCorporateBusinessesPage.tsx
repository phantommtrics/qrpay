import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Settings2 } from 'lucide-react'

import { CenteredModal } from '../../components/ui/CenteredModal'
import { ModalOverlay } from '../../components/ui/ModalOverlay'
import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { useAuth } from '../../features/auth/AuthContext'
import type { SubscriptionBillingInterval } from '../../types'
import {
  ApiError,
  fetchCorporateBillingPlans,
  fetchCorporateBusinesses,
  fetchCorporateEntitlementCatalog,
  patchCorporateBusinessSettings,
  type CorporateBillingPlanRow,
  type CorporateBusinessRow,
  type CorporateEntitlementCatalogItem,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

const BILLING_INTERVAL_LABELS: Record<SubscriptionBillingInterval, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half-yearly',
  YEARLY: 'Yearly',
  TWO_YEARS: 'Two years',
  CONTRACT_INFINITE: 'Signed contract (perpetual)',
}

function formatBillingIntervalLabel(interval: SubscriptionBillingInterval | null | undefined) {
  if (!interval) {
    return '—'
  }
  return BILLING_INTERVAL_LABELS[interval] ?? interval
}

function corporateTemplateOptionLabel(p: CorporateBillingPlanRow) {
  return `${p.name} — ${p.monthlyPrice}/mo · ${p.yearlyPrice}/yr`
}

export function PlatformCorporateBusinessesPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<CorporateBusinessRow[]>([])
  const [plans, setPlans] = useState<CorporateBillingPlanRow[]>([])
  const [catalog, setCatalog] = useState<CorporateEntitlementCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalBusiness, setModalBusiness] = useState<CorporateBusinessRow | null>(null)

  const load = useCallback(async () => {
    if (!isPlatformOperator(user)) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [biz, pl, cat] = await Promise.all([
        fetchCorporateBusinesses(),
        fetchCorporateBillingPlans(),
        fetchCorporateEntitlementCatalog(),
      ])
      setRows(biz)
      setPlans(pl)
      setCatalog(cat.items)
    } catch (e) {
      setRows([])
      setError(e instanceof ApiError ? e.message : 'Could not load corporate businesses.')
    } finally {
      setLoading(false)
    }
  }, [user?.isPlatformOwner, user?.isPlatformAdmin])

  useEffect(() => {
    void load()
  }, [load])

  const activePlans = useMemo(() => plans.filter((p) => p.isActive), [plans])

  if (!isPlatformOperator(user)) {
    return null
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">Platform</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Corporate businesses</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Organizations with industry <span className="font-medium text-slate-800">Corporate</span> use the
            Corporate plan (default entitlements exclude POS, products, orders, and categories) with custom
            billing. Assign a template, billing cycle, and optional entitlement overrides per business.
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

      <PageCard className="overflow-x-auto p-0">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No corporate businesses yet.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Custom bill</th>
                <th className="px-4 py-3">Cycle</th>
                <th className="px-4 py-3">Entitlements</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((b) => {
                const entCount = b.corporateEntitlementSystemProductIds?.length ?? 0
                return (
                  <tr key={b.id} className="bg-white">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{b.name}</p>
                      <p className="text-xs text-slate-500">{b.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <p>{b.ownerName}</p>
                      <p className="text-xs text-slate-500">{b.ownerEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {b.corporateBillingPlan ? (
                        <span>{b.corporateBillingPlan.name}</span>
                      ) : (
                        <span className="text-amber-700">Not assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatBillingIntervalLabel(b.corporateBillingInterval)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {entCount === 0 ? (
                        <span className="text-slate-500">Corporate plan default</span>
                      ) : (
                        <span>{entCount} selected</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setModalBusiness(b)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        Assign
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </PageCard>

      {modalBusiness ? (
        <AssignCorporateModal
          business={modalBusiness}
          plans={activePlans}
          catalog={catalog}
          onClose={() => setModalBusiness(null)}
          onSaved={() => {
            setModalBusiness(null)
            void load()
          }}
        />
      ) : null}
    </PageTransition>
  )
}

function AssignCorporateModal({
  business,
  plans,
  catalog,
  onClose,
  onSaved,
}: {
  business: CorporateBusinessRow
  plans: CorporateBillingPlanRow[]
  catalog: CorporateEntitlementCatalogItem[]
  onClose: () => void
  onSaved: () => void
}) {
  const [planId, setPlanId] = useState(business.corporateBillingPlanId ?? plans[0]?.id ?? '')
  const [interval, setInterval] = useState<SubscriptionBillingInterval>(
    business.corporateBillingInterval ?? 'MONTHLY',
  )
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {}
    for (const id of business.corporateEntitlementSystemProductIds ?? []) {
      m[id] = true
    }
    return m
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const toggleProduct = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const usePlanDefaults = () => {
    setSelected({})
  }

  const submit = async () => {
    if (!planId) {
      setErr('Select a corporate billing template.')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const ids = Object.entries(selected)
        .filter(([, v]) => v)
        .map(([k]) => k)
      await patchCorporateBusinessSettings(business.id, {
        corporateBillingPlanId: planId,
        billingInterval: interval,
        corporateEntitlementSystemProductIds: ids.length > 0 ? ids : [],
      })
      onSaved()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <ModalOverlay className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <CenteredModal className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Assign corporate billing</h2>
          <p className="mt-1 text-sm text-slate-600">{business.name}</p>
        </div>
        <div className="space-y-4 px-6 py-4">
          {err ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {err}
            </div>
          ) : null}
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Custom bill template</span>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            >
              {plans.length === 0 ? (
                <option value="">Create templates under Corporate → Corporate bill first</option>
              ) : null}
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {corporateTemplateOptionLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Billing cycle</span>
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value as SubscriptionBillingInterval)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            >
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="HALF_YEARLY">Half-yearly</option>
              <option value="YEARLY">Yearly</option>
              <option value="TWO_YEARS">Two years</option>
              <option value="CONTRACT_INFINITE">Signed contract (perpetual)</option>
            </select>
          </label>
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-700">Entitlements (optional)</span>
              <button
                type="button"
                onClick={usePlanDefaults}
                className="text-xs font-semibold text-teal-600 hover:text-teal-700"
              >
                Use Corporate plan defaults
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Leave all unchecked for the default Corporate plan entitlements. Select one or more products
              to restrict this business to only those modules. POS, products, and orders can be selected for
              corporates that need retail-style access.
            </p>
            <div className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/80 p-3">
              {catalog.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(selected[item.id])}
                    onChange={() => toggleProduct(item.id)}
                    className="mt-1 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>
                    <span className="font-medium text-slate-800">{item.name}</span>
                    <span className="ml-1 text-xs text-slate-500">({item.serviceName})</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !planId || plans.length === 0}
            onClick={() => void submit()}
            className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save & issue invoice'}
          </button>
        </div>
      </CenteredModal>
    </div>
  )
}
