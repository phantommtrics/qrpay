import { useState, type FormEvent } from 'react'
import { ArrowRight, Building2, CheckCircle2, QrCode } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import type { PlanId } from '../types'

export function SignupPage() {
  const navigate = useNavigate()
  const { plans, registerOrganization } = useAuth()
  const [form, setForm] = useState({
    ownerName: '',
    ownerEmail: '',
    organizationName: '',
    industry: 'Retail',
    planId: 'basic' as PlanId,
    staffCount: 3,
  })
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

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
        'Account created. Check your email for a temporary password. Your 7-day payment trial has started.',
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
              <p className="text-xl font-bold">Create your QRPay organization</p>
              <p className="text-sm text-slate-400">
                Choose a plan, create an account, and start a 7-day payment trial.
              </p>
            </div>
          </div>

          <div className="mt-10 space-y-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-2xl border p-4 ${
                  form.planId === plan.id
                    ? 'border-teal-400 bg-teal-500/10'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{plan.name}</h3>
                    <p className="text-sm text-slate-400">{plan.staffLabel}</p>
                  </div>
                  <p className="text-sm font-semibold text-teal-300">{plan.priceLabel}</p>
                </div>
                <p className="mt-2 text-sm text-slate-300">{plan.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            Platform owner demo login:
            <div className="mt-2 font-mono text-teal-300">owner@qrpay.com / demo123</div>
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
                </select>
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
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
