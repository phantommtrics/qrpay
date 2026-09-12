import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

import { PageCard } from '../ui/PageCard'

export function DashboardStatTile({
  title,
  value,
  icon: Icon,
  iconColor,
  iconBg,
  footnote,
  footIsTrend = false,
  footPositive = true,
}: {
  title: string
  value: string
  icon: LucideIcon
  iconColor: string
  iconBg: string
  footnote: string
  footIsTrend?: boolean
  footPositive?: boolean
}) {
  return (
    <PageCard className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-1 text-sm font-medium text-slate-500">{title}</p>
          <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
        </div>
        <div className={`rounded-lg p-3 ${iconBg}`}>
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
      </div>
      <div className="mt-4 flex items-center text-sm">
        {footIsTrend ? (
          <>
            {footPositive ? (
              <ArrowUpRight className="mr-1 h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <ArrowDownRight className="mr-1 h-4 w-4 shrink-0 text-amber-500" />
            )}
            <span
              className={
                footPositive ? 'font-medium text-emerald-600' : 'font-medium text-amber-600'
              }
            >
              {footnote}
            </span>
          </>
        ) : (
          <span className="text-slate-500">{footnote}</span>
        )}
      </div>
    </PageCard>
  )
}

export function DashboardMetricLink({
  to,
  label,
  value,
  hint,
}: {
  to: string
  label: string
  value: string
  hint?: string
}) {
  return (
    <Link
      to={to}
      className="block rounded-lg border border-slate-100 p-4 transition-colors hover:border-slate-200 hover:bg-slate-50"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-800">{value}</p>
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
    </Link>
  )
}
