import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { AppLayout } from '../layouts/AppLayout'

export function ProtectedRoute({
  children,
}: {
  children: ReactNode
}) {
  const { user } = useAuth()

  if (!user) {
    return <Navigate to={APP_PATHS.root} replace />
  }

  return (
    <AppLayout>
      {children}
    </AppLayout>
  )
}
