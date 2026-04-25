import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { FinanceReportChrome } from '../../components/finance/FinanceReportChrome'
import { ReportExportToolbar } from '../../components/finance/ReportExportToolbar'
import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformGlBalanceReport,
  type PlatformGlBalanceReportData,
} from '../../services/subscriptionApi'
import { downloadCsv, downloadFinancePdf } from '../../utils/financeReportExport'
import { formatMoney } from '../../utils/formatMoney'

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

export function PlatformAccountingGlPage() {
  const { canAccess } = useAuth()
  const canExport = canAccess('platform.accounting.export')

  const [asOf, setAsOf] = useState(todayYmd)
  const [data, setData] = useState<PlatformGlBalanceReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    void fetchPlatformGlBalanceReport(asOf)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load report.'))
      .finally(() => setLoading(false))
  }, [asOf])

  useEffect(() => {
    load()
  }, [load])

  const exportCsv = () => {
    if (!data) return
    const headers = ['Code', 'Account', 'Category', 'Debit', 'Credit', 'Balance']
    const rows = data.rows.map((r) => [
      r.code,
      r.name,
      r.category,
      r.debitTotal.toFixed(2),
      r.creditTotal.toFixed(2),
      r.balance.toFixed(2),
    ])
    rows.push([
      '',
      'Totals',
      '',
      data.totalDebit.toFixed(2),
      data.totalCredit.toFixed(2),
      data.difference.toFixed(2),
    ])
    downloadCsv(`platform-gl-balance-${asOf}.csv`, headers, rows)
  }

  const exportPdf = async () => {
    if (!data) return
    await downloadFinancePdf({
      title: 'DirectPay platform — GL balance',
      subtitle: `As at ${asOf}`,
      sections: [
        {
          headers: ['Code', 'Account', 'Category', 'Debit', 'Credit', 'Balance'],
          rows: data.rows.map((r) => [
            r.code,
            r.name,
            r.category,
            formatMoney(r.debitTotal, { decimals: 2 }),
            formatMoney(r.creditTotal, { decimals: 2 }),
            formatMoney(r.balance, { decimals: 2 }),
          ]),
          columnWeights: [0.85, 2.5, 1.25, 1, 1, 1],
          columnAlign: ['left', 'left', 'left', 'right', 'right', 'right'],
        },
        {
          heading: 'Check',
          headers: ['Total debits', 'Total credits', 'Difference (should be 0)'],
          rows: [
            [
              formatMoney(data.totalDebit, { decimals: 2 }),
              formatMoney(data.totalCredit, { decimals: 2 }),
              formatMoney(data.difference, { decimals: 2 }),
            ],
          ],
          columnWeights: [1, 1, 1],
          columnAlign: ['right', 'right', 'right'],
        },
      ],
      filename: `platform-gl-balance-${asOf}.pdf`,
    })
  }

  const fieldClass =
    'rounded-sm border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

  return (
    <PageTransition>
      <FinanceReportChrome
        title="Platform GL balance"
        description="Trial balance for DirectPay platform accounts (subscription revenue, clearing, infrastructure expenses)."
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
          className="space-y-4 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                As at
              </span>
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
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
            <div className="overflow-x-auto rounded-sm border border-qb-border">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-qb-border bg-qb-surface text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    <th className="px-3 py-2.5">Code</th>
                    <th className="px-3 py-2.5">Account</th>
                    <th className="px-3 py-2.5">Category</th>
                    <th className="px-3 py-2.5 text-right">Debit</th>
                    <th className="px-3 py-2.5 text-right">Credit</th>
                    <th className="px-3 py-2.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-qb-border">
                  {data.rows.map((r) => (
                    <tr key={r.chartOfAccountId} className="hover:bg-qb-surface/40">
                      <td className="px-3 py-2 font-mono text-xs text-qb-heading">{r.code}</td>
                      <td className="px-3 py-2 text-qb-heading">{r.name}</td>
                      <td className="px-3 py-2 text-qb-muted">{r.category}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(r.debitTotal, { decimals: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(r.creditTotal, { decimals: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-qb-heading">
                        {formatMoney(r.balance, { decimals: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-qb-border bg-qb-surface/80 font-semibold">
                    <td colSpan={3} className="px-3 py-2.5 text-qb-heading">
                      Totals
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(data.totalDebit, { decimals: 2 })}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(data.totalCredit, { decimals: 2 })}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-qb-muted">
                      Δ {formatMoney(data.difference, { decimals: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : null}
        </PageCard>
      </FinanceReportChrome>
    </PageTransition>
  )
}
