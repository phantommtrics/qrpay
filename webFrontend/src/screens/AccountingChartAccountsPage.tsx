import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ChevronDown, Plus, Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import { CenteredModal } from '../components/ui/CenteredModal'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  accountTypeReportHint,
  BANK_ACCOUNT_REPORT_NOTE,
  CHART_ACCOUNT_TYPE_OPTIONS,
  CHART_CATEGORY_META,
  CHART_CATEGORY_ORDER,
  CHART_ACCOUNT_TYPE_GROUPS,
  chartAccountCategoryForTypeKey,
  chartAccountReportExplainerRows,
  chartAccountTypeOptionSearchBlob,
  chartAccountsMatchQuery,
  compareChartAccountCodes,
  DEFAULT_CHART_ACCOUNT_TYPE_KEY,
  toChartAccountView,
  type ChartAccountView,
  type ChartCategoryOrder,
} from '../models/chartAccount'
import {
  createChartAccount,
  fetchAccountingSummary,
  type AccountingAccountRow,
} from '../services/accountingApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

function chartAccountDetailsCell(a: AccountingAccountRow) {
  if (a.kind === 'BANK') {
    return (
      <div className="space-y-1 text-sm text-slate-700">
        <p>
          <span className="text-slate-400">Bank </span>
          {a.bankName?.trim() ? a.bankName : '—'}
        </p>
        <p className="font-mono text-xs text-slate-600">
          <span className="font-sans text-slate-400">No. </span>
          {a.bankAccountNumber?.trim() ? a.bankAccountNumber : '—'}
        </p>
        {a.bankDetails?.trim() ? (
          <p className="text-xs leading-relaxed text-slate-600">{a.bankDetails}</p>
        ) : null}
      </div>
    )
  }
  if (a.description?.trim()) {
    return <span className="text-slate-600 leading-relaxed">{a.description}</span>
  }
  return <span className="text-slate-400">—</span>
}

