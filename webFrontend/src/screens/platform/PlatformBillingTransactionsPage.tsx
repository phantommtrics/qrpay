import { useCallback, useEffect, useMemo, useState } from 'react'
import { generatePath, Link } from 'react-router-dom'
import { CreditCard, Download, Filter, RefreshCw } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageSectionHeader } from '../../components/ui/PageSectionHeader'
import { PageTransition } from '../../components/ui/PageTransition'
import { TablePagination } from '../../components/ui/TablePagination'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  downloadPlatformBillingLedgerCsvExport,
  fetchPlatformBillingLedgerReport,
  type BillingLedgerReportData,
  type BillingLedgerReportEntry,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

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
      return 'Invoice payment'
    case 'REFUND':
      return 'Refund'
    case 'ADJUSTMENT':
      return 'Adjustment'
    default: {
      const s = type.replace(/_/g, ' ').toLowerCase()
      return s.charAt(0).toUpperCase() + s.slice(1)
    }
  }
}

function labelDirection(dir: string) {
  if (dir === 'MONEY_IN') {
    return 'In'
  }
  if (dir === 'MONEY_OUT') {
    return 'Out'
  }
  return dir
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

function MetadataCell({ entry }: { entry: BillingLedgerReportEntry }) {
  if (
    entry.metadata == null ||
    (typeof entry.metadata === 'object' && Object.keys(entry.metadata as object).length === 0)
  ) {
    return <span className="text-slate-400">—</span>
  }
  const raw = JSON.stringify(entry.metadata, null, 0)
  const short = raw.length > 48 ? `${raw.slice(0, 45)}…` : raw
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-teal-700 hover:text-teal-800">{short}</summary>
      <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-slate-900/90 p-2 text-[11px] text-slate-100">
        {JSON.stringify(entry.metadata, null, 2)}
      </pre>
    </details>
  )
}

type PeriodMode = 'all' | 'month' | 'quarter' | 'year' | 'custom'

