import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Filter, RefreshCw } from 'lucide-react'
import { generatePath, Link } from 'react-router-dom'

import { TablePagination } from '../../components/ui/TablePagination'
import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformInvoices,
  type InvoiceStatus,
  type PlatformInvoiceRow,
} from '../../services/subscriptionApi'
import { localCalendarIsoDate } from '../../utils/localCalendarDate'
import { isPlatformOperator } from '../../utils/platformOperator'

const PAGE_SIZE = 10

const STATUS_OPTIONS: Array<{ value: ''; label: 'All statuses' } | { value: InvoiceStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PAID', label: 'Paid' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'VOID', label: 'Void' },
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

export function PlatformInvoicesPage() {
  const { user, canAccess } = useAuth()
  const [status, setStatus] = useState<'' | InvoiceStatus>('')
  const [createdFrom, setCreatedFrom] = useState(() => localCalendarIsoDate())
  const [createdTo, setCreatedTo] = useState(() => localCalendarIsoDate())
  const [rows, setRows] = useState<PlatformInvoiceRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isPlatformOperator(user)) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchPlatformInvoices({
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
      setError(e instanceof ApiError ? e.message : 'Could not load invoices.')
    } finally {
      setLoading(false)
    }
  }, [user?.isPlatformOwner, user?.isPlatformAdmin, status, createdFrom, createdTo, page])

  useEffect(() => {
    void load()
  }, [load])

  if (!isPlatformOperator(user)) {
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
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Invoices</h1>
          {canAccess('platform.billing_review.view') ? (
            <p className="mt-2 text-sm">
              <Link
                to={APP_PATHS.platformBillingReview}
                className="font-semibold text-teal-600 underline-offset-2 hover:text-teal-700 hover:underline"
              >
                Billing review & refunds
              </Link>
              <span className="text-slate-600">
                {' '}
                — refund flags, subscription period, and payment ledger context.
              </span>
            </p>
          ) : null}
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
                setStatus(e.target.value as '' | InvoiceStatus)
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
          <p className="p-8 text-sm text-slate-500">Loading invoices…</p>
        ) : error ? (
          <p className="p-8 text-sm text-red-600">{error}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              {rows.length === 0 ? (
                <p className="p-8 text-sm text-slate-500">No invoices match these filters.</p>
              ) : (
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Invoice</th>
                      <th className="px-4 py-3">Business</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Due</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="w-10 px-4 py-3" aria-hidden />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((inv) => (
                      <tr key={inv.id} className="bg-white hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {inv.id.slice(0, 12)}…
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{inv.business.name}</p>
                          <p className="text-xs text-slate-500">{inv.plan.name}</p>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {inv.amount} {inv.currency}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              inv.status === 'PAID'
                                ? 'bg-emerald-100 text-emerald-800'
                                : inv.status === 'PENDING'
                                  ? 'bg-amber-100 text-amber-900'
                                  : inv.status === 'FAILED'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatShortDate(inv.dueDate)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatShortDate(inv.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            to={generatePath(APP_PATHS.platformInvoiceDetail, {
                              invoiceId: inv.id,
                            })}
                            className="inline-flex rounded-lg p-1.5 text-teal-600 hover:bg-teal-50"
                            aria-label="View invoice"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </Link>
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