function AccountTypeSearchCombobox({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (accountTypeKey: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})

  const selected = CHART_ACCOUNT_TYPE_OPTIONS.find((o) => o.key === value)
  const selectedLabel = selected ? `${selected.group} · ${selected.label}` : 'Select account type'

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return CHART_ACCOUNT_TYPE_OPTIONS
    return CHART_ACCOUNT_TYPE_OPTIONS.filter((o) => {
      const blob = chartAccountTypeOptionSearchBlob(o)
      return q.split(/\s+/).every((t) => blob.includes(t))
    })
  }, [filter])

  const groupedFiltered = useMemo(() => {
    const byGroup = new Map<string, typeof CHART_ACCOUNT_TYPE_OPTIONS>()
    for (const g of CHART_ACCOUNT_TYPE_GROUPS) {
      byGroup.set(g, [])
    }
    for (const o of filtered) {
      const list = byGroup.get(o.group) ?? []
      list.push(o)
      byGroup.set(o.group, list)
    }
    return CHART_ACCOUNT_TYPE_GROUPS.map((g) => ({ group: g, options: byGroup.get(g) ?? [] })).filter(
      (s) => s.options.length > 0,
    )
  }, [filtered])

  const reposition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const maxH = 280
    const spaceBelow = window.innerHeight - r.bottom - 16
    const spaceAbove = r.top - 16
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow
    setPanelStyle({
      position: 'fixed',
      left: r.left,
      width: r.width,
      maxHeight: maxH,
      zIndex: 200,
      ...(openUp
        ? { bottom: window.innerHeight - r.top + 6 }
        : { top: r.bottom + 6 }),
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        setFilter('')
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const node = e.target as Node
      if (triggerRef.current?.contains(node)) return
      if (panelRef.current?.contains(node)) return
      setOpen(false)
      setFilter('')
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = (key: string) => {
    onChange(key)
    setOpen(false)
    setFilter('')
    triggerRef.current?.focus()
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        id="chart-account-type-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="chart-account-type-listbox"
        onClick={() => {
          if (disabled) return
          setOpen((o) => !o)
          if (open) setFilter('')
        }}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-900 outline-none transition-shadow focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{selectedLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              id="chart-account-type-listbox"
              role="listbox"
              aria-labelledby="chart-account-type-trigger"
              style={panelStyle}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/5"
            >
              <div className="border-b border-slate-100 px-2 pb-2 pt-1">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden
                  />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search account types…"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/80 py-2 pl-8 pr-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && filtered.length === 1) {
                        e.preventDefault()
                        pick(filtered[0].key)
                      }
                    }}
                  />
                </div>
              </div>
              <ul className="max-h-[220px] overflow-y-auto py-1" role="presentation">
                {filtered.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">No matches</li>
                ) : (
                  groupedFiltered.map(({ group, options }) => (
                    <li key={group} role="presentation" className="list-none">
                      <div className="sticky top-0 z-[1] bg-slate-50/95 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 backdrop-blur-sm">
                        {group}
                      </div>
                      <ul role="presentation">
                        {options.map((o) => (
                          <li key={o.key} role="presentation">
                            <button
                              type="button"
                              role="option"
                              aria-selected={o.key === value}
                              onClick={() => pick(o.key)}
                              className={`flex w-full px-3 py-2.5 pl-4 text-left text-sm transition-colors hover:bg-slate-50 ${
                                o.key === value ? 'bg-teal-50/80 font-medium text-teal-900' : 'text-slate-800'
                              }`}
                            >
                              {o.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export function AccountingChartAccountsPage() {
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id
  const [accounts, setAccounts] = useState<AccountingAccountRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({
    accountKind: 'ledger' as 'ledger' | 'bank',
    code: '',
    name: '',
    description: '',
    accountTypeKey: DEFAULT_CHART_ACCOUNT_TYPE_KEY,
    bankName: '',
    bankAccountNumber: '',
    bankDetails: '',
  })

  const load = useCallback(() => {
    if (!businessId) return
    setLoading(true)
    setError(null)
    void fetchAccountingSummary(businessId)
      .then((d) => setAccounts(d.accounts))
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : 'Could not load accounts.')
      })
      .finally(() => setLoading(false))
  }, [businessId])

  useEffect(() => {
    load()
  }, [load])

  const filteredRows = useMemo(
    () => accounts.filter((a) => chartAccountsMatchQuery(a, query)),
    [accounts, query],
  )

  const views = useMemo(
    () => filteredRows.map((a) => toChartAccountView(a)),
    [filteredRows],
  )

  const grouped = useMemo(() => {
    const map = new Map<ChartCategoryOrder, ChartAccountView[]>()
    for (const c of CHART_CATEGORY_ORDER) {
      map.set(c, [])
    }
    for (const v of views) {
      const list = map.get(v.categoryKey) ?? []
      list.push(v)
      map.set(v.categoryKey, list)
    }
    return CHART_CATEGORY_ORDER.map((cat) => {
      const rows = [...(map.get(cat) ?? [])].sort((x, y) => compareChartAccountCodes(x.code, y.code))
      const meta = CHART_CATEGORY_META[cat]
      return {
        category: cat,
        meta,
        rows,
        total: rows.reduce((s, r) => s + r.balance, 0),
      }
    })
  }, [views])

  const totalsByCategory = useMemo(() => {
    const map = new Map<ChartCategoryOrder, number>()
    for (const c of CHART_CATEGORY_ORDER) map.set(c, 0)
    for (const a of accounts) {
      const v = toChartAccountView(a)
      map.set(v.categoryKey, (map.get(v.categoryKey) ?? 0) + 1)
    }
    return map
  }, [accounts])

  const closeModal = () => {
    setModalOpen(false)
    setFormError(null)
    setForm({
      accountKind: 'ledger',
      code: '',
      name: '',
      description: '',
      accountTypeKey: DEFAULT_CHART_ACCOUNT_TYPE_KEY,
      bankName: '',
      bankAccountNumber: '',
      bankDetails: '',
    })
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!businessId) return
    setFormError(null)
    setSubmitting(true)
    try {
      const desc = form.description.trim()
      if (form.accountKind === 'bank') {
        await createChartAccount(businessId, {
          kind: 'BANK',
          code: form.code.trim(),
          name: form.name.trim(),
          category: 'ASSET',
          bankName: form.bankName.trim(),
          bankAccountNumber: form.bankAccountNumber.trim(),
          bankDetails: form.bankDetails.trim() || null,
          ...(desc ? { description: desc } : {}),
        })
      } else {
        await createChartAccount(businessId, {
          kind: 'LEDGER',
          code: form.code.trim(),
          name: form.name.trim(),
          category: chartAccountCategoryForTypeKey(form.accountTypeKey),
          ...(desc ? { description: desc } : {}),
        })
      }
      closeModal()
      load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create account.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!businessId) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <p className="text-slate-500">Select a business.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const filterActive = query.trim().length > 0
  const visibleCount = filteredRows.length

  const { reportExplainerPnl, reportExplainerBs } = useMemo(() => {
    const rows = chartAccountReportExplainerRows()
    return {
      reportExplainerPnl: rows.filter((r) => r.statement === 'profitAndLoss'),
      reportExplainerBs: rows.filter((r) => r.statement === 'balanceSheet'),
    }
  }, [])

  return (
    <PageTransition>
      <div className="space-y-10 py-4">
        <PageCard variant="plain" className="space-y-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <Link
                to={APP_PATHS.accounting}
                className="inline-flex items-center text-sm text-slate-500 transition-colors hover:text-slate-800"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
              <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">
                Chart of accounts
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
                Ledger lines track sales, payments, and inventory. Add bank accounts to mirror each real operating account (code, name, number, bank). Built-in accounts power checkout and wallets.
              </p>
              <details className="mt-5 max-w-3xl rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-left">
                <summary className="cursor-pointer list-none text-sm font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
                  <span className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500">
                    How account types affect your reports
                  </span>
                </summary>
                <p className="mt-3 text-xs leading-relaxed text-slate-600">
                  Each account type is booked to your ledger the same way; the labels below show where balances typically appear on a{' '}
                  <span className="font-medium text-slate-700">Profit &amp; Loss</span> vs{' '}
                  <span className="font-medium text-slate-700">balance sheet</span>. Period{' '}
                  <span className="font-medium text-slate-700">net profit</span> closes into equity (retained earnings), which links the two statements.
                </p>
                <div className="mt-4 grid gap-6 sm:grid-cols-2">
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Profit &amp; Loss
                    </h3>
                    <ul className="mt-2 space-y-3 text-xs text-slate-700">
                      {reportExplainerPnl.map((row) => (
                        <li key={row.sectionKey}>
                          <span className="font-medium text-slate-900">{row.headline}</span>
                          <span className="text-slate-500"> — {row.diagramLabel}</span>
                          <ul className="mt-1 list-disc pl-4 text-slate-600">
                            {row.typeLabels.map((label) => (
                              <li key={`${row.sectionKey}-${label}`}>{label}</li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Balance sheet
                    </h3>
                    <ul className="mt-2 space-y-3 text-xs text-slate-700">
                      {reportExplainerBs.map((row) => (
                        <li key={row.sectionKey}>
                          <span className="font-medium text-slate-900">{row.headline}</span>
                          <span className="text-slate-500"> — {row.diagramLabel}</span>
                          <ul className="mt-1 list-disc pl-4 text-slate-600">
                            {row.typeLabels.map((label) => (
                              <li key={`${row.sectionKey}-${label}`}>{label}</li>
                            ))}
                          </ul>
                          {row.sectionKey === 'bs_current_assets' ? (
                            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                              {BANK_ACCOUNT_REPORT_NOTE}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-teal-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              New account
            </button>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by code, name, bank, or description…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-shadow focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <p className="text-sm tabular-nums text-slate-500">
              {loading ? (
                'Loading…'
              ) : filterActive ? (
                <>
                  <span className="font-medium text-slate-700">{visibleCount}</span>
                  <span> of </span>
                  <span className="font-medium text-slate-700">{accounts.length}</span>
                  <span> accounts</span>
                </>
              ) : (
                <>
                  <span className="font-medium text-slate-700">{accounts.length}</span>
                  <span> accounts</span>
                </>
              )}
            </p>
          </div>

          {!loading && accounts.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-6">
              {CHART_CATEGORY_ORDER.map((cat) => {
                const meta = CHART_CATEGORY_META[cat]
                const n = totalsByCategory.get(cat) ?? 0
                const { Icon } = meta
                return (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                  >
                    <Icon className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
                    <span className="font-medium text-slate-800">{meta.label}</span>
                    <span className="tabular-nums text-slate-500">{n}</span>
                  </span>
                )
              })}
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </PageCard>

        {!loading && filterActive && visibleCount === 0 ? (
          <PageCard variant="plain" className="py-16 text-center">
            <p className="text-slate-600">No accounts match your search.</p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mt-4 text-sm font-medium text-teal-700 hover:text-teal-800"
            >
              Clear search
            </button>
          </PageCard>
        ) : (
          <div className="space-y-12">
            {grouped.map((g) => {
              const { meta, rows, total } = g
              const { Icon } = meta
              return (
                <section
                  key={g.category}
                  className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-900/5 ${meta.stripeClass} border-l-4`}
                >
                  <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-5 sm:px-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-4">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta.iconWrapClass}`}
                        >
                          <Icon className="h-5 w-5" strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold text-slate-900">{meta.label}</h2>
                            <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-slate-500 ring-1 ring-slate-200">
                              {rows.length} {rows.length === 1 ? 'account' : 'accounts'}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-slate-600">{meta.hint}</p>
                        </div>
                      </div>
                      <p className="shrink-0 text-right">
                        <span className="block text-xs uppercase tracking-wide text-slate-400">
                          Section balance
                        </span>
                        <span className="mt-1 block text-lg font-semibold tabular-nums text-slate-900">
                          {loading ? '…' : formatMoney(total, { decimals: 0 })}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-white">
                          <th className="px-5 py-3.5 font-medium text-slate-500 sm:px-6">Code</th>
                          <th className="px-3 py-3.5 font-medium text-slate-500 sm:pr-6">Account</th>
                          <th className="hidden py-3.5 font-medium text-slate-500 md:table-cell md:px-3">
                            Notes &amp; bank details
                          </th>
                          <th className="px-5 py-3.5 text-right font-medium text-slate-500 sm:px-6">
                            Balance
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {loading ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-10 text-center text-slate-400">
                              Loading…
                            </td>
                          </tr>
                        ) : rows.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-10 text-center text-slate-400">
                              No accounts in this section
                              {filterActive ? ' for this search' : ''}.
                            </td>
                          </tr>
                        ) : (
                          rows.map((a) => (
                            <tr
                              key={a.id}
                              className="align-top transition-colors hover:bg-slate-50/90"
                            >
                              <td className="px-5 py-4 font-mono text-sm text-slate-600 sm:px-6">
                                {a.code}
                              </td>
                              <td className="max-w-[200px] px-3 py-4 sm:max-w-none sm:pr-6">
                                <span className="font-medium text-slate-900">{a.name}</span>
                                {a.kind === 'BANK' ? (
                                  <span className="ml-2 inline-flex align-middle text-[10px] font-semibold uppercase tracking-wide text-sky-700 ring-1 ring-sky-200 bg-sky-50 px-1.5 py-0.5 rounded">
                                    Bank
                                  </span>
                                ) : null}
                                {a.isSystem === true ? (
                                  <span className="ml-2 inline-flex align-middle text-[10px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200 bg-slate-50 px-1.5 py-0.5 rounded">
                                    Built-in
                                  </span>
                                ) : null}
                                <div className="mt-1 md:hidden">{chartAccountDetailsCell(a)}</div>
                              </td>
                              <td className="hidden max-w-md py-4 leading-relaxed md:table-cell md:px-3">
                                {chartAccountDetailsCell(a)}
                              </td>
                              <td className="px-5 py-4 text-right text-sm font-semibold tabular-nums text-slate-900 whitespace-nowrap sm:px-6">
                                {formatMoney(a.balance, { decimals: 0 })}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <ModalOverlay
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={() => !submitting && closeModal()}
          />
          <CenteredModal className="relative z-10 max-h-[min(90vh,760px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl ring-1 ring-slate-900/5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">New account</h2>
                <p className="mt-1 text-sm text-slate-500">
                  General ledger lines for postings, or a bank account that mirrors your real bank.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !submitting && closeModal()}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form className="mt-8 space-y-5" onSubmit={(e) => void handleCreate(e)}>
              <div className="space-y-2">
                <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Account kind
                </span>
                <div className="flex rounded-xl border border-slate-200 bg-slate-50/80 p-1">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setForm((f) => ({ ...f, accountKind: 'ledger' }))}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      form.accountKind === 'ledger'
                        ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    General ledger
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setForm((f) => ({ ...f, accountKind: 'bank' }))}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      form.accountKind === 'bank'
                        ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bank account
                  </button>
                </div>
                {form.accountKind === 'bank' ? (
                  <p className="text-xs leading-relaxed text-slate-500">
                    Stored as an asset. Use a short chart code (e.g. BANK_MAIN) and the same name you use internally for this account.
                  </p>
                ) : null}
              </div>

              <label className="block space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Code
                </span>
                <input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
                  placeholder={form.accountKind === 'bank' ? 'e.g. BANK_MAIN' : 'e.g. 610_OFFICE'}
                  required
                  autoComplete="off"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Account name
                </span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
                  placeholder={
                    form.accountKind === 'bank'
                      ? 'e.g. Operating — main branch'
                      : 'Display name on reports'
                  }
                  required
                  autoComplete="off"
                />
              </label>

              {form.accountKind === 'bank' ? (
                <>
                  <label className="block space-y-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Bank name
                    </span>
                    <input
                      value={form.bankName}
                      onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
                      placeholder="Institution name"
                      required
                      autoComplete="organization"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Account number
                    </span>
                    <input
                      value={form.bankAccountNumber}
                      onChange={(e) => setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
                      placeholder="IBAN, or local account number"
                      required
                      autoComplete="off"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Other details{' '}
                      <span className="font-normal normal-case text-slate-400">(optional)</span>
                    </span>
                    <textarea
                      value={form.bankDetails}
                      onChange={(e) => setForm((f) => ({ ...f, bankDetails: e.target.value }))}
                      rows={2}
                      className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
                      placeholder="Branch, SWIFT/BIC, signatories, etc."
                    />
                  </label>
                </>
              ) : null}

              <label className="block space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {form.accountKind === 'bank' ? (
                    <>
                      Internal note{' '}
                      <span className="font-normal normal-case text-slate-400">(optional)</span>
                    </>
                  ) : (
                    <>
                      What to book here{' '}
                      <span className="font-normal normal-case text-slate-400">(optional)</span>
                    </>
                  )}
                </span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={form.accountKind === 'bank' ? 2 : 3}
                  className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
                  placeholder={
                    form.accountKind === 'bank'
                      ? 'Anything else your bookkeepers should know.'
                      : 'Short note for your team on which transactions belong in this account.'
                  }
                />
              </label>

              {form.accountKind === 'ledger' ? (
                <div className="space-y-2">
                  <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Account type
                  </span>
                  <AccountTypeSearchCombobox
                    value={form.accountTypeKey}
                    disabled={submitting}
                    onChange={(accountTypeKey) => setForm((f) => ({ ...f, accountTypeKey }))}
                  />
                  <p className="text-xs leading-relaxed text-slate-500">
                    {accountTypeReportHint(form.accountTypeKey)}
                  </p>
                </div>
              ) : null}
              {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-6">
                <button
                  type="button"
                  onClick={() => !submitting && closeModal()}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-teal-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : 'Create account'}
                </button>
              </div>
            </form>
          </CenteredModal>
        </div>
      ) : null}
    </PageTransition>
  )
}
