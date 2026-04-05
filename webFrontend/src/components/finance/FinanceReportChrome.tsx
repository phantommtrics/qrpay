import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageCard } from '../ui/PageCard'
import { APP_PATHS } from '../../config/navigation'

export function FinanceReportChrome({
  title,
  description,
  toolbar,
  children,
}: {
  title: string
  description?: string
  toolbar?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-5 py-2 lg:space-y-6">
      <PageCard
        variant="default"
        className="space-y-4 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
      >
        <Link
          to={APP_PATHS.accounting}
          className="inline-flex items-center text-sm font-medium text-qb-muted hover:text-qb-heading"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to accounting
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">{title}</h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-qb-muted">{description}</p>
            ) : null}
          </div>
          {toolbar ? <div className="shrink-0">{toolbar}</div> : null}
        </div>
      </PageCard>
      {children}
    </div>
  )
}
