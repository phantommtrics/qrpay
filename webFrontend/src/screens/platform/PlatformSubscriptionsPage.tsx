import { useCallback, useEffect, useState } from 'react'
import { Filter, RefreshCw } from 'lucide-react'
import { generatePath, Link } from 'react-router-dom'

import { TablePagination } from '../../components/ui/TablePagination'
import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformSubscriptions,
  type BackendSubscriptionStatus,
  type PlatformSubscriptionRow,
} from '../../services/subscriptionApi'
import { localCalendarIsoDate } from '../../utils/localCalendarDate'

const PAGE_SIZE = 10

const STATUS_OPTIONS: Array<{ value: ''; label: 'All statuses' } | { value: BackendSubscriptionStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'TRIALING', label: 'Trialing' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAST_DUE', label: 'Past due' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' },
]

function formatShortDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function PlatformSubscriptionsPage() {
  const { user } = useAuth()
  const [status, setStatus] = useState<'' | BackendSubscriptionStatus>('')
  const [createdFrom, setCreatedFrom] = useState(() => localCalendarIsoDate())
  const [createdTo, setCreatedTo] = useState(() => localCalendarIsoDate())
  const [rows, setRows] = useState<PlatformSubscriptionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user?.isPlatformOwner) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchPlatformSubscriptions({
        status: status || undefined,
        createdFrom: createdFrom.trim() || localCalendarIsoDate(),
        createdTo: createdTo.trim() || localCalendarIsoDate(),
        page,
        pageSize: PAGE_SIZE,
      })
      setRows(payload.data)
      setTotal(payload.total)
    } catch (e) {
      setRows([])
      setTotal(0)
      setError(e instanceof ApiError ? e.message : 'Could not load subscriptions.')
    } finally {
      setLoading(false)
    }
  }, [user?.isPlatformOwner, status, createdFrom, createdTo, page])

  useEffect(() => {
    void load()
  }, [load])

  if (!user?.isPlatformOwner) {
    return null
  }

  const resetFiltersToToday = () => {
    const today = localCalendarIsoDate()
    setStatus('')
    setCreatedFrom(today)
    setCreatedTo(today)
    setPage(1)
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
            Platform
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Subscriptions</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Filter by lifecycle status and by when the subscription record was created. Date range
            defaults to today (00:00–23:59 UTC per selected calendar day).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <PageCard className="p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Filter className="h-4 w-4 text-teal-600" />
          Filters
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Status</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as '' | BackendSubscriptionStatus)
                setPage(1)
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-800 outline-none focus:border-teal-500"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Created from</span>
            <input
              type="date"
              value={createdFrom}
              onChange={(e) => {
                setCreatedFrom(e.target.value)
                setPage(1)
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-800 outline-none focus:border-teal-500"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Created to</span>
            <input
              type="date"
              value={createdTo}
              onChange={(e) => {
                setCreatedTo(e.target.value)
                setPage(1)
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-800 outline-none focus:border-teal-500"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={resetFiltersToToday}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Reset to today
            </button>
          </div>
        </div>
      </PageCard>

      <PageCard className="overflow-hidden p-0">
        {loading && rows.length === 0 ? (
          <p className="p-8 text-sm text-slate-500">Loading subscriptions…</p>
        ) : error ? (
          <p className="p-8 text-sm text-red-600">{error}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              {rows.length === 0 ? (
                <p className="p-8 text-sm text-slate-500">No subscriptions match these filters.</p>
              ) : (
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Business</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Period end</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.id} className="bg-white hover:bg-slate-50/80">
                        <td className="px-4 py-3">
                          <Link
                            to={generatePath(APP_PATHS.platformBusinessDetail, {
                              businessId: r.business.id,
                            })}
                            className="font-medium text-teal-700 hover:underline"
                          >
                            {r.business.name}
                          </Link>
                          <p className="text-xs text-slate-500">{r.business.ownerEmail}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{r.plan.name}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {r.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatShortDate(r.currentPeriodEnd)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatShortDate(r.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {total > 0 ? (
              <TablePagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={setPage}
              />
            ) : null}
          </>
        )}
      </PageCard>
    </PageTransition>
  )
}
