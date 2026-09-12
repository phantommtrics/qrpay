import { Link } from 'react-router-dom'

import { formatMoney } from '../../utils/formatMoney'
import { DashboardWidget, DashboardWidgetLink } from './DashboardWidget'

export type DocumentBucketSample = {
  id: string
  publicCode: string
  partyName: string
  dueDate: string | null
  amount: number
  currency: string
  overdue: boolean
}

export type DocumentBucketData = {
  count: number
  total: number
  overdueCount: number
  overdueTotal: number
  samples: DocumentBucketSample[]
}

function formatDue(iso: string | null): string {
  if (!iso) return 'No due date'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function SampleRow({
  sample,
  detailPath,
}: {
  sample: DocumentBucketSample
  detailPath: (id: string) => string
}) {
  return (
    <Link
      to={detailPath(sample.id)}
      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50"
    >
      <div className="min-w-0">
        <p className="truncate font-mono text-sm font-medium text-slate-800">{sample.publicCode}</p>
        <p className="truncate text-xs text-slate-500">
          {sample.partyName}
          {' · '}
          <span className={sample.overdue ? 'font-medium text-rose-600' : undefined}>
            {sample.overdue ? 'Overdue · ' : ''}
            {formatDue(sample.dueDate)}
          </span>
        </p>
      </div>
      <p className="shrink-0 font-semibold tabular-nums text-slate-800">
        {formatMoney(sample.amount, { decimals: 0 })}
      </p>
    </Link>
  )
}

export function DocumentBucketWidget({
  title,
  bucket,
  listPath,
  newPath,
  detailPath,
  canCreate,
  emptyLabel,
}: {
  title: string
  bucket: DocumentBucketData
  listPath: string
  newPath: string
  detailPath: (id: string) => string
  canCreate: boolean
  emptyLabel: string
}) {
  return (
    <DashboardWidget
      title={title}
      subtitle={
        bucket.count === 0
          ? undefined
          : `${bucket.count} open · ${formatMoney(bucket.total, { decimals: 0 })}`
      }
      action={
        <div className="flex items-center gap-3">
          {canCreate ? <DashboardWidgetLink to={newPath}>New</DashboardWidgetLink> : null}
          <DashboardWidgetLink to={listPath}>View all</DashboardWidgetLink>
        </div>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">Outstanding</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-800">
            {formatMoney(bucket.total, { decimals: 0 })}
          </p>
        </div>
        <div className={`rounded-lg p-3 ${bucket.overdueCount > 0 ? 'bg-rose-50' : 'bg-slate-50'}`}>
          <p className="text-xs font-medium text-slate-500">Overdue</p>
          <p
            className={`mt-1 text-xl font-semibold tabular-nums ${
              bucket.overdueCount > 0 ? 'text-rose-700' : 'text-slate-800'
            }`}
          >
            {formatMoney(bucket.overdueTotal, { decimals: 0 })}
          </p>
          {bucket.overdueCount > 0 ? (
            <p className="mt-0.5 text-xs text-rose-600">
              {bucket.overdueCount} document{bucket.overdueCount === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      </div>

      {bucket.samples.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {bucket.samples.map((sample) => (
            <SampleRow key={sample.id} sample={sample} detailPath={detailPath} />
          ))}
        </div>
      )}
    </DashboardWidget>
  )
}
