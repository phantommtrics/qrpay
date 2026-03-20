import { Check, ShieldCheck } from 'lucide-react'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'

export function PlanControlsPage() {
  const {
    organizations,
    permissionDefinitions,
    planPermissions,
    plans,
    updatePlanPermission,
  } = useAuth()

  return (
    <PageTransition className="space-y-6">
      <PageCard className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
              Platform owner controls
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              Assign plan permissions with check marks
            </h2>
            <p className="mt-2 max-w-3xl text-slate-600">
              These mock controls define what each subscription plan can access across views,
              editing, exports, and reports.
            </p>
          </div>
          <div className="inline-flex items-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white">
            <ShieldCheck className="mr-2 h-4 w-4 text-teal-400" />
            Mock plan administration
          </div>
        </div>
      </PageCard>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <PageCard className="overflow-hidden">
          <div className="border-b border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">Permission matrix</h3>
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
                      const enabled = planPermissions[plan.id][permission.key]

                      return (
                        <td key={plan.id} className="p-4">
                          <button
                            onClick={() =>
                              updatePlanPermission(plan.id, permission.key, !enabled)
                            }
                            className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors ${
                              enabled
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                : 'border-slate-200 bg-white text-slate-300 hover:bg-slate-50'
                            }`}
                            aria-label={`${enabled ? 'Disable' : 'Enable'} ${permission.label} for ${plan.name}`}
                          >
                            {enabled ? <Check className="h-5 w-5" /> : null}
                          </button>
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
                const expired = expiresAt.getTime() < Date.now()
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
