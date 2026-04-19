import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, Building2, CheckCircle2, Plus, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { CenteredModal } from '../components/ui/CenteredModal'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import type { PlanId, SubscriptionBillingInterval } from '../types'
import { isCorporateIndustry } from '../utils/businessIndustry'

/** Must stay in sync with backend `registerBusinessOwner` 403 when subscription is blocking. */
const BLOCK_NEW_ORG_SUBSCRIPTION_MESSAGE =
  'Pay open subscription invoices or renew your expired or past-due business before creating another organization.'

function isBlockNewOrgSubscriptionError(message: string | undefined) {
  return Boolean(message?.includes('Pay open subscription invoices'))
}

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
    organizationName: '',
    industry: 'Retail',
    planId: 'basic' as PlanId,
    staffCount: 3,
    billingInterval: 'MONTHLY' as SubscriptionBillingInterval,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [subscriptionBlockModalOpen, setSubscriptionBlockModalOpen] = useState(false)

  const isCorp = isCorporateIndustry(form.industry)

  useEffect(() => {
    if (isCorporateIndustry(form.industry)) {
      setForm((current) =>
        current.planId === 'corporate'
          ? current
          : { ...current, planId: 'corporate' as PlanId },
      )
    }
  }, [form.industry])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setIsSubmitting(true)

    const result = await registerOrganization(form)

    if (!result.ok) {
      if (isBlockNewOrgSubscriptionError(result.error)) {
        setSubscriptionBlockModalOpen(true)
      } else {
        setError(result.error ?? 'Unable to create business.')
      }
      setIsSubmitting(false)
      return
    }

    setMessage(result.message ?? 'Business created and switched successfully.')
    setForm((current) => ({
      ...current,
      organizationName: '',
      industry: 'Retail',
      planId: 'basic',
      staffCount: 3,
      billingInterval: 'MONTHLY',
    }))
    setIsSubmitting(false)
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      {subscriptionBlockModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <ModalOverlay
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setSubscriptionBlockModalOpen(false)}
          />
          <CenteredModal className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="p-6" role="dialog" aria-modal="true" aria-labelledby="subscription-block-title">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h2 id="subscription-block-title" className="text-lg font-semibold text-slate-900">
                Cannot add a business yet
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                {BLOCK_NEW_ORG_SUBSCRIPTION_MESSAGE}
              </p>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  onClick={() => setSubscriptionBlockModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  Close
                </button>
                <Link
                  to={APP_PATHS.billing}
                  onClick={() => setSubscriptionBlockModalOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-500"
                >
                  Open billing
                </Link>
              </div>
            </div>
          </CenteredModal>
        </div>
      ) : null}

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
                    {organization.subscriptionBillingInterval === 'YEARLY' ? (
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-800">
                        Yearly billing
                      </span>
                    ) : organization.subscriptionBillingInterval === 'MONTHLY' ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1">Monthly billing</span>
                    ) : null}
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
                  <option>Petrol station</option>
                  <option>Corporate</option>
                </select>
              </label>
            </div>

            {isCorp ? (
              <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
                <p className="font-semibold text-teal-900">Custom billing (Corporate plan)</p>
                <p className="mt-1 text-teal-900/90">
                  EasyPay will send an invoice and set up your corporate needs. The Corporate plan excludes
                  POS, products, orders, and categories; pricing is assigned under Corporate in the operator
                  console.
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Plan</span>
                <select
                  value={form.planId}
                  disabled={isCorp}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      planId: event.target.value as PlanId,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} ({plan.staffLabel})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Billing cycle</span>
                <select
                  value={form.billingInterval}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      billingInterval: event.target.value as SubscriptionBillingInterval,
                    }))
                  }
                  className={`w-full rounded-2xl border px-4 py-3 outline-none focus:border-teal-500 ${
                    isCorp
                      ? 'border-teal-300 bg-teal-50/80 ring-1 ring-teal-200/60'
                      : 'border-slate-200'
                  }`}
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </label>
              <label className="block sm:col-span-2">
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
