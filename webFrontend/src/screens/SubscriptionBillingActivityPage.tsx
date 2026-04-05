import { useCallback, useEffect, useMemo, useState } from 'react'
import { generatePath, Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { TablePagination } from '../components/ui/TablePagination'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  ApiError,
  fetchBusinessBillingLedgerReport,
  type BillingLedgerReportData,
  type BillingLedgerReportEntry,
} from '../services/subscriptionApi'

const PAGE_SIZE = 25

function calendarMonthNow(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function calendarYearNow(): string {
  return String(new Date().getFullYear())
}

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function displayProvider(code: string) {
  const c = code.trim()
  if (!c) {
    return '—'
  }
  const lower = c.toLowerCase()
  if (lower === 'wave') {
    return 'Wave'
  }
  return c
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function labelEntryType(type: string) {
  switch (type) {
    case 'INVOICE_PAYMENT':
      return 'Plan payment'
    case 'REFUND':
      return 'Refund'
    case 'ADJUSTMENT':
      return 'Adjustment'
    case 'WALLET_FEE':
      return 'Wallet fee'
    default: {
      const s = type.replace(/_/g, ' ').toLowerCase()
      return s.charAt(0).toUpperCase() + s.slice(1)
    }
  }
}

/** Business perspective: platform ledger MONEY_IN = cash leaving the business. */
function businessDirectionLabel(direction: string): string {
  if (direction === 'MONEY_IN') {
    return 'Out'
  }
  if (direction === 'MONEY_OUT') {
    return 'In'
  }
  return direction
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'SUCCEEDED':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    case 'PENDING':
      return 'bg-amber-50 text-amber-900 ring-amber-200'
    case 'FAILED':
      return 'bg-rose-50 text-rose-800 ring-rose-200'
    case 'CANCELLED':
      return 'bg-slate-100 text-slate-600 ring-slate-200'
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-200'
  }
}

function moneyLabel(amount: string, currency: string | null) {
  const u = currency?.trim() || 'GMD'
  return `${u} ${amount}`
}

type Granularity = 'month' | 'quarter' | 'year'

export function SubscriptionBillingActivityPage() {
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id

  const [granularity, setGranularity] = useState<Granularity>('month')
  const [monthValue, setMonthValue] = useState(() => calendarMonthNow())
  const [quarterIndex, setQuarterIndex] = useState(1)
  const [quarterYear, setQuarterYear] = useState(() => calendarYearNow())
  const [yearValue, setYearValue] = useState(() => calendarYearNow())

  const [applied, setApplied] = useState(() => ({
    granularity: 'month' as Granularity,
    month: calendarMonthNow(),
    quarter: `${calendarYearNow()}-Q1`,
    year: calendarYearNow(),
  }))

  const [page, setPage] = useState(1)
  const [report, setReport] = useState<BillingLedgerReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const periodParams = useMemo(() => {
    if (applied.granularity === 'month') {
      return { month: applied.month, quarter: undefined as string | undefined, year: undefined as string | undefined }
    }
    if (applied.granularity === 'quarter') {
      return { month: undefined as string | undefined, quarter: applied.quarter, year: undefined as string | undefined }
    }
    return { month: undefined as string | undefined, quarter: undefined as string | undefined, year: applied.year }
  }, [applied])

  const load = useCallback(async () => {
    if (!businessId) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchBusinessBillingLedgerReport(businessId, {
        ...periodParams,
        page,
        pageSize: PAGE_SIZE,
      })
      setReport(data)
    } catch (e) {
      setReport(null)
      setError(e instanceof ApiError ? e.message : 'Could not load activity.')
    } finally {
      setLoading(false)
    }
  }, [businessId, periodParams, page])

  useEffect(() => {
    void load()
  }, [load])

  const applyFilters = () => {
    const y = Number(quarterYear) || new Date().getFullYear()
    const q = `Q${Math.min(4, Math.max(1, quarterIndex))}`
    setApplied({
      granularity,
      month: monthValue,
      quarter: `${y}-${q}`,
      year: yearValue,
    })
    setPage(1)
  }

  if (!businessId) {
    return (
      <PageTransition className="space-y-6" withSlide>
        <PageCard className="p-6">
          <p className="text-slate-600">Select a business to view subscription payment activity.</p>
        </PageCard>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Subscription payments</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-600">
            Plan billing activity for {currentOrganization?.name}. Direction is from your business&apos;s view (out = paid
            toward your subscription).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <PageCard className="p-4 sm:p-6">
        <p className="mb-3 text-sm font-medium text-slate-700">Period</p>
        <div className="flex flex-wrap gap-3">
          {(['month', 'quarter', 'year'] as const).map((g) => (
            <label
              key={g}
              className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium capitalize transition ${
                granularity === g
                  ? 'border-teal-500 bg-teal-50 text-teal-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="granularity"
                className="sr-only"
                checked={granularity === g}
                onChange={() => setGranularity(g)}
              />
              {g === 'month' ? 'Monthly' : g === 'quarter' ? 'Quarterly' : 'Yearly'}
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          {granularity === 'month' ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Month
              <input
                type="month"
                value={monthValue}
                onChange={(e) => setMonthValue(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm"
              />
            </label>
          ) : null}
          {granularity === 'quarter' ? (
            <>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Quarter
                <select
                  value={quarterIndex}
                  onChange={(e) => setQuarterIndex(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm"
                >
                  <option value={1}>Q1</option>
                  <option value={2}>Q2</option>
                  <option value={3}>Q3</option>
                  <option value={4}>Q4</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Year
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={quarterYear}
                  onChange={(e) => setQuarterYear(e.target.value)}
                  className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm"
                />
              </label>
            </>
          ) : null}
          {granularity === 'year' ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Year
              <input
                type="number"
                min={2000}
                max={2100}
                value={yearValue}
                onChange={(e) => setYearValue(e.target.value)}
                className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm"
              />
            </label>
          ) : null}
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
          >
            Apply
          </button>
        </div>
      </PageCard>

      {error ? (
        <PageCard className="border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-800">{error}</PageCard>
      ) : null}

      <PageCard className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-slate-900">Transaction detail</h2>
          <p className="mt-1 text-sm text-slate-600">Newest first. Open an invoice when you need full billing context.</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
        ) : !report ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {error ? 'Could not load transactions.' : 'No data.'}
          </div>
        ) : report.entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No transactions in this period.</div>
        ) : (
          <>
            <div className="w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
              <table className="w-full min-w-[960px] border-collapse divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="min-w-[11rem] whitespace-nowrap px-6 py-4 first:pl-6">When</th>
                    <th className="min-w-[8rem] whitespace-nowrap px-6 py-4">Provider</th>
                    <th className="min-w-[9rem] whitespace-nowrap px-6 py-4">Type</th>
                    <th className="min-w-[6rem] whitespace-nowrap px-6 py-4">Direction</th>
                    <th className="min-w-[9rem] whitespace-nowrap px-6 py-4">Amount</th>
                    <th className="min-w-[7rem] whitespace-nowrap px-6 py-4">Status</th>
                    <th className="min-w-[7rem] whitespace-nowrap px-6 py-4 last:pr-6">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {report.entries.map((entry: BillingLedgerReportEntry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-6 py-4 text-slate-700 first:pl-6">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">
                        {displayProvider(entry.provider)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-700">{labelEntryType(entry.type)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-700">
                        {businessDirectionLabel(entry.direction)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-medium tabular-nums text-slate-900">
                        {moneyLabel(entry.amount, entry.currency)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(entry.status)}`}
                        >
                          {entry.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 last:pr-6">
                        {entry.invoice ? (
                          <Link
                            to={generatePath(APP_PATHS.subscriptionsInvoiceDetail, {
                              invoiceId: entry.invoice.id,
                            })}
                            className="font-medium text-teal-700 hover:text-teal-800 hover:underline"
                          >
                            View
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={report.page}
              pageSize={report.pageSize}
              total={report.total}
              onPageChange={setPage}
              compact
              className="rounded-b-2xl"
            />
          </>
        )}
      </PageCard>
    </PageTransition>
  )
}
