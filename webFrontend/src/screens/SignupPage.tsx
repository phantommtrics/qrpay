import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Building2, CheckCircle2, QrCode } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import type { PlanId, SubscriptionBillingInterval, SubscriptionPlan } from '../types'
import { isCorporateIndustry } from '../utils/businessIndustry'

/** When switching plan, staff count defaults to the plan cap (or min when unlimited). */
function defaultStaffCountForPlan(plan: SubscriptionPlan): number {
  return plan.maxStaff !== null ? plan.maxStaff : plan.minStaff
}

function alignStaffCountToPlan(plan: SubscriptionPlan, current: number): number {
  let n = Number.isFinite(current) && current > 0 ? Math.floor(current) : plan.minStaff
  if (n < plan.minStaff) n = plan.minStaff
  if (plan.maxStaff !== null && n > plan.maxStaff) n = plan.maxStaff
  return n
}

export function SignupPage() {
  const navigate = useNavigate()
  const { plans, registerOrganization } = useAuth()
  const [form, setForm] = useState({
    ownerName: '',
    ownerEmail: '',
    organizationName: '',
    industry: 'Retail',
    planId: 'basic' as PlanId,
    /** Basic plan max in default catalog; effect syncs when plans load. */
    staffCount: 5,
    billingInterval: 'MONTHLY' as SubscriptionBillingInterval,
  })
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isCorp = isCorporateIndustry(form.industry)

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === form.planId) ?? null,
    [plans, form.planId],
  )

  useEffect(() => {
    if (isCorporateIndustry(form.industry)) {
      setForm((current) =>
        current.planId === 'corporate'
          ? current
          : { ...current, planId: 'corporate' as PlanId },
      )
    }
  }, [form.industry])

  /** When the user picks a plan (or plans load), set staff count to that plan's maximum (or min if unlimited). */
  useEffect(() => {
    setForm((current) => {
      const plan = plans.find((p) => p.id === current.planId)
      if (!plan) return current
      const next = defaultStaffCountForPlan(plan)
      return next === current.staffCount ? current : { ...current, staffCount: next }
    })
  }, [form.planId, plans])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setError(null)
    setIsSubmitting(true)

    const result = await registerOrganization(form)

    if (!result.ok) {
      setError(result.error ?? 'Unable to create the organization.')
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(false)
    if (result.redirectPath) {
      navigate(result.redirectPath, {
        state: {
          postSignupNotice:
            result.message ??
            'Account created. Check your email for a temporary password, then sign in.',
        },
      })
      return
    }

    setMessage(
      result.message ??
        'Account created. Check your email for a temporary password. Your 14-day payment trial has started.',
    )
    navigate(APP_PATHS.dashboard)
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl bg-slate-950 p-8 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/20">
              <QrCode className="h-6 w-6 text-teal-400" />
            </div>
            <div>
              <p className="text-xl font-bold">Create your DirectPay organization</p>
              <p className="text-sm text-slate-400">
                Choose a plan, create an account, and start a 14-day payment trial.
              </p>
            </div>
          </div>

          <div className="mt-10 space-y-4">
            <p className="text-sm font-medium text-slate-400">Select a plan</p>
            {plans.map((plan) => {
              const selected = form.planId === plan.id
              const disabled = isCorp && plan.id !== 'corporate'
              return (
                <button
                  key={plan.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() =>
                    setForm((current) => ({ ...current, planId: plan.id as PlanId }))
                  }
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selected
                      ? 'border-teal-400 bg-teal-500/10 ring-1 ring-teal-400/40'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]'
                  } ${disabled ? 'cursor-not-allowed opacity-40 hover:border-white/10 hover:bg-white/5' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{plan.name}</h3>
                      <p className="text-sm text-slate-400">{plan.staffLabel}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p
                        className={`font-semibold ${
                          selected && form.billingInterval === 'MONTHLY'
                            ? 'text-teal-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {plan.priceLabel}
                      </p>
                      <p
                        className={`mt-0.5 font-semibold ${
                          selected && form.billingInterval === 'YEARLY'
                            ? 'text-teal-300'
                            : 'text-slate-500'
                        }`}
                      >
                        {plan.yearlyPriceLabel}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{plan.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
              Get Started
            </p>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">Sign up and create organization</h1>
            <p className="mt-3 text-slate-600">
              Businesses can onboard here and the system will attach the selected subscription plan
              to the organization, then give one week to complete the first payment.
            </p>
            {selectedPlan ? (
              <div className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4 text-sm text-slate-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                  Your plan selection
                </p>
                <p className="mt-2 text-lg font-bold text-slate-900">{selectedPlan.name}</p>
                <p className="mt-0.5 text-slate-600">{selectedPlan.staffLabel}</p>
                <p className="mt-3 text-slate-600">{selectedPlan.description}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-teal-200/80 pt-3 text-slate-800">
                  <span className="font-medium">
                    {form.billingInterval === 'MONTHLY'
                      ? selectedPlan.priceLabel
                      : selectedPlan.yearlyPriceLabel}
                  </span>
                  <span className="text-slate-500">
                    {form.billingInterval === 'MONTHLY' ? 'Monthly billing' : 'Yearly billing'}
                  </span>
                </div>
                {!isCorp ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Change plan anytime before you submit — use the selectable plan cards in the
                    dark panel.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Owner name</span>
                <input
                  value={form.ownerName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, ownerName: event.target.value }))
                  }
                  required
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Owner email</span>
                <input
                  type="email"
                  value={form.ownerEmail}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, ownerEmail: event.target.value }))
                  }
                  required
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
                />
              </label>
            </div>

            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              We will email a temporary password to your owner email. You can start using the app
              right away; use that password the next time you sign in, then choose a new password.
            </p>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Organization name
                </span>
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
                  DirectPay will send an invoice and set up your corporate needs. Your subscription uses the
                  Corporate plan (without POS, products, orders, or categories); platform staff will assign
                  your pricing and billing cycle after onboarding.
                </p>
              </div>
            ) : null}

            <div className="grid gap-5 sm:grid-cols-2">
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
                  <option value="YEARLY">Yearly (renewal every 12 months)</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Staff count</span>
                <input
                  type="number"
                  min={selectedPlan?.minStaff ?? 1}
                  max={selectedPlan?.maxStaff ?? undefined}
                  value={form.staffCount}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      staffCount: Number(event.target.value) || 0,
                    }))
                  }
                  onBlur={() => {
                    if (!selectedPlan) return
                    setForm((current) => {
                      const aligned = alignStaffCountToPlan(selectedPlan, current.staffCount)
                      return aligned === current.staffCount ? current : { ...current, staffCount: aligned }
                    })
                  }}
                  required
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
                />
                {selectedPlan ? (
                  <span className="mt-2 block text-xs text-slate-500">
                    {selectedPlan.name} allows{' '}
                    {selectedPlan.maxStaff === null
                      ? `at least ${selectedPlan.minStaff} staff (${selectedPlan.staffLabel}).`
                      : `${selectedPlan.minStaff}–${selectedPlan.maxStaff} staff (${selectedPlan.staffLabel}).`}{' '}
                  </span>
                ) : null}
              </label>
            </div>

            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Yearly billing uses the plan&apos;s yearly rate and sets your subscription period to 12
              months after the trial invoice is paid (monthly uses one month).
            </p>

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

            <button
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Building2 className="mr-2 h-4 w-4" />
              {isSubmitting ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between text-sm text-slate-500">
            <Link to={APP_PATHS.root} className="hover:text-teal-600">
              Back to website
            </Link>
            <Link to={APP_PATHS.login} className="inline-flex items-center font-medium text-teal-600">
              Already have an account
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
