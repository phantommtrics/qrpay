import { useCallback, useEffect, useState } from 'react'
import { Building2, ChevronRight, Filter, Users } from 'lucide-react'
import { generatePath, Link } from 'react-router-dom'

import { TablePagination } from '../../components/ui/TablePagination'
import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformBusinessesList,
  type PlatformBusinessListRow,
} from '../../services/subscriptionApi'
import { localCalendarMonthEnd, localCalendarMonthStart } from '../../utils/localCalendarDate'
import { isPlatformOperator } from '../../utils/platformOperator'

const PAGE_SIZE = 10

function formatShortDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function PlatformBusinessesPage() {
  const { user } = useAuth()
  const [nameInput, setNameInput] = useState('')
  const [nameQ, setNameQ] = useState('')
  const [createdFrom, setCreatedFrom] = useState(() => localCalendarMonthStart())
  const [createdTo, setCreatedTo] = useState(() => localCalendarMonthEnd())
  const [rows, setRows] = useState<PlatformBusinessListRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setNameQ(nameInput.trim())
    }, 400)
    return () => window.clearTimeout(t)
  }, [nameInput])

  useEffect(() => {
    setPage(1)
  }, [nameQ])

  const load = useCallback(async () => {
    if (!isPlatformOperator(user)) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchPlatformBusinessesList({
        page,
        pageSize: PAGE_SIZE,
        q: nameQ || undefined,
        createdFrom: createdFrom.trim() || undefined,
        createdTo: createdTo.trim() || undefined,
      })
      setRows(payload.data)
      setTotal(payload.total)
    } catch (e) {
      setRows([])
      setTotal(0)
      setError(e instanceof ApiError ? e.message : 'Could not load businesses.')
    } finally {
      setLoading(false)
    }
  }, [user?.isPlatformOwner, user?.isPlatformAdmin, page, nameQ, createdFrom, createdTo])

  useEffect(() => {
    void load()
  }, [load])

  if (!isPlatformOperator(user)) {
    return null
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
          Platform
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Businesses</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Every registered business, current plan snapshot, and membership count. Open a row for
          full detail and team roster.
        </p>
      </div>

      <PageCard className="p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Filter className="h-4 w-4 text-teal-600" />
          Filters
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm sm:col-span-2 lg:col-span-1">
            <span className="mb-1 block font-medium text-slate-700">Business name</span>
            <input
              type="search"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Search name…"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-800 outline-none focus:border-teal-500"
            />
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
              onClick={() => {
                setNameInput('')
                setNameQ('')
                setCreatedFrom(localCalendarMonthStart())
                setCreatedTo(localCalendarMonthEnd())
                setPage(1)
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Reset to this month
            </button>
          </div>
        </div>
      </PageCard>

      <PageCard className="overflow-hidden p-0">
        {loading && rows.length === 0 ? (
          <p className="p-8 text-sm text-slate-500">Loading businesses…</p>
        ) : error ? (
          <p className="p-8 text-sm text-red-600">{error}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              {rows.length === 0 ? (
                <p className="p-8 text-sm text-slate-500">
                  {nameQ || createdFrom || createdTo
                    ? 'No businesses match these filters.'
                    : total === 0
                      ? 'No businesses yet.'
                      : 'No businesses on this page.'}
                </p>
              ) : (
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Business</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Members</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="w-10 px-4 py-3" aria-hidden />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((b) => {
                      const sub = b.subscriptions[0]
                      return (
                        <tr key={b.id} className="bg-white hover:bg-slate-50/80">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 font-medium text-slate-900">
                              <Building2 className="h-4 w-4 shrink-0 text-teal-600" />
                              <span className="truncate">{b.name}</span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-slate-500">{b.slug}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800">{b.ownerName}</p>
                            <p className="truncate text-xs text-slate-500">{b.ownerEmail}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {sub ? sub.plan.name : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {sub ? (
                              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                {sub.status.replace(/_/g, ' ')}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 text-slate-700">
                              <Users className="h-3.5 w-3.5 text-slate-400" />
                              {b._count.memberships}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatShortDate(b.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              to={generatePath(APP_PATHS.platformBusinessDetail, {
                                businessId: b.id,
                              })}
                              className="inline-flex rounded-lg p-1.5 text-teal-600 hover:bg-teal-50"
                              aria-label={`View ${b.name}`}
                            >
                              <ChevronRight className="h-5 w-5" />
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
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
