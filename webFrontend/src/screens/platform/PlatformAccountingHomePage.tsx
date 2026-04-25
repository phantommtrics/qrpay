import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BookOpenText,
  Calculator,
  FileSpreadsheet,
  NotebookPen,
  Scale,
  Table2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import { fetchPlatformProfitLossReport } from '../../services/subscriptionApi'
import { formatMoney } from '../../utils/formatMoney'

function firstOfMonthYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

export function PlatformAccountingHomePage() {
  const navigate = useNavigate()
  const { canAccess } = useAuth()
  const canChart = canAccess('platform.accounting.chart.view')
  const canJournals =
    canAccess('platform.accounting.view') || canAccess('platform.accounting.journals.access')
  const canGl = canAccess('platform.accounting.reports.gl')
  const canPnl = canAccess('platform.accounting.reports.pnl')
  const canStatement = canAccess('platform.accounting.reports.statement')
  const hasFinanceReports = canGl || canPnl || canStatement

  const [netProfit, setNetProfit] = useState<number | null>(null)
  const [pnlLoading, setPnlLoading] = useState(false)

  useEffect(() => {
    if (!canPnl) {
      setNetProfit(null)
      return
    }
    let cancelled = false
    setPnlLoading(true)
    void fetchPlatformProfitLossReport(firstOfMonthYmd(), todayYmd())
      .then((d) => {
        if (!cancelled) setNetProfit(d.netProfit)
      })
      .catch(() => {
        if (!cancelled) setNetProfit(null)
      })
      .finally(() => {
        if (!cancelled) setPnlLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [canPnl])

  const tileCard =
    'space-y-4 rounded-md border border-qb-border bg-white p-6 shadow-[0_1px_2px_rgba(57,58,61,0.08)] transition-shadow hover:shadow-[0_2px_8px_rgba(57,58,61,0.1)]'

  return (
    <PageTransition>
      <div className="space-y-10 py-4">
        <PageCard variant="plain">
          <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">Accounting</h1>
          <p className="mt-1 text-sm text-qb-muted">DirectPay platform — books, journals, and reports</p>
        </PageCard>

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {canPnl ? (
            <button type="button" onClick={() => navigate(APP_PATHS.platformAccountingReportPnl)}>
              <div className={tileCard}>
                <Calculator className="h-5 w-5 text-qb-heading" strokeWidth={1.5} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    Net profit (MTD)
                  </p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums text-qb-heading">
                    {pnlLoading ? '…' : netProfit === null ? '—' : formatMoney(netProfit, { decimals: 0 })}
                  </p>
                </div>
                <p className="flex items-center text-sm text-qb-muted">
                  Profit &amp; loss
                  <ArrowRight className="ml-1 h-4 w-4 text-qb-heading" />
                </p>
              </div>
            </button>
          ) : null}

          <button
            type="button"
            disabled={!canChart}
            onClick={() => canChart && navigate(APP_PATHS.platformAccountingChart)}
            className="text-left disabled:cursor-not-allowed disabled:opacity-45"
          >
            <div className={tileCard}>
              <BookOpenText className="h-5 w-5 text-qb-heading" strokeWidth={1.5} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                  Chart of accounts
                </p>
                <p className="mt-2 text-3xl font-semibold text-qb-heading">
                  {canChart ? 'Manage' : '—'}
                </p>
              </div>
              <p className="text-sm text-qb-muted">
                {canChart ? (
                  <>
                    Open
                    <ArrowRight className="ml-1 inline h-4 w-4 text-qb-heading" />
                  </>
                ) : (
                  'No access'
                )}
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled={!canJournals}
            onClick={() => canJournals && navigate(APP_PATHS.platformAccountingOperatorJournals)}
            className="text-left disabled:cursor-not-allowed disabled:opacity-45"
          >
            <div className={tileCard}>
              <NotebookPen className="h-5 w-5 text-qb-heading" strokeWidth={1.5} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                  Operator journals
                </p>
                <p className="mt-2 text-3xl font-semibold text-qb-heading">Post</p>
              </div>
              <p className="flex items-center text-sm text-qb-muted">
                Platform manual entries
                <ArrowRight className="ml-1 h-4 w-4 text-qb-heading" />
              </p>
            </div>
          </button>

          {canGl ? (
            <button type="button" onClick={() => navigate(APP_PATHS.platformAccountingReportGl)}>
              <div className={tileCard}>
                <Table2 className="h-5 w-5 text-qb-heading" strokeWidth={1.5} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    GL balance
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-qb-heading">Trial</p>
                </div>
                <p className="flex items-center text-sm text-qb-muted">
                  As at date
                  <ArrowRight className="ml-1 h-4 w-4 text-qb-heading" />
                </p>
              </div>
            </button>
          ) : null}
        </div>

        {hasFinanceReports ? (
          <PageCard
            variant="default"
            className="rounded-md border-qb-border p-6 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
          >
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-qb-muted">
              Financial reports
            </p>
            <p className="mb-6 max-w-2xl text-sm text-qb-muted">
              Period-based reports for the platform ledger. Export to CSV or PDF when your role includes
              export access on the relevant report module.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {canGl ? (
                <button
                  type="button"
                  onClick={() => navigate(APP_PATHS.platformAccountingReportGl)}
                  className="text-left"
                >
                  <div className="rounded-md border border-qb-border bg-qb-surface/40 p-4 transition-shadow hover:shadow-md">
                    <Scale className="h-5 w-5 text-qb-heading" strokeWidth={1.5} />
                    <p className="mt-3 text-sm font-semibold text-qb-heading">GL balance</p>
                    <p className="mt-1 text-xs text-qb-muted">Trial balance as at a date</p>
                    <p className="mt-2 flex items-center text-xs font-medium text-qb-heading">
                      Open <ArrowRight className="ml-1 h-3 w-3" />
                    </p>
                  </div>
                </button>
              ) : null}
              {canPnl ? (
                <button
                  type="button"
                  onClick={() => navigate(APP_PATHS.platformAccountingReportPnl)}
                  className="text-left"
                >
                  <div className="rounded-md border border-qb-border bg-qb-surface/40 p-4 transition-shadow hover:shadow-md">
                    <FileSpreadsheet className="h-5 w-5 text-qb-heading" strokeWidth={1.5} />
                    <p className="mt-3 text-sm font-semibold text-qb-heading">Profit &amp; loss</p>
                    <p className="mt-1 text-xs text-qb-muted">Revenue &amp; expenses by period</p>
                    <p className="mt-2 flex items-center text-xs font-medium text-qb-heading">
                      Open <ArrowRight className="ml-1 h-3 w-3" />
                    </p>
                  </div>
                </button>
              ) : null}
              {canStatement ? (
                <button
                  type="button"
                  onClick={() => navigate(APP_PATHS.platformAccountingReportStatement)}
                  className="text-left"
                >
                  <div className="rounded-md border border-qb-border bg-qb-surface/40 p-4 transition-shadow hover:shadow-md">
                    <BookOpenText className="h-5 w-5 text-qb-heading" strokeWidth={1.5} />
                    <p className="mt-3 text-sm font-semibold text-qb-heading">Account statement</p>
                    <p className="mt-1 text-xs text-qb-muted">Running balance per account</p>
                    <p className="mt-2 flex items-center text-xs font-medium text-qb-heading">
                      Open <ArrowRight className="ml-1 h-3 w-3" />
                    </p>
                  </div>
                </button>
              ) : null}
            </div>
          </PageCard>
        ) : null}
      </div>
    </PageTransition>
  )
}
