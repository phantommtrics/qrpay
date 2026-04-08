import { useEffect, useState } from 'react'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { ApiError, fetchPlatformActivityLog, type PlatformActivityLogRow } from '../services/subscriptionApi'

const PAGE_SIZE = 50

const EVENT_LABELS: Record<string, string> = {
  'platform.journal.manual_posted': 'Manual journal posted',
  'platform.journal.reversed': 'Journal reversed',
  'platform.bill.paid': 'Supplier bill marked paid',
}

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

export function PlatformActivityLogPage() {
  const [logs, setLogs] = useState<PlatformActivityLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [eventType, setEventType] = useState('')
  const [actorKind, setActorKind] = useState<'user' | 'system' | ''>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetchPlatformActivityLog({
          page,
          pageSize: PAGE_SIZE,
          eventType: eventType || undefined,
          actorKind: actorKind || undefined,
        })
        if (cancelled) return
        setLogs(res.data.logs)
        setTotal(res.data.total)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'Could not load activity log.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [page, eventType, actorKind])

  return (
    <PageTransition>
      <div className="space-y-6 py-2">
        <PageCard variant="default" className="rounded-md border-qb-border p-5">
          <h1 className="text-2xl font-semibold text-qb-heading">Platform activity log</h1>
          <p className="mt-2 text-sm text-qb-muted">
            Operator actions outside tenant businesses (manual journals, supplier bills, etc.).
          </p>
        </PageCard>

        <PageCard variant="default" className="rounded-md border-qb-border p-5">
          <div className="mb-4 flex flex-wrap gap-3">
            <label className="flex flex-col text-xs font-semibold uppercase text-qb-muted">
              Event
              <select
                value={eventType}
                onChange={(e) => {
                  setPage(1)
                  setEventType(e.target.value)
                }}
                className="mt-1 rounded-sm border border-qb-border bg-white px-2 py-1.5 text-sm normal-case text-qb-heading"
              >
                <option value="">All events</option>
                <option value="platform.journal.manual_posted">
                  {eventLabel('platform.journal.manual_posted')}
                </option>
                <option value="platform.journal.reversed">{eventLabel('platform.journal.reversed')}</option>
                <option value="platform.bill.paid">{eventLabel('platform.bill.paid')}</option>
              </select>
            </label>
            <label className="flex flex-col text-xs font-semibold uppercase text-qb-muted">
              Actor
              <select
                value={actorKind}
                onChange={(e) => {
                  setPage(1)
                  setActorKind(e.target.value as 'user' | 'system' | '')
                }}
                className="mt-1 rounded-sm border border-qb-border bg-white px-2 py-1.5 text-sm normal-case text-qb-heading"
              >
                <option value="">All</option>
                <option value="user">User</option>
                <option value="system">System</option>
              </select>
            </label>
          </div>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {loading ? <p className="text-sm text-qb-muted">Loading…</p> : null}

          {!loading && logs.length === 0 ? (
            <p className="text-sm text-qb-muted">No events yet.</p>
          ) : null}

          <div className="mt-4 space-y-3">
            {logs.map((row) => (
              <div
                key={row.id}
                className="rounded-sm border border-qb-border bg-qb-surface/20 p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-qb-heading">{eventLabel(row.eventType)}</span>
                  <span className="text-xs text-qb-muted">{new Date(row.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-xs text-qb-muted">
                  {row.resourceType}
                  {row.resourceId ? ` · ${row.resourceId}` : ''}
                  {row.actor ? ` · ${row.actor.name}` : ''}
                </p>
                <p className="mt-2 font-mono text-xs text-qb-muted break-all">{formatMetadata(row.metadata)}</p>
              </div>
            ))}
          </div>

          {total > PAGE_SIZE ? (
            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-sm border border-qb-border px-3 py-1 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-qb-muted">
                Page {page} of {Math.ceil(total / PAGE_SIZE)}
              </span>
              <button
                type="button"
                disabled={page >= Math.ceil(total / PAGE_SIZE)}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-sm border border-qb-border px-3 py-1 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          ) : null}
        </PageCard>
      </div>
    </PageTransition>
  )
}
