import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  fetchMerchantSettlementRequestDetail,
  type MerchantSettlementRequestDetail,
} from '../services/merchantSettlementApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

function localStatusLabel(status: MerchantSettlementRequestDetail['status']): string {
  if (status === 'OPEN') return 'Open'
  if (status === 'COMPLETED') return 'Completed'
  return 'Cancelled'
}

function desklineStatusLabel(status: string | null): string {
  if (!status) return '—'
  return status
    .split('_')
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(' ')
}

export function SalesSettlementDetailPage() {
  const { requestId } = useParams<{ requestId: string }>()
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id ?? null

  const [detail, setDetail] = useState<MerchantSettlementRequestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!businessId || !requestId) return
      if (opts?.soft) setRefreshing(true)
      else setLoading(true)
      setError(null)
      try {
        setDetail(await fetchMerchantSettlementRequestDetail(businessId, requestId))
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load request.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [businessId, requestId],
  )

  useEffect(() => {
    void load()
  }, [load])

  if (!businessId) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <p className="text-qb-muted">Select a business to continue.</p>
        </PageCard>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageCard variant="plain" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={APP_PATHS.salesSettlement}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-qb-muted hover:text-qb-heading"
            >
              <ArrowLeft className="h-4 w-4" />
              Settlement
            </Link>
            <button
              type="button"
              onClick={() => void load({ soft: true })}
              disabled={loading || refreshing}
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-qb-border bg-white px-3 text-sm font-medium text-qb-heading hover:bg-qb-surface disabled:opacity-45"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-qb-muted" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : detail ? (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">
                  {detail.ticketingRef ?? 'Settlement request'}
                </h1>
                <p className="mt-1 text-sm text-qb-muted">
                  {new Date(detail.createdAt).toLocaleString()}
                  {detail.requestedByName ? ` · ${detail.requestedByName}` : ''}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    Amount
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-qb-heading">
                    {formatMoney(detail.amount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    Request
                  </p>
                  <p className="mt-1 text-sm font-medium text-qb-heading">
                    {localStatusLabel(detail.status)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    Deskline
                  </p>
                  <p className="mt-1 text-sm font-medium text-qb-heading">
                    {desklineStatusLabel(detail.desklineStatus)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    Ticket
                  </p>
                  <p className="mt-1 text-sm font-medium text-qb-heading">
                    {detail.ticketingRef ?? '—'}
                  </p>
                </div>
              </div>

              {detail.note ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Note</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-qb-heading">{detail.note}</p>
                </div>
              ) : null}

              {detail.desklineSummary ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    Summary
                  </p>
                  <p className="mt-2 text-sm text-qb-heading">{detail.desklineSummary}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </PageCard>

        {detail && !loading && !error ? (
          <>
            <PageCard variant="plain">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-qb-muted">
                Status changes
              </h2>
              {detail.statusChanges.length === 0 ? (
                <p className="mt-4 text-sm text-qb-muted">No status changes yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {detail.statusChanges.map((event) => (
                    <li
                      key={event.id}
                      className="rounded-md border border-qb-border/70 px-4 py-3"
                    >
                      <p className="text-sm font-medium text-qb-heading">
                        {event.fromStatus
                          ? `${desklineStatusLabel(event.fromStatus)} → ${desklineStatusLabel(event.toStatus)}`
                          : desklineStatusLabel(event.toStatus)}
                      </p>
                      <p className="mt-1 text-xs text-qb-muted">
                        {new Date(event.createdAt).toLocaleString()}
                        {event.actorName ? ` · ${event.actorName}` : ''}
                      </p>
                      {event.note ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-qb-heading">
                          {event.note}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </PageCard>

            <PageCard variant="plain">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-qb-muted">
                Comments
              </h2>
              {detail.comments.length === 0 ? (
                <p className="mt-4 text-sm text-qb-muted">No comments yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {detail.comments.map((comment) => (
                    <li
                      key={comment.id}
                      className="rounded-md border border-qb-border/70 px-4 py-3"
                    >
                      <p className="text-xs font-semibold text-qb-heading">{comment.authorName}</p>
                      <p className="mt-0.5 text-xs text-qb-muted">
                        {new Date(comment.createdAt).toLocaleString()}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-qb-heading">
                        {comment.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </PageCard>
          </>
        ) : null}
      </div>
    </PageTransition>
  )
}
