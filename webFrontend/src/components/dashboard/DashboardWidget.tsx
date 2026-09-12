import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { PageCard } from '../ui/PageCard'
import { PageSectionHeader } from '../ui/PageSectionHeader'

export function DashboardWidget({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <PageCard className={`p-6 ${className}`}>
      <PageSectionHeader title={title} subtitle={subtitle} action={action} className="mb-4" />
      {children}
    </PageCard>
  )
}

export function DashboardWidgetLink({
  to,
  children,
}: {
  to: string
  children: ReactNode
}) {
  return (
    <Link to={to} className="text-sm font-medium text-teal-600 hover:text-teal-700">
      {children}
    </Link>
  )
}
