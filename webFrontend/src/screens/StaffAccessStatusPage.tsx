import { useState } from 'react'
import { Mail, UserCog } from 'lucide-react'
import { Navigate, NavLink } from 'react-router-dom'

import { APP_PATHS } from '../config/navigation'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import { ApiError, updateMemberMembershipStatus } from '../services/subscriptionApi'
import type { BusinessMembershipStatus, UserRole } from '../types'

const MEMBERSHIP_STATUS_OPTIONS: { value: BusinessMembershipStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'TERMINATED', label: 'Terminated' },
]

type StaffRole = Extract<UserRole, 'merchant' | 'cashier'>

export function StaffAccessStatusPage() {
  const {
    user,
    canAccess,
    currentOrganization,
    currentPlan,
    organizationMembers,
    refreshOrganizationMembers,
  } = useAuth()
  const [statusError, setStatusError] = useState<string | null>(null)
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null)

  const roleLabels: Record<StaffRole, string> = {
    merchant: 'Manager',
    cashier: 'Cashier',
  }

  if (user && !user.isPlatformOwner && !currentOrganization?.isOwner) {
    return <Navigate to={APP_PATHS.dashboard} replace />
  }

  if (!canAccess('status.change.view')) {
    return <Navigate to={APP_PATHS.staff} replace />
  }

  const handleMembershipStatusChange = async (
    memberId: string,
    next: BusinessMembershipStatus,
  ) => {
    if (!currentOrganization || savingMemberId) {
      return
    }

    setStatusError(null)
    setSavingMemberId(memberId)

    try {
      await updateMemberMembershipStatus(currentOrganization.id, memberId, next)
      await refreshOrganizationMembers()
    } catch (e) {
      setStatusError(e instanceof ApiError ? e.message : 'Could not update access status.')
    } finally {
      setSavingMemberId(null)
    }
  }

  if (!currentOrganization || !currentPlan) {
    return (
      <PageTransition className="space-y-6">
        <PageCard className="p-8">
          <h2 className="text-2xl font-bold text-slate-900">Staff access status</h2>
          <p className="mt-3 max-w-2xl text-slate-600">
            Sign in as a business owner to manage staff access for this organization.
          </p>
        </PageCard>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="space-y-6">
      <PageCard className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
              <UserCog className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
                Staff access status
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">{currentOrganization.name}</h2>
              <p className="mt-2 max-w-2xl text-slate-600">
                Set each member to active, blocked, suspended, or terminated. Blocked and suspended
                users keep the business in their account but cannot use it. Terminated members are
                removed from the roster and no longer count toward plan seats.
              </p>
            </div>
          </div>
          <NavLink
            to={APP_PATHS.staff}
            className="shrink-0 rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Back to staff
          </NavLink>
        </div>
      </PageCard>

      <PageCard className="overflow-hidden">
        <div className="border-b border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">Members</h3>
          <p className="mt-1 text-sm text-slate-500">
            Owner accounts cannot be restricted here.
          </p>
        </div>
        {statusError ? (
          <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {statusError}
          </div>
        ) : null}
        <div className="divide-y divide-slate-100">
          {organizationMembers.map((member) => {
            const status = member.membershipStatus ?? 'ACTIVE'
            const statusLabel =
              MEMBERSHIP_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status

            return (
              <div
                key={member.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{member.name}</p>
                  <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span className="truncate">{member.email}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {member.isOwner ? 'Owner' : roleLabels[member.role as StaffRole] ?? member.role}
                    </span>
                  </div>
                  {!member.isOwner ? (
                    <label className="flex flex-col gap-1 text-left sm:min-w-[220px] sm:text-right">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        Access status
                      </span>
                      <select
                        value={status}
                        disabled={Boolean(savingMemberId)}
                        onChange={(event) => {
                          const next = event.target.value as BusinessMembershipStatus
                          void handleMembershipStatusChange(member.id, next)
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-teal-500 disabled:opacity-60"
                      >
                        {MEMBERSHIP_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {savingMemberId === member.id ? (
                        <span className="text-xs text-slate-500">Saving…</span>
                      ) : (
                        <span className="text-xs text-slate-400">Current: {statusLabel}</span>
                      )}
                    </label>
                  ) : (
                    <p className="text-xs text-slate-500">Owner access is always active.</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </PageCard>
    </PageTransition>
  )
}
