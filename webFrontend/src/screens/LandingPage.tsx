import { motion } from 'framer-motion'
import {
  ArrowRight,
  BookOpen,
  Check,
  Minus,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'

export function LandingPage() {
  const { plans, planPermissions, permissionDefinitions, user } = useAuth()

  /** Omit EasyPay admin-only (platform) permissions from the public plan preview table. */
  const businessPermissionRows = useMemo(
    () => permissionDefinitions.filter((p) => !p.key.startsWith('platform.')),
    [permissionDefinitions],
  )

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.35),transparent_45%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="relative shrink-0">
                <div
                  className="absolute -inset-1 rounded-[1.125rem] bg-teal-400/25 blur-md sm:-inset-1.5 sm:rounded-2xl"
                  aria-hidden
                />
                <div className="relative rounded-2xl bg-gradient-to-br from-white/15 to-white/5 p-[3px] shadow-[0_4px_24px_rgba(45,212,191,0.35)] ring-1 ring-teal-400/60 ring-offset-2 ring-offset-slate-950">
                  <img
                    src="/app_logo.png"
                    alt="EASYPAY"
                    className="h-12 w-12 rounded-[13px] object-cover shadow-inner sm:h-14 sm:w-14 sm:rounded-[15px]"
                    width={56}
                    height={56}
                  />
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold">EASYPAY</p>
                <p className="flex items-center gap-x-1.5 text-xs text-slate-400">
                  <span>Scan</span>
                  <span className="inline-flex h-[1lh] select-none items-center justify-center leading-none">
                    .
                  </span>
                  <span>pay</span>
                  <span className="inline-flex h-[1lh] select-none items-center justify-center leading-none">
                    .
                  </span>
                  <span>go</span>
                </p>
              </div>
            </div>
            <div className="hidden w-full shrink-0 flex-wrap items-center gap-2 sm:flex sm:w-auto sm:justify-end sm:gap-3">
              <Link
                to={APP_PATHS.login}
                className="rounded-full border border-white/15 px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10 sm:px-4"
              >
                Sign In
              </Link>
              <Link
                to={user ? APP_PATHS.dashboard : APP_PATHS.signup}
                className="rounded-full bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 sm:px-4"
              >
                {user ? 'Open Dashboard' : 'Get Started'}
              </Link>
            </div>
          </div>

          <div className="grid gap-10 py-10 sm:gap-12 sm:py-16 lg:grid-cols-[1.2fr_0.8fr] lg:py-24">
            <div>
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl">
                  Launch your EASYPAY storefront, team, and subscription access in one place.
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
                  Showcase your business online, create an organization, choose a plan, and let
                  staff sign in with plan-aware access while subscriptions stay in sync.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
                  <Link
                    to={APP_PATHS.signup}
                    className="inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-3 font-semibold text-slate-950 hover:bg-slate-100 sm:w-auto"
                  >
                    Create Organization
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </div>
              </motion.div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  {
                    icon: Store,
                    title: 'Business onboarding',
                    text: 'Choose a plan, create an organization, and start with subscriptions that stay tied to your team.',
                  },
                  {
                    icon: Users,
                    title: 'Staff-aware plans',
                    text: 'Staff limits per plan—see Subscription Plans below.',
                  },
                  {
                    icon: ShieldCheck,
                    title: 'Platform controls',
                    text: 'EasyPay can assign module permissions per plan with check marks.',
                  },
                  {
                    icon: BookOpen,
                    title: 'Books & journals',
                    text: 'Accounts, journal, and ledgers in EasyPay—linked to sales and payments.',
                  },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-slate-900/55 p-4">
                    <item.icon className="h-6 w-6 shrink-0 text-teal-400" />
                    <h3 className="mt-3 font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mb-8 max-w-2xl sm:mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
            Subscription Plans
          </p>
          <h2 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
            Choose the plan that fits your team
          </h2>
          <p className="mt-3 text-slate-600 leading-relaxed">
            Each plan can be configured by EasyPay, while businesses use the plan that
            matches their current staff size.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-3xl border p-5 shadow-sm sm:p-6 ${
                plan.highlighted
                  ? 'border-teal-500 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-900'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
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
              <div className="mt-6 space-y-1">
                <p className="break-words text-2xl font-bold sm:text-3xl">{plan.priceLabel}</p>
                <p
                  className={`text-lg font-semibold ${
                    plan.highlighted ? 'text-teal-200' : 'text-teal-700'
                  }`}
                >
                  {plan.yearlyPriceLabel}
                </p>
              </div>
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
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="mb-8 max-w-3xl sm:mb-10">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
                What You Control
              </p>
              <h2 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
                Permission-based plans your business can grow into
              </h2>
              <p className="mt-3 text-slate-600 leading-relaxed">
                Customers can see exactly how EASYPAY scales from startup teams to enterprise
                operations. EasyPay assigns these permissions per subscription plan.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:rounded-3xl">
              <div className="border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-slate-900 sm:text-xl">
                      Plan access preview
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Views, exports, reporting, and team controls by plan.
                    </p>
                  </div>
                  <div className="shrink-0 self-start rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-700">
                    Public preview
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                <table className="w-full min-w-[42rem] border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500 sm:text-sm">
                      <th className="sticky left-0 z-10 min-w-[11rem] bg-slate-50 p-3 font-medium sm:p-4">
                        Permission
                      </th>
                      {plans.map((plan) => (
                        <th key={plan.id} className="min-w-[6.5rem] p-3 font-medium sm:p-4">
                          <div className="font-semibold text-slate-900">{plan.name}</div>
                          <div className="text-xs text-slate-400">{plan.staffLabel}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {businessPermissionRows.map((permission) => (
                      <tr key={permission.key}>
                        <td className="sticky left-0 z-10 min-w-[11rem] border-r border-slate-100 bg-white p-3 sm:p-4">
                          <div className="font-medium text-slate-900">{permission.label}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            {permission.description}
                          </div>
                        </td>
                        {plans.map((plan) => {
                          const enabled = Boolean(planPermissions[plan.id]?.[permission.key])

                          return (
                            <td key={plan.id} className="p-3 sm:p-4">
                              <span
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl border sm:h-10 sm:w-10 ${
                                  enabled
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                    : 'border-slate-200 bg-slate-50 text-slate-300'
                                }`}
                              >
                                {enabled ? (
                                  <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                                ) : (
                                  <Minus className="h-4 w-4 sm:h-5 sm:w-5" />
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
