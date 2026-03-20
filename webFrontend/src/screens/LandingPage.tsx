import { motion } from 'framer-motion'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Minus,
  QrCode,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'

export function LandingPage() {
  const { plans, planPermissions, permissionDefinitions, user } = useAuth()

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.35),transparent_45%)]" />
        <div className="relative mx-auto max-w-7xl px-6 py-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-500/20">
                <QrCode className="h-6 w-6 text-teal-400" />
              </div>
              <div>
                <p className="text-lg font-bold">QRPay</p>
                <p className="text-xs text-slate-400">Retail and restaurant payments</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to={APP_PATHS.login}
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/10"
              >
                Sign In
              </Link>
              <Link
                to={user ? APP_PATHS.dashboard : APP_PATHS.signup}
                className="rounded-full bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400"
              >
                {user ? 'Open Dashboard' : 'Get Started'}
              </Link>
            </div>
          </div>

          <div className="grid gap-12 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:py-24">
            <div>
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
                <div className="mb-5 inline-flex items-center rounded-full border border-teal-400/25 bg-teal-400/10 px-4 py-1.5 text-sm text-teal-200">
                  Subscription-ready QR payments for small, big, and enterprise businesses
                </div>
                <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-white md:text-6xl">
                  Launch your QRPay storefront, team, and subscription access in one place.
                </h1>
                <p className="mt-6 max-w-2xl text-lg text-slate-300">
                  Showcase your business online, create an organization, choose a plan, and let
                  staff sign in with plan-aware access powered by mock data for now.
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                  <Link
                    to={APP_PATHS.signup}
                    className="inline-flex items-center rounded-full bg-white px-6 py-3 font-semibold text-slate-950 hover:bg-slate-100"
                  >
                    Create Organization
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                  <Link
                    to={APP_PATHS.login}
                    className="inline-flex items-center rounded-full border border-white/15 px-6 py-3 font-semibold text-white hover:bg-white/10"
                  >
                    Use Demo Sign In
                  </Link>
                </div>
              </motion.div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  {
                    icon: Store,
                    title: 'Business onboarding',
                    text: 'Choose a plan, create an organization, and start with a guided mock setup.',
                  },
                  {
                    icon: Users,
                    title: 'Staff-aware plans',
                    text: 'Basic supports 3-5 staff, Pro covers 6-10, and Business Pro scales without limits.',
                  },
                  {
                    icon: ShieldCheck,
                    title: 'Platform controls',
                    text: 'Platform owners can assign module permissions per plan with check marks.',
                  },
                  {
                    icon: CheckCircle2,
                    title: 'Plan-aware login',
                    text: 'Mock sign-in auto-detects the organization, subscription plan, and expiry state.',
                  },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-slate-900/55 p-4">
                    <item.icon className="h-6 w-6 text-teal-400" />
                    <h3 className="mt-3 font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm text-slate-300">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="mb-10 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
            Subscription Plans
          </p>
          <h2 className="mt-3 text-3xl font-bold text-slate-900">Choose the plan that fits your team</h2>
          <p className="mt-3 text-slate-600">
            Each plan can be configured by the platform owner, while businesses use the plan that
            matches their current staff size.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-3xl border p-6 shadow-sm ${
                plan.highlighted
                  ? 'border-teal-500 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className={plan.highlighted ? 'text-slate-300' : 'text-slate-500'}>
                    {plan.staffLabel}
                  </p>
                </div>
                {plan.highlighted ? (
                  <span className="rounded-full bg-teal-500 px-3 py-1 text-xs font-semibold text-slate-950">
                    Popular
                  </span>
                ) : null}
              </div>
              <p className="mt-6 text-3xl font-bold">{plan.priceLabel}</p>
              <p className={`mt-3 text-sm ${plan.highlighted ? 'text-slate-300' : 'text-slate-600'}`}>
                {plan.description}
              </p>
              <Link
                to={APP_PATHS.signup}
                className={`mt-8 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 font-semibold ${
                  plan.highlighted
                    ? 'bg-white text-slate-950 hover:bg-slate-100'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                Start with {plan.name}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {!user ? (
        <section className="bg-slate-50">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
            <div className="mb-10 max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
                What You Control
              </p>
              <h2 className="mt-3 text-3xl font-bold text-slate-900">
                Permission-based plans your business can grow into
              </h2>
              <p className="mt-3 text-slate-600">
                Customers can see exactly how QRPay scales from startup teams to enterprise
                operations. Platform owners assign these permissions per subscription plan.
              </p>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900">
                      Plan access preview
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Views, exports, reporting, and team controls by plan.
                    </p>
                  </div>
                  <div className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-700">
                    Public preview
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50 text-sm text-slate-500">
                      <th className="p-4 font-medium">Permission</th>
                      {plans.map((plan) => (
                        <th key={plan.id} className="p-4 font-medium">
                          <div className="font-semibold text-slate-900">{plan.name}</div>
                          <div className="text-xs text-slate-400">{plan.staffLabel}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {permissionDefinitions.map((permission) => (
                      <tr key={permission.key}>
                        <td className="p-4">
                          <div className="font-medium text-slate-900">{permission.label}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            {permission.description}
                          </div>
                        </td>
                        {plans.map((plan) => {
                          const enabled = planPermissions[plan.id][permission.key]

                          return (
                            <td key={plan.id} className="p-4">
                              <span
                                className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${
                                  enabled
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                    : 'border-slate-200 bg-slate-50 text-slate-300'
                                }`}
                              >
                                {enabled ? (
                                  <Check className="h-5 w-5" />
                                ) : (
                                  <Minus className="h-5 w-5" />
                                )}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}
