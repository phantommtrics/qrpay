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
  allowedRoles,
}: {
  children: ReactNode
  requiredPermission: PermissionKey
  allowedRoles: UserRole[]
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

  if (
    !user.isPlatformOwner &&
    (subscriptionStatus === 'expired' || subscriptionStatus === 'past_due')
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
              Platform owners can still sign in and manage plan permissions. Business users are
              blocked once the payment window ends.
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!isRoleAllowed(allowedRoles) || !canAccess(requiredPermission)) {
    return (
      <AppLayout>
        <div className="flex min-h-full items-center justify-center">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <Lock className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Access blocked by plan settings</h2>
            <p className="mt-3 text-slate-600">
              Your role or subscription plan does not currently allow this module. Platform owners
              can update plan permissions from the plan controls screen.
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
