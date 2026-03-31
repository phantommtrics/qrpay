import { useMemo, useState, type FormEvent } from 'react'
import { BadgeCheck, Mail, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { Navigate, NavLink } from 'react-router-dom'

import { APP_PATHS } from '../config/navigation'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import type { BusinessMembershipStatus, UserRole } from '../types'

const MEMBERSHIP_STATUS_OPTIONS: { value: BusinessMembershipStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'TERMINATED', label: 'Terminated' },
]

type StaffRole = Extract<UserRole, 'merchant' | 'cashier'>

export function StaffPage() {
  const {
    user,
    canAccess,
    createStaffAccount,
    currentOrganization,
    currentPlan,
    organizationMembers,
  } = useAuth()
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'cashier' as StaffRole,
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canOpenStatusPage = canAccess('status.change.view')
  const seatLimit = currentPlan?.maxStaff ?? null
  const activeMembers = organizationMembers.filter((m) => m.membershipStatus !== 'TERMINATED').length
  const seatsRemaining = seatLimit === null ? null : Math.max(seatLimit - activeMembers, 0)
  const roleLabels: Record<StaffRole, string> = {
    merchant: 'Manager',
    cashier: 'Cashier',
  }

  const ownerSummary = useMemo(
    () => organizationMembers.find((member) => member.role === 'merchant'),
    [organizationMembers],
  )

  if (user && !user.isPlatformOwner && !currentOrganization?.isOwner) {
    return <Navigate to={APP_PATHS.dashboard} replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    setError(null)
    setSuccess(null)

    if (!form.name.trim() || !form.email.trim()) {
      setError('Name and email are required.')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await createStaffAccount({
        name: form.name,
        email: form.email,
        role: form.role,
      })

      if (!result.ok) {
        setError(result.error ?? 'Unable to create staff account.')
        return
      }

      setSuccess(result.message ?? 'Staff account created and email sent successfully.')
      setForm({
        name: '',
        email: '',
        role: 'cashier',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!currentOrganization || !currentPlan) {
    return (
      <PageTransition className="space-y-6">
        <PageCard className="p-8">
          <h2 className="text-2xl font-bold text-slate-900">Staff management</h2>
          <p className="mt-3 max-w-2xl text-slate-600">
            Sign in as a business account to create staff logins under an organization.
          </p>
        </PageCard>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="space-y-6">
      <PageCard className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
              Staff management
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">{currentOrganization.name}</h2>
            <p className="mt-2 text-slate-600">
              Create staff login accounts and keep usage within the {currentPlan.name} plan limit.
            </p>
            {canOpenStatusPage ? (
              <NavLink
                to={APP_PATHS.staffStatus}
                className="mt-4 inline-flex text-sm font-semibold text-teal-700 underline-offset-2 hover:underline"
              >
                Open staff access status
              </NavLink>
            ) : null}
          </div>
          <div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white">
            {currentPlan.name} plan • {currentPlan.staffLabel}
          </div>
        </div>
      </PageCard>

      <div className="grid gap-6 md:grid-cols-3">
        <PageCard className="p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Active logins</p>
            <Users className="h-5 w-5 text-teal-600" />
          </div>
          <p className="mt-4 text-3xl font-bold text-slate-900">{activeMembers}</p>
          <p className="mt-2 text-sm text-slate-500">
            Owner and staff with access (terminated logins do not count toward seats).
          </p>
        </PageCard>

        <PageCard className="p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Remaining seats</p>
            <BadgeCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-4 text-3xl font-bold text-slate-900">
            {seatsRemaining === null ? 'Unlimited' : seatsRemaining}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {seatLimit === null ? 'Business Pro can keep adding staff.' : `Up to ${seatLimit} total logins on this plan.`}
          </p>
        </PageCard>

        <PageCard className="p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Primary owner</p>
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="mt-4 text-lg font-bold text-slate-900">
            {ownerSummary?.name ?? currentOrganization.ownerName}
          </p>
          <p className="mt-2 text-sm text-slate-500">{ownerSummary?.email ?? 'Owner account active'}</p>
        </PageCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <PageCard className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">Add staff login</h3>
          <p className="mt-2 text-sm text-slate-600">
            Existing users will get a business access email. New users will receive a temporary password by email.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Full name</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Role</span>
              <select
                value={form.role}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    role: event.target.value as StaffRole,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
              >
                <option value="cashier">Cashier</option>
                <option value="merchant">Manager</option>
              </select>
            </label>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {success}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white transition-opacity hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              {isSubmitting ? 'Creating staff account...' : 'Create staff account'}
            </button>
          </form>
        </PageCard>

        <PageCard className="overflow-hidden">
          <div className="border-b border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">Current staff logins</h3>
            <p className="mt-1 text-sm text-slate-500">
              {canOpenStatusPage ? (
                <>
                  To block, suspend, or terminate access, use{' '}
                  <NavLink to={APP_PATHS.staffStatus} className="font-medium text-teal-700 underline-offset-2 hover:underline">
                    staff access status
                  </NavLink>
                  .
                </>
              ) : (
                'Access status is shown below for reference.'
              )}
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {organizationMembers.map((member) => {
              const status = member.membershipStatus ?? 'ACTIVE'
              const statusLabel =
                MEMBERSHIP_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status

              return (
                <div key={member.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{member.name}</p>
                    <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                      <Mail className="h-4 w-4" />
                      <span className="truncate">{member.email}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {member.isOwner ? 'Owner' : roleLabels[member.role as StaffRole] ?? member.role}
                    </div>
                    <div
                      className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                        status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : status === 'TERMINATED'
                            ? 'bg-slate-200 text-slate-700'
                            : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {statusLabel}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </PageCard>
      </div>
    </PageTransition>
  )
}
