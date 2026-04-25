import { useEffect, useMemo, useState } from 'react'
import { Check, ExternalLink, ShieldCheck } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { APP_PATHS } from '../config/navigation'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import { ApiError, type PlanEntitlementsPayload } from '../services/subscriptionApi'
import { fetchPlanEntitlements } from '../services/subscriptionApi'
import { isPlatformOperator } from '../utils/platformOperator'

const BACKEND_PLAN_CODES = ['BASIC', 'PRO', 'BUSINESS_PRO', 'CORPORATE'] as const

export function PlanControlsPage() {
  const { user, organizations, plans, permissionDefinitions } = useAuth()
  const [now] = useState(() => Date.now())
  const [snapshots, setSnapshots] = useState<
    Partial<Record<(typeof BACKEND_PLAN_CODES)[number], PlanEntitlementsPayload>>
  >({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isPlatformOperator(user)) {
      return
    }

    let cancelled = false
    void (async () => {
      await Promise.resolve()
      setLoading(true)
      setError(null)
      try {
        const rows = await Promise.all(
          BACKEND_PLAN_CODES.map((code) =>
            fetchPlanEntitlements(code).then((data) => [code, data] as const),
          ),
        )
        if (!cancelled) {
          setSnapshots(Object.fromEntries(rows))
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'Could not load plan entitlements.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.isPlatformOwner, user?.isPlatformAdmin])

  const planIdToCode = useMemo(() => {
    const map = new Map<string, (typeof BACKEND_PLAN_CODES)[number]>()
    for (const p of plans) {
      if (p.id === 'basic') {
        map.set(p.id, 'BASIC')
      } else if (p.id === 'pro') {
        map.set(p.id, 'PRO')
      } else if (p.id === 'business_pro') {
        map.set(p.id, 'BUSINESS_PRO')
      } else if (p.id === 'corporate') {
        map.set(p.id, 'CORPORATE')
      }
    }
    return map
  }, [plans])

  const slugEnabledForPlan = (planId: string, slug: string) => {
    const code = planIdToCode.get(planId)
    if (!code) {
      return false
    }
    const snap = snapshots[code]
    return Boolean(snap?.items.some((i) => i.slug === slug))
  }

  return (
    <PageTransition className="space-y-6">
      <PageCard className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
              DirectPay controls
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">Plan entitlements overview</h2>
            <p className="mt-2 max-w-3xl text-slate-600">
              Subscription plans read entitlements from the database. Edit services, system
              products, and which products are attached to each plan in System configuration.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <NavLink
              to={APP_PATHS.platformSystemConfiguration}
              className="inline-flex items-center justify-center rounded-2xl bg-teal-600 px-4 py-3 text-sm font-medium text-white hover:bg-teal-700"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              System configuration
            </NavLink>
            <div className="inline-flex items-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white">
              <ShieldCheck className="mr-2 h-4 w-4 text-teal-400" />
              Live from API
            </div>
          </div>
        </div>
      </PageCard>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <PageCard className="overflow-hidden">
          <div className="border-b border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">Permission matrix</h3>
            <p className="mt-1 text-sm text-slate-500">
              {loading ? 'Loading…' : 'Read-only view of plan entitlements (slug must match permission key).'}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 text-sm text-slate-500">
                  <th className="p-4 font-medium">Permission</th>
                  {plans.map((plan) => (
                    <th key={plan.id} className="p-4 font-medium">
                      <div>{plan.name}</div>
                      <div className="text-xs text-slate-400">{plan.staffLabel}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {permissionDefinitions.map((permission) => (
                  <tr key={permission.key} className="align-top">
                    <td className="p-4">
                      <div className="font-medium text-slate-900">{permission.label}</div>
                      <div className="mt-1 text-sm text-slate-500">{permission.description}</div>
                      <div className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                        {permission.category}
                      </div>
                    </td>
                    {plans.map((plan) => {
                      const enabled = slugEnabledForPlan(plan.id, permission.key)

                      return (
                        <td key={plan.id} className="p-4">
                          <span
                            className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${
                              enabled
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                : 'border-slate-200 bg-white text-slate-200'
                            }`}
                            aria-label={`${permission.label} for ${plan.name}`}
                          >
                            {enabled ? <Check className="h-5 w-5" /> : null}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PageCard>

        <div className="space-y-6">
          <PageCard className="p-6">
            <h3 className="text-lg font-semibold text-slate-900">Plan rules</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              {plans.map((plan) => (
                <div key={plan.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{plan.name}</span>
                    <span className="text-xs font-medium text-slate-500">{plan.staffLabel}</span>
                  </div>
                  <p className="mt-2">{plan.description}</p>
                </div>
              ))}
            </div>
          </PageCard>

          <PageCard className="p-6">
            <h3 className="text-lg font-semibold text-slate-900">Organizations snapshot</h3>
            <div className="mt-4 space-y-3">
              {organizations.map((organization) => {
                const expiresAt = new Date(organization.subscriptionExpiresAt)
                const expired = expiresAt.getTime() < now
                const plan = plans.find((item) => item.id === organization.planId)

                return (
                  <div key={organization.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{organization.name}</p>
                        <p className="text-sm text-slate-500">
                          {plan?.name} plan, {organization.staffCount} staff
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          expired
                            ? 'bg-red-100 text-red-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {expired ? 'Expired' : 'Active'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </PageCard>
        </div>
      </div>
    </PageTransition>
  )
}
