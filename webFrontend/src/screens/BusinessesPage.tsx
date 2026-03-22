import { useState, type FormEvent } from 'react'
import { Building2, CheckCircle2, Plus, Sparkles } from 'lucide-react'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import type { PlanId } from '../types'

export function BusinessesPage() {
  const {
    currentOrganization,
    organizations,
    plans,
    registerOrganization,
    setActiveOrganization,
    user,
  } = useAuth()
  const [form, setForm] = useState({
    ownerName: user?.name ?? '',
    ownerEmail: user?.email ?? '',
    password: '',
    organizationName: '',
    industry: 'Retail',
    planId: 'basic' as PlanId,
    staffCount: 3,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setIsSubmitting(true)

    const result = await registerOrganization(form)

    if (!result.ok) {
      setError(result.error ?? 'Unable to create business.')
      setIsSubmitting(false)
      return
    }

    setMessage(result.message ?? 'Business created and switched successfully.')
    setForm((current) => ({
      ...current,
      password: '',
      organizationName: '',
      industry: 'Retail',
      planId: 'basic',
      staffCount: 3,
    }))
    setIsSubmitting(false)
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <PageCard className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
              Business workspace
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">Manage your businesses</h2>
            <p className="mt-2 max-w-3xl text-slate-600">
              Switch between businesses on this account or create a new one with its own plan and
              trial period.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white">
            {organizations.length} business{organizations.length === 1 ? '' : 'es'} linked
          </div>
        </div>
      </PageCard>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <PageCard className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Your businesses</h3>
              <p className="text-sm text-slate-500">
                Select which business should be active in the app.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {organizations.map((organization) => {
              const isActive = organization.id === currentOrganization?.id
              const plan = plans.find((item) => item.id === organization.planId)

              return (
                <button
                  key={organization.id}
                  onClick={() => setActiveOrganization(organization.id)}
                  className={`w-full rounded-3xl border p-5 text-left transition-all ${
                    isActive
                      ? 'border-teal-300 bg-teal-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-semibold text-slate-900">{organization.name}</p>
                        {organization.isOwner ? (
                          <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                            Owner
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {organization.industry} · {plan?.name ?? 'Plan not loaded'}
                      </p>
                    </div>
                    {isActive ? (
                      <span className="rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        Switch
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">
                      {organization.staffCount} staff
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">
                      {organization.subscriptionState ?? 'active'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </PageCard>

        <PageCard className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Add another business</h3>
              <p className="text-sm text-slate-500">
                This business will be attached to the current login account.
              </p>
            </div>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Account owner</span>
                <input
                  value={form.ownerName}
                  disabled
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500 outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Account email</span>
                <input
                  value={form.ownerEmail}
                  disabled
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500 outline-none"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Account password
              </span>
              <input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                minLength={6}
                required
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
              />
              <span className="mt-2 block text-xs text-slate-500">
                We verify your existing login before attaching another business.
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Business name</span>
                <input
                  value={form.organizationName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, organizationName: event.target.value }))
                  }
                  required
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Industry</span>
                <select
                  value={form.industry}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, industry: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
                >
                  <option>Retail</option>
                  <option>Restaurant</option>
                  <option>Wholesale</option>
                  <option>Pharmacy</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Plan</span>
                <select
                  value={form.planId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      planId: event.target.value as PlanId,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} ({plan.staffLabel})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Staff count</span>
                <input
                  type="number"
                  min={1}
                  value={form.staffCount}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      staffCount: Number(event.target.value) || 0,
                    }))
                  }
                  required
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
                />
              </label>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{message}</span>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <div className="flex items-center gap-2 font-medium text-slate-800">
                <Sparkles className="h-4 w-4 text-teal-600" />
                New business onboarding
              </div>
              <p className="mt-2">
                The selected plan starts immediately with a 7-day trial before the first payment is
                due.
              </p>
            </div>

            <button
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Plus className="mr-2 h-4 w-4" />
              {isSubmitting ? 'Creating business...' : 'Add business'}
            </button>
          </form>
        </PageCard>
      </div>
    </PageTransition>
  )
}