export function PlatformBillingTransactionsPage() {
  const { user, canAccess } = useAuth()

  const [periodMode, setPeriodMode] = useState<PeriodMode>('all')
  const [monthValue, setMonthValue] = useState(() => calendarMonthNow())
  const [quarterIndex, setQuarterIndex] = useState(1)
  const [quarterYear, setQuarterYear] = useState(() => calendarYearNow())
  const [yearValue, setYearValue] = useState(() => calendarYearNow())
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [applied, setApplied] = useState(() => ({
    periodMode: 'all' as PeriodMode,
    month: calendarMonthNow(),
    quarter: `${calendarYearNow()}-Q1`,
    year: calendarYearNow(),
    customFrom: '',
    customTo: '',
  }))

  const [page, setPage] = useState(1)
  const [report, setReport] = useState<BillingLedgerReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const requestParams = useMemo((): Parameters<typeof fetchPlatformBillingLedgerReport>[0] => {
    const base: Parameters<typeof fetchPlatformBillingLedgerReport>[0] = {
      page,
      pageSize: PAGE_SIZE,
    }
    if (applied.periodMode === 'all') {
      return base
    }
    if (applied.periodMode === 'month') {
      return { ...base, month: applied.month }
    }
    if (applied.periodMode === 'quarter') {
      return { ...base, quarter: applied.quarter }
    }
    if (applied.periodMode === 'year') {
      return { ...base, year: applied.year }
    }
    if (applied.periodMode === 'custom') {
      return {
        ...base,
        createdFrom: applied.customFrom.trim() || undefined,
        createdTo: applied.customTo.trim() || undefined,
      }
    }
    return base
  }, [page, applied])

  const exportFilterParams = useMemo(() => {
    if (applied.periodMode === 'all') {
      return {}
    }
    if (applied.periodMode === 'month') {
      return { month: applied.month }
    }
    if (applied.periodMode === 'quarter') {
      return { quarter: applied.quarter }
    }
    if (applied.periodMode === 'year') {
      return { year: applied.year }
    }
    if (applied.periodMode === 'custom') {
      return {
        createdFrom: applied.customFrom.trim() || undefined,
        createdTo: applied.customTo.trim() || undefined,
      }
    }
    return {}
  }, [applied])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPlatformBillingLedgerReport(requestParams)
      setReport(data)
    } catch (e) {
      setReport(null)
      setError(e instanceof ApiError ? e.message : 'Could not load billing ledger.')
    } finally {
      setLoading(false)
    }
  }, [requestParams])

  const canExportLedger =
    canAccess('platform.billing_transactions.export') || canAccess('platform.invoices.export')

  const handleExportCsv = useCallback(async () => {
    if (!canExportLedger) {
      return
    }
    setExporting(true)
    setExportError(null)
    try {
      await downloadPlatformBillingLedgerCsvExport(exportFilterParams)
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }, [canExportLedger, exportFilterParams])

  useEffect(() => {
    void load()
  }, [load])

  const applyFilters = () => {
    setExportError(null)
    const y = Number(quarterYear) || new Date().getFullYear()
    const q = `Q${Math.min(4, Math.max(1, quarterIndex))}`
    setApplied({
      periodMode,
      month: monthValue,
      quarter: `${y}-${q}`,
      year: yearValue,
      customFrom,
      customTo,
    })
    setPage(1)
  }

  if (!isPlatformOperator(user)) {
    return (
      <PageTransition className="space-y-6" withSlide>
        <PageCard className="p-6">
          <p className="text-slate-600">Platform access required.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const cur = report?.currency?.trim() || 'GMD'
  const topProvider = report?.byProvider[0]

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="space-y-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Billing transactions</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Subscription billing ledger across <strong>all businesses</strong>, filtered by period. Money{' '}
              <strong>in</strong> is toward the platform; money <strong>out</strong> is the reverse.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 self-start sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleExportCsv()}
              disabled={loading || exporting || !canExportLedger}
              title={
                canExportLedger
                  ? 'Download CSV for the current filters (all matching rows, up to export limit)'
                  : 'Requires Billing transactions → Export (or legacy Invoices → Export) on your platform role'
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className={`h-4 w-4 ${exporting ? 'animate-pulse' : ''}`} />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>
        {exportError ? (
          <p className="text-sm text-rose-600" role="alert">
            {exportError}
          </p>
        ) : null}
      </div>

      <PageCard className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className="font-medium text-slate-700">Filters</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'month', 'quarter', 'year', 'custom'] as const).map((m) => (
            <label
              key={m}
              className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium capitalize transition ${
                periodMode === m
                  ? 'border-teal-500 bg-teal-50 text-teal-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="periodMode"
                className="sr-only"
                checked={periodMode === m}
                onChange={() => setPeriodMode(m)}
              />
              {m === 'all' ? 'All time' : m === 'custom' ? 'Custom range' : m}
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          {periodMode === 'month' ? (
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
          {periodMode === 'quarter' ? (
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
          {periodMode === 'year' ? (
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
          {periodMode === 'custom' ? (
            <>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                From
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                To
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm"
                />
              </label>
            </>
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

      {report && !loading ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <PageCard className="border-teal-100 bg-gradient-to-br from-teal-50/90 to-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-800/80">Net settled</p>
              {report.netSucceeded === '—' && report.netByCurrency.length > 1 ? (
                <ul className="mt-2 space-y-1.5">
                  {report.netByCurrency.map((n) => (
                    <li key={n.currency} className="text-lg font-semibold tabular-nums text-slate-900">
                      {moneyLabel(n.net, n.currency)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
                  {moneyLabel(report.netSucceeded, report.currency)}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-600">Succeeded in minus succeeded out, per currency when needed</p>
            </PageCard>
            <PageCard className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ledger rows</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{report.total}</p>
              <p className="mt-1 text-xs text-slate-600">Matching filters</p>
            </PageCard>
            <PageCard className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top provider</p>
              <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-900">
                <CreditCard className="h-5 w-5 text-teal-600" />
                {topProvider ? displayProvider(topProvider.provider) : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {topProvider
                  ? `${topProvider.entryCount} entries · ${cur} ${topProvider.succeededIn} in (settled)`
                  : 'No provider data'}
              </p>
            </PageCard>
            <PageCard className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">By status</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(report.byStatus).map(([k, n]) => (
                  <span
                    key={k}
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(k)}`}
                  >
                    {k.toLowerCase()} · {n}
                  </span>
                ))}
              </div>
            </PageCard>
          </div>

          <PageCard className="overflow-hidden p-0">
            <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
              <PageSectionHeader title="Payment methods (providers)" className="mb-1" />
              <p className="text-sm text-slate-600">Settled in/out uses succeeded rows only.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 sm:px-6">Provider</th>
                    <th className="whitespace-nowrap px-4 py-3">Entries</th>
                    <th className="whitespace-nowrap px-4 py-3">Settled in</th>
                    <th className="whitespace-nowrap px-4 py-3">Settled out</th>
                    <th className="whitespace-nowrap px-4 py-3">Pending</th>
                    <th className="whitespace-nowrap px-4 py-3 sm:pr-6">Failed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {report.byProvider.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                        No rows in this range.
                      </td>
                    </tr>
                  ) : (
                    report.byProvider.map((row) => (
                      <tr key={row.provider} className="hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 sm:px-6">
                          <span className="rounded-md bg-teal-50 px-2 py-0.5 text-teal-900">
                            {displayProvider(row.provider)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">{row.entryCount}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-emerald-800">
                          {moneyLabel(row.succeededIn, report.currency)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-rose-800">
                          {moneyLabel(row.succeededOut, report.currency)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-amber-800">{row.pendingCount}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700 sm:pr-6">
                          {row.failedCount}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </PageCard>

          <PageCard className="p-4 sm:p-6">
            <PageSectionHeader title="Entry types" className="mb-3" />
            <div className="flex flex-wrap gap-2">
              {Object.entries(report.byType).map(([k, n]) => (
                <span
                  key={k}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                >
                  {labelEntryType(k)} · {n}
                </span>
              ))}
            </div>
          </PageCard>
        </>
      ) : null}

      <PageCard className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
          <PageSectionHeader title="Transaction detail" className="mb-1" />
          <p className="text-sm text-slate-600">Ledger identifiers and metadata for reconciliation.</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading ledger…</div>
        ) : !report ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {error ? 'Could not load transactions.' : 'No data.'}
          </div>
        ) : report.entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No transactions in this range.</div>
        ) : (
          <>
            <div className="w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
              <table className="w-full min-w-[1280px] border-collapse divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="min-w-[11rem] whitespace-nowrap px-6 py-4 first:pl-6">Business</th>
                    <th className="min-w-[11rem] whitespace-nowrap px-6 py-4">When</th>
                    <th className="min-w-[8rem] whitespace-nowrap px-6 py-4">Provider</th>
                    <th className="min-w-[9rem] whitespace-nowrap px-6 py-4">Type</th>
                    <th className="min-w-[4.5rem] whitespace-nowrap px-6 py-4">Dir</th>
                    <th className="min-w-[9rem] whitespace-nowrap px-6 py-4">Amount</th>
                    <th className="min-w-[7rem] whitespace-nowrap px-6 py-4">Status</th>
                    <th className="min-w-[8rem] whitespace-nowrap px-6 py-4">Invoice</th>
                    <th className="min-w-[16rem] px-6 py-4 last:pr-6">Refs &amp; metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {report.entries.map((entry) => (
                    <tr key={entry.id} className="align-top hover:bg-slate-50/80">
                      <td className="max-w-[14rem] px-6 py-4 text-slate-800 first:pl-6">
                        {entry.business ? (
                          <Link
                            to={generatePath(APP_PATHS.platformBusinessDetail, {
                              businessId: entry.business.id,
                            })}
                            className="font-medium text-teal-700 hover:text-teal-800 hover:underline"
                          >
                            {entry.business.name}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-700">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">
                        {displayProvider(entry.provider)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-700">{labelEntryType(entry.type)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-700">{labelDirection(entry.direction)}</td>
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
                      <td className="whitespace-nowrap px-6 py-4 text-slate-700">
                        {entry.invoice ? (
                          <Link
                            to={generatePath(APP_PATHS.platformInvoiceDetail, {
                              invoiceId: entry.invoice.id,
                            })}
                            className="font-medium text-teal-700 hover:text-teal-800 hover:underline"
                          >
                            View invoice
                          </Link>
                        ) : entry.subscriptionInvoiceId ? (
                          <span className="text-xs text-slate-500">{entry.subscriptionInvoiceId.slice(0, 8)}…</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs leading-relaxed text-slate-600 last:pr-6">
                        <div className="space-y-1">
                          {entry.providerPaymentRef ? (
                            <p>
                              <span className="font-medium text-slate-500">Payment ref:</span> {entry.providerPaymentRef}
                            </p>
                          ) : null}
                          {entry.providerCheckoutSessionId ? (
                            <p className="break-all">
                              <span className="font-medium text-slate-500">Session:</span>{' '}
                              {entry.providerCheckoutSessionId}
                            </p>
                          ) : null}
                          {entry.idempotencyKey ? (
                            <p className="break-all">
                              <span className="font-medium text-slate-500">Idempotency:</span> {entry.idempotencyKey}
                            </p>
                          ) : null}
                          {entry.succeededAt ? (
                            <p className="text-emerald-800">Settled {formatDateTime(entry.succeededAt)}</p>
                          ) : null}
                          {entry.failedAt ? (
                            <p className="text-rose-800">Failed {formatDateTime(entry.failedAt)}</p>
                          ) : null}
                          <MetadataCell entry={entry} />
                        </div>
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
