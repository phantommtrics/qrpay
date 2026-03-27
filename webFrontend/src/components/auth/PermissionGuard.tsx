import type { ReactNode } from 'react'

import { useAuth } from '../../features/auth/AuthContext'
import type { PermissionKey, UserRole } from '../../types'

interface PermissionGuardProps {
  permission: PermissionKey
  fallback?: ReactNode
  children: ReactNode
}

export function PermissionGuard({ permission, fallback = null, children }: PermissionGuardProps) {
  const { canAccess } = useAuth()

  if (!canAccess(permission)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

interface AnyPermissionGuardProps {
  permissions: PermissionKey[]
  fallback?: ReactNode
  children: ReactNode
}

export function AnyPermissionGuard({ permissions, fallback = null, children }: AnyPermissionGuardProps) {
  const { hasAnyPermission } = useAuth()

  if (!hasAnyPermission(permissions)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

interface RoleGuardProps {
  roles: UserRole[]
  fallback?: ReactNode
  children: ReactNode
}

export function RoleGuard({ roles, fallback = null, children }: RoleGuardProps) {
  const { user } = useAuth()

  if (!user || !roles.includes(user.role)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
