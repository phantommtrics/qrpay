import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { AppLayout } from '../layouts/AppLayout'
import type { User } from '../types'

export function ProtectedRoute({
  user,
  onLogout,
  children,
}: {
  user: User | null
  onLogout: () => void
  children: ReactNode
}) {
  if (!user) {
    return <Navigate to="/" replace />
  }

  return (
    <AppLayout user={user} onLogout={onLogout}>
      {children}
    </AppLayout>
  )
}
