import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { FinanceReportChrome } from '../components/finance/FinanceReportChrome'
import { ReportExportToolbar } from '../components/finance/ReportExportToolbar'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import {
  fetchBalanceSheetReport,
  type BalanceSheetGroup,
  type BalanceSheetLine,
  type BalanceSheetReportData,
} from '../services/accountingReportsApi'
import { ApiError } from '../services/subscriptionApi'
import { downloadCsv, downloadFinancePdf, type PdfTableSection } from '../utils/financeReportExport'

/** Parentheses for negatives; no currency prefix — statement-style figures. */
function formatBs(n: number): string {
  const abs = Math.abs(n)
  const s = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (n < 0) return `(${s})`
  return s
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function pushGroupRows(
  rows: string[][],
  section: string,
  group: BalanceSheetGroup,
  includeSubtotal: boolean,
) {
  for (const l of group.lines) {
    rows.push([section, group.label, l.code, l.name, l.amount.toFixed(2)])
  }
  if (includeSubtotal && (group.lines.length > 0 || Math.abs(group.subtotal) > 1e-9)) {
    rows.push([section, group.label, '', `Total ${group.label}`, group.subtotal.toFixed(2)])
  }
}

function buildPdfSections(data: BalanceSheetReportData, orgName: string): PdfTableSection[] {
  const col = (label: string, amount: number): string[] => [label, formatBs(amount)]
  const lineRows = (lines: BalanceSheetLine[]) =>
    lines.map((l) => [`${l.code} — ${l.name}`, formatBs(l.amount)])

  const sections: PdfTableSection[] = [
    {
      heading: 'Assets',
      headers: ['', 'Amount'],
      rows: [],
      columnWeights: [2.8, 1],
      columnAlign: ['left', 'right'],
    },
  ]

  const assetRows: string[][] = []
  const pushAssetGroup = (g: BalanceSheetGroup) => {
    if (g.lines.length === 0 && Math.abs(g.subtotal) < 1e-9) return
    assetRows.push([g.label, ''])
    assetRows.push(...lineRows(g.lines))
    assetRows.push([`Total ${g.label}`, formatBs(g.subtotal)])
  }
  pushAssetGroup(data.assets.bank)
  pushAssetGroup(data.assets.otherCurrentAssets)
  assetRows.push(['Total assets', formatBs(data.assets.total)])

  sections[0].rows = assetRows

  const liabRows: string[][] = []
  const pushLiab = (g: BalanceSheetGroup) => {
    if (g.lines.length === 0 && Math.abs(g.subtotal) < 1e-9) return
    liabRows.push([g.label, ''])
    liabRows.push(...lineRows(g.lines))
    liabRows.push([`Total ${g.label}`, formatBs(g.subtotal)])
  }
  pushLiab(data.liabilities.current)
  pushLiab(data.liabilities.nonCurrent)
  liabRows.push(['Total liabilities', formatBs(data.liabilities.total)])

  sections.push({
    heading: 'Liabilities',
    headers: ['', 'Amount'],
    rows: liabRows,
    columnWeights: [2.8, 1],
    columnAlign: ['left', 'right'],
  })

  sections.push({
    heading: 'Net assets',
    headers: ['', 'Amount'],
    rows: [col('Net assets', data.netAssets)],
    columnWeights: [2.8, 1],
    columnAlign: ['left', 'right'],
  })

  const eqRows: string[][] = [...lineRows(data.equity.glLines)]
  eqRows.push([
    'Net income (year-to-date)',
    formatBs(data.equity.ytdNetIncome),
  ])
  if (Math.abs(data.equity.retainedAndOtherEquity) > 1e-6) {
    eqRows.push(['Retained & prior periods (balancing)', formatBs(data.equity.retainedAndOtherEquity)])
  }
  eqRows.push(['Total equity', formatBs(data.equity.total)])

  sections.push({
    heading: 'Equity',
    headers: ['', 'Amount'],
    rows: eqRows,
    columnWeights: [2.8, 1],
    columnAlign: ['left', 'right'],
  })

  sections.push({
    heading: 'Notes',
    headers: ['', ''],
    rows: [
      [
        'Entity',
        orgName,
      ],
      [
        'YTD P&L range',
        `${data.equity.ytdRange.from.slice(0, 10)} → ${data.equity.ytdRange.to.slice(0, 10)}`,
      ],
      [
        'Equation check',
        data.checks.netAssetsEqualsEquity ? 'OK' : `Residual ${formatBs(data.checks.equationResidual)}`,
      ],
    ],
    columnWeights: [1.2, 2.6],
    columnAlign: ['left', 'left'],
  })

  return sections
}

export function BalanceSheetReportPage() {
  const { currentOrganization, canAccess } = useAuth()
  const businessId = currentOrganization?.id
  const canExport = canAccess('accounting.reports.export')

  const [asOf, setAsOf] = useState(todayYmd)
  const [data, setData] = useState<BalanceSheetReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!businessId) return
    setLoading(true)
    setError(null)
    void fetchBalanceSheetReport(businessId, asOf)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load report.'))
      .finally(() => setLoading(false))
  }, [businessId, asOf])

  useEffect(() => {
    load()
  }, [load])

  const asOfLabel = useMemo(() => {
    const d = new Date(`${asOf}T12:00:00.000Z`)
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
  }, [asOf])

  const exportCsv = () => {
    if (!data) return
    const headers = ['Section', 'Group', 'Code', 'Account', 'Amount']
    const rows: string[][] = []

    pushGroupRows(rows, 'Assets', data.assets.bank, true)
    pushGroupRows(rows, 'Assets', data.assets.otherCurrentAssets, true)
    rows.push(['Assets', '', '', 'Total assets', data.assets.total.toFixed(2)])

    pushGroupRows(rows, 'Liabilities', data.liabilities.current, true)
    pushGroupRows(rows, 'Liabilities', data.liabilities.nonCurrent, true)
    rows.push(['Liabilities', '', '', 'Total liabilities', data.liabilities.total.toFixed(2)])

    rows.push(['', '', '', 'Net assets', data.netAssets.toFixed(2)])

    for (const l of data.equity.glLines) {
      rows.push(['Equity', 'Chart accounts', l.code, l.name, l.amount.toFixed(2)])
    }
    rows.push(['Equity', '', '', 'Net income (year-to-date)', data.equity.ytdNetIncome.toFixed(2)])
    if (Math.abs(data.equity.retainedAndOtherEquity) > 1e-6) {
      rows.push([
        'Equity',
        '',
        '',
        'Retained & prior periods (balancing)',
        data.equity.retainedAndOtherEquity.toFixed(2),
      ])
    }
    rows.push(['Equity', '', '', 'Total equity', data.equity.total.toFixed(2)])

    downloadCsv(`balance-sheet-${asOf}.csv`, headers, rows)
  }

  const exportPdf = async () => {
    if (!data || !currentOrganization?.name) return
    await downloadFinancePdf({
      title: 'Balance sheet',
      subtitle: `${currentOrganization.name} · As at ${asOfLabel}`,
      sections: buildPdfSections(data, currentOrganization.name),
      filename: `balance-sheet-${asOf}.pdf`,
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

  function LineRow({ line, indent }: { line: BalanceSheetLine; indent?: boolean }) {
    return (
      <div
        className={`flex items-baseline justify-between gap-6 border-b border-qb-border/80 py-2 text-sm last:border-b-0 ${indent ? 'pl-6' : ''}`}
      >
        <span className="min-w-0 text-qb-heading">{line.name}</span>
        <span className="shrink-0 tabular-nums text-qb-heading">{formatBs(line.amount)}</span>
      </div>
    )
  }

  function GroupBlock({ group }: { group: BalanceSheetGroup }) {
    if (group.lines.length === 0 && Math.abs(group.subtotal) < 1e-9) {
      return null
    }
    return (
      <div className="space-y-0">
        <p className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-qb-muted">{group.label}</p>
        <div className="rounded-sm border border-qb-border/90 bg-white">
          {group.lines.map((l) => (
            <LineRow key={l.chartOfAccountId} line={l} indent />
          ))}
          <div className="flex items-baseline justify-between gap-6 border-t border-qb-border bg-qb-surface/50 px-3 py-2.5 text-sm font-semibold text-qb-heading">
            <span>Total {group.label}</span>
            <span className="tabular-nums">{formatBs(group.subtotal)}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <PageTransition>
      <FinanceReportChrome
        title="Balance sheet"
        description="Statement of financial position as at a single date. Assets and liabilities use approved GL balances (same basis as the trial balance). Equity includes posted equity accounts, year-to-date net income from the P&L, and a balancing line for retained and prior-period results. Accounts with a zero balance are omitted."
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
              <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">As at</span>
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

          {data && currentOrganization?.name ? (
            <div className="space-y-10">
              <header className="border-b border-qb-border pb-6">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-qb-muted">Statement of financial position</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-qb-heading">
                  Balance sheet
                </h2>
                <p className="mt-1 text-lg font-semibold text-qb-heading">{currentOrganization.name}</p>
                <p className="mt-2 text-sm text-qb-muted">As at {asOfLabel}</p>
              </header>

              <section>
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-qb-heading">Assets</h3>
                <div className="space-y-2">
                  <GroupBlock group={data.assets.bank} />
                  <GroupBlock group={data.assets.otherCurrentAssets} />
                  <div className="flex items-baseline justify-between gap-6 border-y-2 border-qb-border py-3 text-base font-bold text-qb-heading">
                    <span>Total assets</span>
                    <span className="tabular-nums">{formatBs(data.assets.total)}</span>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-qb-heading">Liabilities</h3>
                <div className="space-y-2">
                  <GroupBlock group={data.liabilities.current} />
                  <GroupBlock group={data.liabilities.nonCurrent} />
                  <div className="flex items-baseline justify-between gap-6 border-y-2 border-qb-border py-3 text-base font-bold text-qb-heading">
                    <span>Total liabilities</span>
                    <span className="tabular-nums">{formatBs(data.liabilities.total)}</span>
                  </div>
                </div>
              </section>

              <div className="flex items-baseline justify-between gap-6 border-y-2 border-qb-border py-4 text-base font-bold text-qb-heading">
                <span>Net assets</span>
                <span className="tabular-nums">{formatBs(data.netAssets)}</span>
              </div>

              <section>
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-qb-heading">Equity</h3>
                <div className="rounded-sm border border-qb-border/90 bg-white">
                  {data.equity.glLines.map((l) => (
                    <LineRow key={l.chartOfAccountId} line={l} indent />
                  ))}
                  <div className="flex items-baseline justify-between gap-6 border-t border-qb-border px-3 py-2.5 text-sm">
                    <div>
                      <span className="text-qb-heading">Net income (year-to-date)</span>
                      <p className="mt-0.5 text-xs text-qb-muted">
                        P&amp;L from {data.equity.ytdRange.from.slice(0, 10)} to{' '}
                        {data.equity.ytdRange.to.slice(0, 10)}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums font-medium text-qb-heading">
                      {formatBs(data.equity.ytdNetIncome)}
                    </span>
                  </div>
                  {Math.abs(data.equity.retainedAndOtherEquity) > 1e-6 ? (
                    <div className="flex items-baseline justify-between gap-6 border-t border-qb-border px-3 py-2.5 text-sm">
                      <div>
                        <span className="text-qb-heading">Retained &amp; prior periods</span>
                        <p className="mt-0.5 text-xs text-qb-muted">Balancing component vs net assets</p>
                      </div>
                      <span className="shrink-0 tabular-nums font-medium text-qb-heading">
                        {formatBs(data.equity.retainedAndOtherEquity)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-baseline justify-between gap-6 border-t-2 border-qb-border bg-qb-surface/50 px-3 py-3 text-base font-bold text-qb-heading">
                    <span>Total equity</span>
                    <span className="tabular-nums">{formatBs(data.equity.total)}</span>
                  </div>
                </div>
              </section>

              {!data.checks.netAssetsEqualsEquity ? (
                <p className="text-xs text-amber-800">
                  Equation check: net assets and total equity differ by {formatBs(data.checks.equationResidual)} — contact
                  support if this persists after refresh.
                </p>
              ) : (
                <p className="text-xs text-qb-muted">
                  Net assets equal total equity (accounting equation satisfied for this run).
                </p>
              )}
            </div>
          ) : null}
        </PageCard>
      </FinanceReportChrome>
    </PageTransition>
  )
}
