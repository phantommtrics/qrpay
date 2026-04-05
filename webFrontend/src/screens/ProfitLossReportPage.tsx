import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { FinanceReportChrome } from '../components/finance/FinanceReportChrome'
import { ReportExportToolbar } from '../components/finance/ReportExportToolbar'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import { fetchProfitLossReport, type ProfitLossReportData } from '../services/accountingReportsApi'
import { ApiError } from '../services/subscriptionApi'
import { downloadCsv, downloadFinancePdf, type PdfTableSection } from '../utils/financeReportExport'
import { formatMoney } from '../utils/formatMoney'

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonthYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function pnlSectionRows(
  title: string,
  lines: ProfitLossReportData['revenue']['lines'],
  total: number,
): PdfTableSection {
  const headers = ['Code', 'Account', 'Amount']
  const rows =
    lines.length === 0
      ? [['—', 'No activity', formatMoney(0, { decimals: 2 })]]
      : lines.map((l) => [l.code, l.name, formatMoney(l.amount, { decimals: 2 })])
  rows.push(['', `Total ${title}`, formatMoney(total, { decimals: 2 })])
  return {
    heading: title,
    headers,
    rows,
    columnWeights: [1, 2.3, 1.15],
    columnAlign: ['left', 'left', 'right'],
  }
}

export function ProfitLossReportPage() {
  const { currentOrganization, canAccess } = useAuth()
  const businessId = currentOrganization?.id
  const canExport = canAccess('accounting.reports.export')

  const [from, setFrom] = useState(firstOfMonthYmd)
  const [to, setTo] = useState(todayYmd)
  const [data, setData] = useState<ProfitLossReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!businessId) return
    setLoading(true)
    setError(null)
    void fetchProfitLossReport(businessId, from, to)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load report.'))
      .finally(() => setLoading(false))
  }, [businessId, from, to])

  useEffect(() => {
    load()
  }, [load])

  const periodLabel = useMemo(() => `${from} → ${to}`, [from, to])

  const exportCsv = () => {
    if (!data) return
    const headers = ['Section', 'Code', 'Account', 'Amount']
    const rows: string[][] = []
    const push = (section: string, lines: typeof data.revenue.lines, total: number) => {
      for (const l of lines) {
        rows.push([section, l.code, l.name, l.amount.toFixed(2)])
      }
      rows.push([section, '', 'Section total', total.toFixed(2)])
    }
    push('Revenue', data.revenue.lines, data.revenue.total)
    push('Cost of sales', data.costOfSales.lines, data.costOfSales.total)
    push('Operating expenses', data.operatingExpenses.lines, data.operatingExpenses.total)
    rows.push(['', '', 'Gross profit', data.grossProfit.toFixed(2)])
    rows.push(['', '', 'Net profit', data.netProfit.toFixed(2)])
    downloadCsv(`profit-loss-${from}-${to}.csv`, headers, rows)
  }

  const exportPdf = async () => {
    if (!data || !currentOrganization?.name) return
    await downloadFinancePdf({
      title: 'Profit & loss',
      subtitle: `${currentOrganization.name} · ${periodLabel}`,
      sections: [
        pnlSectionRows('Revenue', data.revenue.lines, data.revenue.total),
        pnlSectionRows('Cost of sales', data.costOfSales.lines, data.costOfSales.total),
        pnlSectionRows('Operating expenses', data.operatingExpenses.lines, data.operatingExpenses.total),
        {
          heading: 'Summary',
          headers: ['Line', 'Amount'],
          rows: [
            ['Gross profit', formatMoney(data.grossProfit, { decimals: 2 })],
            ['Net profit', formatMoney(data.netProfit, { decimals: 2 })],
          ],
          columnWeights: [2.6, 1.1],
          columnAlign: ['left', 'right'],
        },
      ],
      filename: `profit-loss-${from}-${to}.pdf`,
    })
  }

  if (!businessId) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <p className="text-qb-muted">Select a business.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const fieldClass =
    'rounded-sm border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

  function Section({
    title,
    lines,
    total,
  }: {
    title: string
    lines: ProfitLossReportData['revenue']['lines']
    total: number
  }) {
    return (
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-qb-muted">{title}</h3>
        <div className="mt-2 overflow-x-auto rounded-sm border border-qb-border">
          <table className="w-full min-w-[400px] text-sm">
            <tbody className="divide-y divide-qb-border">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-qb-muted">
                    No activity in this period.
                  </td>
                </tr>
              ) : (
                lines.map((l) => (
                  <tr key={l.chartOfAccountId} className="hover:bg-qb-surface/40">
                    <td className="px-3 py-2 font-mono text-xs">{l.code}</td>
                    <td className="px-3 py-2 text-qb-heading">{l.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatMoney(l.amount, { decimals: 2 })}
                    </td>
                  </tr>
                ))
              )}
              <tr className="bg-qb-surface/60 font-semibold">
                <td colSpan={2} className="px-3 py-2 text-qb-heading">
                  Total
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(total, { decimals: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <PageTransition>
      <FinanceReportChrome
        title="Profit & loss report"
        description="Income and expense accounts for a date range, grouped like Xero: revenue, cost of sales, operating expenses, with gross and net profit."
        toolbar={
          <ReportExportToolbar
            canExport={canExport}
            disabled={!data || loading}
            onCsv={exportCsv}
            onPdf={exportPdf}
          />
        }
      >
        <PageCard
          variant="default"
          className="space-y-6 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                From
              </span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={fieldClass}
              />
            </label>
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              className="rounded-sm border border-qb-border bg-white px-4 py-2 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
          {loading && !data ? (
            <div className="flex items-center gap-2 py-12 text-qb-muted">
              <Loader2 className="h-5 w-5 animate-spin text-qb-muted" />
              Loading…
            </div>
          ) : null}
          {data ? (
            <div className="space-y-8">
              <Section title="Revenue" lines={data.revenue.lines} total={data.revenue.total} />
              <Section
                title="Cost of sales"
                lines={data.costOfSales.lines}
                total={data.costOfSales.total}
              />
              <Section
                title="Operating expenses"
                lines={data.operatingExpenses.lines}
                total={data.operatingExpenses.total}
              />
              <div className="grid gap-4 border-t border-qb-border pt-6 sm:grid-cols-2">
                <div className="rounded-md border border-qb-border bg-qb-surface/40 p-4">
                  <p className="text-xs font-semibold uppercase text-qb-muted">Gross profit</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-qb-heading">
                    {formatMoney(data.grossProfit, { decimals: 2 })}
                  </p>
                </div>
                <div className="rounded-md border border-qb-border bg-qb-primary-soft/50 p-4">
                  <p className="text-xs font-semibold uppercase text-qb-heading">Net profit</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-qb-heading">
                    {formatMoney(data.netProfit, { decimals: 2 })}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </PageCard>
      </FinanceReportChrome>
    </PageTransition>
  )
}
