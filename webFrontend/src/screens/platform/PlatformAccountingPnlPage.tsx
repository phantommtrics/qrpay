import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { FinanceReportChrome } from '../../components/finance/FinanceReportChrome'
import { ReportExportToolbar } from '../../components/finance/ReportExportToolbar'
import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformProfitLossReport,
  type PlatformProfitLossReportData,
} from '../../services/subscriptionApi'
import { downloadCsv, downloadFinancePdf, type PdfTableSection } from '../../utils/financeReportExport'
import { formatMoney } from '../../utils/formatMoney'

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonthYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function pnlSectionRows(
  title: string,
  lines: PlatformProfitLossReportData['revenue']['lines'],
  total: number,
): PdfTableSection {
  const headers = ['Code', 'Account', 'Amount']
  const rows =
    lines.length === 0
      ? [['—', 'No activity in this period', formatMoney(0, { decimals: 2 })]]
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

export function PlatformAccountingPnlPage() {
  const { canAccess } = useAuth()
  const canExport = canAccess('platform.accounting.export')

  const [from, setFrom] = useState(firstOfMonthYmd)
  const [to, setTo] = useState(todayYmd)
  const [data, setData] = useState<PlatformProfitLossReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    void fetchPlatformProfitLossReport(from, to)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load report.'))
      .finally(() => setLoading(false))
  }, [from, to])

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
    push('Total trading income', data.revenue.lines, data.revenue.total)
    push('Cost of sales', data.costOfSales.lines, data.costOfSales.total)
    rows.push(['', '', 'Gross profit', data.grossProfit.toFixed(2)])
    push('Total operating expenses', data.operatingExpenses.lines, data.operatingExpenses.total)
    rows.push(['', '', 'Net profit', data.netProfit.toFixed(2)])
    downloadCsv(`platform-profit-loss-${from}-${to}.csv`, headers, rows)
  }

  const exportPdf = async () => {
    if (!data) return
    await downloadFinancePdf({
      title: 'DPay platform — Profit & loss',
      subtitle: periodLabel,
      sections: [
        pnlSectionRows('Total trading income', data.revenue.lines, data.revenue.total),
        pnlSectionRows('Cost of sales', data.costOfSales.lines, data.costOfSales.total),
        {
          heading: 'Gross profit',
          headers: ['Line', 'Amount'],
          rows: [['Gross profit', formatMoney(data.grossProfit, { decimals: 2 })]],
          columnWeights: [2.6, 1.1],
          columnAlign: ['left', 'right'],
        },
        pnlSectionRows(
          'Total operating expenses',
          data.operatingExpenses.lines,
          data.operatingExpenses.total,
        ),
        {
          heading: 'Net profit',
          headers: ['Line', 'Amount'],
          rows: [['Net profit', formatMoney(data.netProfit, { decimals: 2 })]],
          columnWeights: [2.6, 1.1],
          columnAlign: ['left', 'right'],
        },
      ],
      filename: `platform-profit-loss-${from}-${to}.pdf`,
    })
  }

  const fieldClass =
    'rounded-sm border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

  const rowLabel = 'text-sm font-semibold text-qb-heading'
  const rowValue = 'text-sm font-semibold tabular-nums text-qb-heading'

  function AccountLines({
    lines,
    emptyHint,
  }: {
    lines: PlatformProfitLossReportData['revenue']['lines']
    emptyHint: string
  }) {
    if (lines.length === 0) {
      return (
        <p className="rounded-sm border border-dashed border-qb-border bg-qb-surface/30 px-3 py-3 text-sm text-qb-muted">
          {emptyHint}
        </p>
      )
    }
    return (
      <div className="overflow-x-auto rounded-sm border border-qb-border">
        <table className="w-full min-w-[400px] text-sm">
          <tbody className="divide-y divide-qb-border">
            {lines.map((l) => (
              <tr key={l.chartOfAccountId} className="hover:bg-qb-surface/40">
                <td className="px-3 py-2 font-mono text-xs">{l.code}</td>
                <td className="px-3 py-2 text-qb-heading">{l.name}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {formatMoney(l.amount, { decimals: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <PageTransition>
      <FinanceReportChrome
        title="Profit & loss report"
        description="Income statement for the selected period. Only revenue and expense accounts appear. Account lines with net zero activity in the period are hidden; positive and negative amounts are shown as posted."
        backTo={APP_PATHS.platformAccounting}
        backLabel="Back to platform accounting"
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
              <div className="rounded-lg border border-qb-border bg-gradient-to-br from-qb-primary-soft/60 to-white px-5 py-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                  Net profit (loss)
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-qb-heading sm:text-4xl">
                  {formatMoney(data.netProfit, { decimals: 2 })}
                </p>
                <p className="mt-2 text-xs text-qb-muted">Period: {periodLabel}</p>
              </div>

              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className={rowLabel}>Total trading income</h3>
                  <span className={rowValue}>{formatMoney(data.revenue.total, { decimals: 2 })}</span>
                </div>
                <AccountLines
                  lines={data.revenue.lines}
                  emptyHint="No trading income in this period."
                />
              </section>

              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className={rowLabel}>Cost of sales</h3>
                  <span className={rowValue}>{formatMoney(data.costOfSales.total, { decimals: 2 })}</span>
                </div>
                <AccountLines
                  lines={data.costOfSales.lines}
                  emptyHint="No cost of sales in this period."
                />
              </section>

              <div className="flex items-baseline justify-between gap-4 border-y border-qb-border py-4">
                <h3 className="text-base font-semibold text-qb-heading">Gross profit</h3>
                <span className="text-base font-semibold tabular-nums text-qb-heading">
                  {formatMoney(data.grossProfit, { decimals: 2 })}
                </span>
              </div>

              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className={rowLabel}>Total operating expenses</h3>
                  <span className={rowValue}>
                    {formatMoney(data.operatingExpenses.total, { decimals: 2 })}
                  </span>
                </div>
                <AccountLines
                  lines={data.operatingExpenses.lines}
                  emptyHint="No operating expenses in this period."
                />
              </section>
            </div>
          ) : null}
        </PageCard>
      </FinanceReportChrome>
    </PageTransition>
  )
}
