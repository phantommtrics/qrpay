import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { AlertTriangle, Lock } from 'lucide-react'

import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { AppLayout } from '../layouts/AppLayout'
import type { PermissionKey, UserRole } from '../types'

export function ProtectedRoute({
  children,
  requiredPermission,
  requiredAnyOfPermissions,
  allowedRoles,
  requireBusinessOwner,
}: {
  children: ReactNode
  /** Use this or `requiredAnyOfPermissions` (not both required, but one should be set). */
  requiredPermission?: PermissionKey
  /** User passes if they satisfy any of these (e.g. move users OR legacy system users view). */
  requiredAnyOfPermissions?: PermissionKey[]
  allowedRoles: UserRole[]
  /** When true, only the selected organization’s business owner may open this route. */
  requireBusinessOwner?: boolean
}) {
  const {
    user,
    currentOrganization,
    currentPlan,
    subscriptionStatus,
    canAccess,
    isRoleAllowed,
  } = useAuth()

  if (!user) {
    return <Navigate to={APP_PATHS.login} replace />
  }

  if (user.mustChangePassword) {
    return <Navigate to={APP_PATHS.changePassword} replace />
  }

  const billingRecovery =
    requiredPermission === 'subscriptions.billings' ||
    requiredPermission === 'subscriptions.invoices' ||
    requiredPermission === 'subscriptions.billing_activity' ||
    (requiredAnyOfPermissions?.includes('subscriptions.billings') ?? false) ||
    (requiredAnyOfPermissions?.includes('subscriptions.invoices') ?? false) ||
    (requiredAnyOfPermissions?.includes('subscriptions.billing_activity') ?? false)

  if (
    !user.isPlatformOwner &&
    !user.isPlatformAdmin &&
    (subscriptionStatus === 'expired' || subscriptionStatus === 'past_due') &&
    !billingRecovery
  ) {
    return (
      <AppLayout>
        <div className="flex min-h-full items-center justify-center">
          <div className="w-full max-w-2xl rounded-3xl border border-amber-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              Subscription access blocked for {currentOrganization?.name}
            </h2>
            <p className="mt-3 text-slate-600">
              This organization is on the {currentPlan?.name ?? 'current'} plan and needs a
              completed payment before protected tools can be opened again.
            </p>
            <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              DirectPay can still sign in and manage plan permissions. Business users are
              blocked once the payment window ends.
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  const permissionOk =
    requiredAnyOfPermissions && requiredAnyOfPermissions.length > 0
      ? requiredAnyOfPermissions.some((p) => canAccess(p))
      : requiredPermission
        ? canAccess(requiredPermission)
        : false

  if (!isRoleAllowed(allowedRoles) || !permissionOk) {
    return (
      <AppLayout>
        <div className="flex min-h-full items-center justify-center">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <Lock className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Access blocked by plan settings</h2>
            <p className="mt-3 text-slate-600">
              Your role or subscription plan does not currently allow this module. DirectPay
              can update plan permissions from the plan controls screen.
            </p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (requireBusinessOwner && !currentOrganization?.isOwner) {
    return (
      <AppLayout>
        <div className="flex min-h-full items-center justify-center">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <Lock className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Owner only</h2>
            <p className="mt-3 text-slate-600">
              The activity log is only available to the business owner for this organization.
            </p>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      {children}
    </AppLayout>
  )
}
