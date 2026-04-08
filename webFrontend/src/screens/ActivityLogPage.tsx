import { useEffect, useMemo, useState } from 'react'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import {
  fetchBusinessActivityLog,
  type ActivityLogListResponse,
  type ActivityLogRow,
} from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'

const PAGE_SIZE = 50

const EVENT_LABELS: Record<string, string> = {
  'payment.cash_completed': 'Cash payment recorded',
  'payment.wallet_initiated': 'QR wallet checkout started',
  'payment.wallet_settled': 'Wallet payment completed',
  'payment.sales_invoice_wallet_settled': 'Invoice paid (wallet)',
  'product.created': 'Product created',
  'product.updated': 'Product updated',
  'staff.user_invited': 'Staff invited',
  'staff.membership_status_changed': 'Staff access status changed',
}

/** Value '' = all events */
const EVENT_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All events' },
  { value: 'payment.cash_completed', label: EVENT_LABELS['payment.cash_completed'] },
  { value: 'payment.wallet_initiated', label: EVENT_LABELS['payment.wallet_initiated'] },
  { value: 'payment.wallet_settled', label: EVENT_LABELS['payment.wallet_settled'] },
  {
    value: 'payment.sales_invoice_wallet_settled',
    label: EVENT_LABELS['payment.sales_invoice_wallet_settled'],
  },
  { value: 'product.created', label: EVENT_LABELS['product.created'] },
  { value: 'product.updated', label: EVENT_LABELS['product.updated'] },
  { value: 'staff.user_invited', label: EVENT_LABELS['staff.user_invited'] },
  {
    value: 'staff.membership_status_changed',
    label: EVENT_LABELS['staff.membership_status_changed'],
  },
]

function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType
}

function formatMetadata(meta: unknown): string {
  if (meta == null) return '—'
  try {
    return JSON.stringify(meta)
  } catch {
    return String(meta)
  }
}

export function ActivityLogPage() {
  const { currentOrganization } = useAuth()
  const orgId = currentOrganization?.id
  const [data, setData] = useState<ActivityLogListResponse | null>(null)
  const [page, setPage] = useState(1)
  const [eventType, setEventType] = useState('')
  const [actorKind, setActorKind] = useState<'user' | 'system' | ''>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPage(1)
    setEventType('')
    setActorKind('')
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetchBusinessActivityLog(orgId, {
          page,
          pageSize: PAGE_SIZE,
          eventType: eventType || undefined,
          actorKind: actorKind || undefined,
        })
        if (!cancelled) {
          setData(res)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'Could not load activity log.')
          setData(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, page, eventType, actorKind])

  const rangeLabel = useMemo(() => {
    if (!data || data.total === 0) return 'No entries'
    const start = (data.page - 1) * data.pageSize + 1
    const end = Math.min(data.page * data.pageSize, data.total)
    return `Showing ${start}–${end} of ${data.total}`
  }, [data])

  const logs: ActivityLogRow[] = orgId && data ? data.logs : []

  return (
    <PageTransition className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Activity log</h1>
        <p className="mt-1 text-sm text-slate-500">
          Audit trail for this business: payments, product changes, and staff actions. Filter by event
          type or actor.
        </p>
      </div>

      {error ? (
        <PageCard className="border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</PageCard>
      ) : null}

      <PageCard className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <h2 className="font-semibold text-slate-800">Recent activity</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              Event
              <select
                value={eventType}
                onChange={(e) => {
                  setEventType(e.target.value)
                  setPage(1)
                }}
                className="min-w-[200px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              >
                {EVENT_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              Actor
              <select
                value={actorKind}
                onChange={(e) => {
                  setActorKind(e.target.value as 'user' | 'system' | '')
                  setPage(1)
                }}
                className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              >
                <option value="">All</option>
                <option value="user">Staff</option>
                <option value="system">System</option>
              </select>
            </label>
          </div>
        </div>
        <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
          <table className="min-w-[900px] w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm text-slate-500">
                <th className="px-5 py-4 font-medium">When</th>
                <th className="px-5 py-4 font-medium">Event</th>
                <th className="px-5 py-4 font-medium">Resource</th>
                <th className="px-5 py-4 font-medium">Actor</th>
                <th className="px-5 py-4 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!orgId ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                    Select an organization to view the log.
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                    No matching entries. Try clearing filters or check back after new activity.
                  </td>
                </tr>
              ) : (
                logs.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-3 text-sm whitespace-nowrap text-slate-600">
                      {new Date(row.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-800">{eventLabel(row.eventType)}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">
                      {row.resourceType}
                      {row.resourceId ? (
                        <span className="block truncate text-slate-500" title={row.resourceId}>
                          {row.resourceId}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-700">
                      {row.actorKind === 'system' ? (
                        <span className="text-slate-500">System</span>
                      ) : row.actor ? (
                        <span title={row.actor.email}>{row.actor.name}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="max-w-[280px] px-5 py-3 font-mono text-xs break-all text-slate-500">
                      {formatMetadata(row.metadata)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {orgId && data && !loading ? (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>{rangeLabel}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page * PAGE_SIZE >= (data?.total ?? 0)}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </PageCard>
    </PageTransition>
  )
}
