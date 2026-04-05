import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Loader2 } from 'lucide-react'

import { FinanceReportChrome } from '../../components/finance/FinanceReportChrome'
import { ReportExportToolbar } from '../../components/finance/ReportExportToolbar'
import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformAccountStatementReports,
  fetchPlatformAccountsForReports,
  type PlatformAccountStatementReportData,
  type PlatformChartAccountMini,
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

function formatLedgerCategory(raw: string): string {
  return raw
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

function statementPdfSection(data: PlatformAccountStatementReportData): PdfTableSection {
  const op = formatMoney(data.openingBalance, { decimals: 2 })
  const cl = formatMoney(data.closingBalance, { decimals: 2 })
  return {
    heading: [
      `${data.account.code} - ${data.account.name}`,
      formatLedgerCategory(data.account.category),
      `Opening balance: ${op}    Closing balance: ${cl}`,
    ].join('\n'),
    headers: ['Date', 'Ref', 'Details', 'Debit', 'Credit', 'Balance'],
    rows: [
      [
        '',
        '',
        'Opening balance',
        '—',
        '—',
        formatMoney(data.openingBalance, { decimals: 2 }),
      ],
      ...data.lines.map((l) => [
        l.postedAt.slice(0, 10),
        l.reference ?? '—',
        [l.memo, l.lineDescription].filter(Boolean).join(' · ') || '—',
        l.debit > 0 ? formatMoney(l.debit, { decimals: 2 }) : '—',
        l.credit > 0 ? formatMoney(l.credit, { decimals: 2 }) : '—',
        formatMoney(l.balance, { decimals: 2 }),
      ]),
    ],
    columnWeights: [1, 1.15, 2.6, 1, 1, 1],
    columnAlign: ['left', 'left', 'left', 'right', 'right', 'right'],
  }
}

export function PlatformAccountingStatementPage() {
  const { canAccess } = useAuth()
  const canExport = canAccess('platform.accounting.export')

  const [accounts, setAccounts] = useState<PlatformChartAccountMini[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [from, setFrom] = useState(firstOfMonthYmd)
  const [to, setTo] = useState(todayYmd)
  const [statements, setStatements] = useState<PlatformAccountStatementReportData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accountsMenuOpen, setAccountsMenuOpen] = useState(false)
  const [accountFilter, setAccountFilter] = useState('')
  const accountsRootRef = useRef<HTMLDivElement>(null)
  const accountsPanelRef = useRef<HTMLDivElement>(null)
  const [accountsPanelBox, setAccountsPanelBox] = useState({ top: 0, left: 0, width: 0 })

  const selectedKey = useMemo(() => [...selectedIds].sort().join(','), [selectedIds])

  const placeAccountsPanel = useCallback(() => {
    const el = accountsRootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setAccountsPanelBox({ top: r.bottom + 6, left: r.left, width: r.width })
  }, [])

  useEffect(() => {
    if (!accountsMenuOpen) {
      setAccountFilter('')
      return
    }
    placeAccountsPanel()
    const onReposition = () => placeAccountsPanel()
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [accountsMenuOpen, placeAccountsPanel])

  useEffect(() => {
    if (!accountsMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (accountsRootRef.current?.contains(t)) return
      if (accountsPanelRef.current?.contains(t)) return
      setAccountsMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountsMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [accountsMenuOpen])

  const accountsTriggerLabel = useMemo(() => {
    if (selectedIds.length === 0) return 'Select accounts…'
    const byId = new Map(accounts.map((a) => [a.id, a]))
    const sel = selectedIds.map((id) => byId.get(id)).filter(Boolean) as PlatformChartAccountMini[]
    sel.sort((a, b) => a.code.localeCompare(b.code))
    if (sel.length === 1) return `${sel[0].code} — ${sel[0].name}`
    if (sel.length <= 3) return sel.map((a) => `${a.code} — ${a.name}`).join(' · ')
    return `${sel.length} accounts selected`
  }, [accounts, selectedIds])

  const filteredAccounts = useMemo(() => {
    const q = accountFilter.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q),
    )
  }, [accounts, accountFilter])

  useEffect(() => {
    void fetchPlatformAccountsForReports()
      .then((rows) => {
        setAccounts(rows)
        setSelectedIds((prev) => {
          const valid = prev.filter((id) => rows.some((r) => r.id === id))
          if (valid.length > 0) return valid
          return rows[0]?.id ? [rows[0].id] : []
        })
      })
      .catch(() => setAccounts([]))
  }, [])

  const load = useCallback(() => {
    if (selectedIds.length === 0) return
    setLoading(true)
    setError(null)
    void fetchPlatformAccountStatementReports(selectedIds, from, to)
      .then(setStatements)
      .catch((e) => {
        setStatements([])
        setError(e instanceof ApiError ? e.message : 'Could not load statement.')
      })
      .finally(() => setLoading(false))
  }, [selectedIds, from, to])

  useEffect(() => {
    if (selectedIds.length === 0) {
      setStatements([])
      return
    }
    void load()
  }, [selectedIds.length, selectedKey, from, to, load])

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const selectAllAccounts = () => {
    setSelectedIds(accounts.map((a) => a.id))
  }

  const clearAccounts = () => {
    setSelectedIds([])
  }

  const exportCsv = () => {
    if (statements.length === 0) return
    const headers = [
      'Date',
      'Reference',
      'Memo',
      'Line description',
      'Debit',
      'Credit',
      'Balance',
    ]
    const rows: string[][] = []
    for (const data of statements) {
      rows.push([`Account: ${data.account.code} — ${data.account.name}`, '', '', '', '', '', ''])
      rows.push([
        '',
        '',
        'Opening balance',
        '',
        '',
        '',
        data.openingBalance.toFixed(2),
      ])
      for (const l of data.lines) {
        rows.push([
          l.postedAt.slice(0, 10),
          l.reference ?? '',
          l.memo ?? '',
          l.lineDescription ?? '',
          l.debit.toFixed(2),
          l.credit.toFixed(2),
          l.balance.toFixed(2),
        ])
      }
      rows.push(['', '', 'Closing balance', '', '', '', data.closingBalance.toFixed(2)])
      rows.push([])
    }
    const label =
      statements.length === 1
        ? statements[0]!.account.code
        : `${statements.length}-accounts`
    downloadCsv(`platform-account-statement-${label}-${from}-${to}.csv`, headers, rows)
  }

  const exportPdf = async () => {
    if (statements.length === 0) return
    await downloadFinancePdf({
      title: 'EasyPay platform — Account statement',
      subtitle: `${from} → ${to} · ${statements.length} account(s)`,
      sections: statements.map((s) => statementPdfSection(s)),
      filename: `platform-account-statement-${from}-${to}.pdf`,
    })
  }

  const fieldClass =
    'rounded-sm border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

  return (
    <PageTransition>
      <FinanceReportChrome
        title="Platform account statement"
        description="EasyPay general ledger: opening balance, period activity, and running balance per account."
        backTo={APP_PATHS.platformAccounting}
        backLabel="Back to platform accounting"
        toolbar={
          <ReportExportToolbar
            canExport={canExport}
            disabled={statements.length === 0 || loading}
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
            <div ref={accountsRootRef} className="min-w-[14rem] max-w-xl flex-1 space-y-1.5">
              <span className="block text-xs font-semibold uppercase tracking-wide text-qb-muted">
                Accounts
              </span>
              <button
                type="button"
                aria-expanded={accountsMenuOpen}
                aria-haspopup="listbox"
                onClick={() => {
                  setAccountsMenuOpen((o) => !o)
                }}
                className={`${fieldClass} flex w-full items-center justify-between gap-2 text-left shadow-[0_1px_2px_rgba(57,58,61,0.06)]`}
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {accounts.length === 0 ? (
                    <span className="text-qb-muted">No accounts</span>
                  ) : (
                    accountsTriggerLabel
                  )}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-qb-muted transition ${accountsMenuOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
              {accountsMenuOpen && accounts.length > 0
                ? createPortal(
                    <div
                      ref={accountsPanelRef}
                      role="listbox"
                      aria-multiselectable
                      className="fixed z-[300] flex max-h-[min(22rem,calc(100vh-6rem))] flex-col overflow-hidden rounded-md border border-qb-border bg-white shadow-lg ring-1 ring-black/5"
                      style={{
                        top: accountsPanelBox.top,
                        left: accountsPanelBox.left,
                        width: Math.max(accountsPanelBox.width, 260),
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-qb-border px-3 py-2.5">
                        <span className="text-xs font-medium text-qb-muted">
                          {selectedIds.length} selected
                        </span>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              selectAllAccounts()
                            }}
                            className="text-xs font-semibold text-qb-heading hover:underline"
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              clearAccounts()
                            }}
                            className="text-xs font-medium text-qb-muted hover:text-qb-heading"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="border-b border-qb-border px-3 py-2">
                        <input
                          type="search"
                          autoComplete="off"
                          autoFocus
                          placeholder="Search accounts…"
                          value={accountFilter}
                          onChange={(e) => setAccountFilter(e.target.value)}
                          className="w-full rounded-sm border border-qb-border bg-qb-surface/40 px-2.5 py-2 text-sm text-qb-heading placeholder:text-qb-muted focus:border-qb-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-qb-primary/30"
                        />
                      </div>
                      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
                        {filteredAccounts.length === 0 ? (
                          <li className="px-3 py-4 text-center text-sm text-qb-muted">No matches</li>
                        ) : (
                          filteredAccounts.map((a) => {
                            const checked = selectedIds.includes(a.id)
                            return (
                              <li key={a.id}>
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={checked}
                                  onClick={() => toggleAccount(a.id)}
                                  className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-qb-surface/70 ${checked ? 'bg-qb-surface' : ''}`}
                                >
                                  <span
                                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold leading-none ${
                                      checked
                                        ? 'border-qb-heading bg-white text-qb-heading'
                                        : 'border-qb-border bg-white text-transparent'
                                    }`}
                                    aria-hidden
                                  >
                                    ✓
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block font-mono text-xs text-qb-muted">{a.code}</span>
                                    <span className="block text-sm font-medium leading-snug text-qb-heading">
                                      {a.name}
                                    </span>
                                  </span>
                                </button>
                              </li>
                            )
                          })
                        )}
                      </ul>
                      <div className="border-t border-qb-border bg-qb-surface/30 px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => setAccountsMenuOpen(false)}
                          className="w-full rounded-sm border border-qb-border bg-white py-2 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface"
                        >
                          Done
                        </button>
                      </div>
                    </div>,
                    document.body,
                  )
                : null}
            </div>
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
              disabled={loading || selectedIds.length === 0}
              className="rounded-sm border border-qb-border bg-white px-4 py-2 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
          {selectedIds.length === 0 ? (
            <p className="text-sm text-qb-muted">Select at least one account to load statements.</p>
          ) : null}
          {loading && statements.length === 0 && selectedIds.length > 0 ? (
            <div className="flex items-center gap-2 py-12 text-qb-muted">
              <Loader2 className="h-5 w-5 animate-spin text-qb-muted" />
              Loading…
            </div>
          ) : null}
          {statements.length > 0 ? (
            <div className="space-y-10">
              {statements.map((data) => (
                <section
                  key={data.account.id}
                  className="overflow-hidden rounded-md border border-qb-border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                >
                  <header className="border-b border-qb-border bg-gradient-to-b from-qb-surface to-white px-4 py-5 sm:px-6 sm:py-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between lg:gap-6">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="inline-flex tabular-nums rounded-md border border-qb-border bg-white px-2.5 py-1 text-sm font-semibold tracking-tight text-qb-heading shadow-sm">
                            {data.account.code}
                          </span>
                          <h2 className="text-lg font-semibold leading-snug tracking-tight text-qb-heading">
                            {data.account.name}
                          </h2>
                        </div>
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-qb-muted">
                          {formatLedgerCategory(data.account.category)}
                        </p>
                      </div>
                      <dl className="grid w-full shrink-0 grid-cols-2 gap-0 overflow-hidden rounded-md border border-qb-border bg-white sm:max-w-md lg:w-auto lg:min-w-[280px]">
                        <div className="border-r border-qb-border px-4 py-3 sm:px-5">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-qb-muted">
                            Opening balance
                          </dt>
                          <dd className="mt-1 text-right text-base font-semibold tabular-nums leading-none text-qb-heading">
                            {formatMoney(data.openingBalance, { decimals: 2 })}
                          </dd>
                        </div>
                        <div className="px-4 py-3 sm:px-5">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-qb-muted">
                            Closing balance
                          </dt>
                          <dd className="mt-1 text-right text-base font-semibold tabular-nums leading-none text-qb-heading">
                            {formatMoney(data.closingBalance, { decimals: 2 })}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </header>
                  <div className="overflow-x-auto px-2 pb-5 pt-4 sm:px-4 sm:pb-6 sm:pt-5">
                    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-qb-border bg-qb-surface text-xs font-semibold uppercase tracking-wide text-qb-muted">
                          <th className="px-4 py-3.5 sm:py-4">Date</th>
                          <th className="px-4 py-3.5 sm:py-4">Reference</th>
                          <th className="px-4 py-3.5 sm:py-4">Details</th>
                          <th className="px-4 py-3.5 text-right sm:py-4">Debit</th>
                          <th className="px-4 py-3.5 text-right sm:py-4">Credit</th>
                          <th className="px-4 py-3.5 text-right sm:py-4">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-qb-border">
                        <tr className="bg-qb-surface/30">
                          <td className="px-4 py-3 text-qb-muted">—</td>
                          <td className="px-4 py-3 text-qb-muted">—</td>
                          <td className="px-4 py-3 font-medium text-qb-heading">Opening balance</td>
                          <td className="px-4 py-3 text-right text-qb-muted">—</td>
                          <td className="px-4 py-3 text-right text-qb-muted">—</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">
                            {formatMoney(data.openingBalance, { decimals: 2 })}
                          </td>
                        </tr>
                        {data.lines.map((l) => (
                          <tr key={l.id} className="hover:bg-qb-surface/40">
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-qb-heading">
                              {l.postedAt.slice(0, 10)}
                            </td>
                            <td className="px-4 py-3 text-xs text-qb-muted">{l.reference ?? '—'}</td>
                            <td className="max-w-xs px-4 py-3 text-xs text-qb-heading">
                              {[l.memo, l.lineDescription].filter(Boolean).join(' · ') || '—'}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {l.debit > 0 ? formatMoney(l.debit, { decimals: 2 }) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {l.credit > 0 ? formatMoney(l.credit, { decimals: 2 }) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium">
                              {formatMoney(l.balance, { decimals: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </PageCard>
      </FinanceReportChrome>
    </PageTransition>
  )
}
