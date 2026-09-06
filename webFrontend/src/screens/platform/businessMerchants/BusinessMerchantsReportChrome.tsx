import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, FileDown, FileText, Loader2, Store } from 'lucide-react'

import { PageCard } from '../../../components/ui/PageCard'
import { PageTransition } from '../../../components/ui/PageTransition'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { PRESET_BUTTONS, type DatePreset } from './reportDatePresets'

export function BusinessMerchantsReportChrome({
  title,
  description,
  deniedMessage,
  canView,
  canExport,
  datePreset,
  setDatePreset,
  from,
  setFrom,
  to,
  setTo,
  merchantId,
  setMerchantId,
  merchantSelectOptions,
  periodLabel,
  currency,
  loading,
  error,
  onRefresh,
  exportDisabled,
  onExportCsv,
  onExportPdf,
  children,
}: {
  title: string
  description: string
  deniedMessage: string
  canView: boolean
  canExport: boolean
  datePreset: DatePreset
  setDatePreset: (preset: DatePreset) => void
  from: string
  setFrom: (value: string) => void
  to: string
  setTo: (value: string) => void
  merchantId: string
  setMerchantId: (value: string) => void
  merchantSelectOptions: Array<{ value: string; label: string }>
  periodLabel: string
  currency?: string | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  exportDisabled: boolean
  onExportCsv: () => void | Promise<void>
  onExportPdf: () => void | Promise<void>
  children: ReactNode
}) {
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [exportOpen])

  const runExport = async (kind: 'csv' | 'pdf') => {
    setExportOpen(false)
    setExporting(kind)
    try {
      if (kind === 'csv') {
        await onExportCsv()
      } else {
        await onExportPdf()
      }
    } finally {
      setExporting(null)
    }
  }

  if (!canView) {
    return (
      <PageTransition className="space-y-6" withSlide>
        <PageCard className="p-6">
          <p className="text-slate-600">{deniedMessage}</p>
        </PageCard>
      </PageTransition>
    )
  }

  const busy = loading || Boolean(exporting)

  return (
    <PageTransition className="space-y-6" withSlide>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
          Platform · Business Merchants
        </p>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-slate-900">
          <Store className="h-8 w-8 text-teal-700" aria-hidden />
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">{description}</p>
      </div>

      <PageCard className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 border-b border-slate-200 pb-6">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Date range</span>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {PRESET_BUTTONS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setDatePreset(b.id)}
                className={`border-b-2 px-0.5 pb-1.5 text-xs font-medium transition-colors ${
                  datePreset === b.id
                    ? 'border-teal-600 text-teal-900'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-6">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600">From</span>
              <input
                type="date"
                value={from}
                disabled={datePreset !== 'custom'}
                onChange={(e) => {
                  setDatePreset('custom')
                  setFrom(e.target.value)
                }}
                className="block border-b border-slate-200 bg-transparent py-2 text-sm outline-none focus:border-teal-500 disabled:text-slate-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600">To</span>
              <input
                type="date"
                value={to}
                disabled={datePreset !== 'custom'}
                onChange={(e) => {
                  setDatePreset('custom')
                  setTo(e.target.value)
                }}
                className="block border-b border-slate-200 bg-transparent py-2 text-sm outline-none focus:border-teal-500 disabled:text-slate-400"
              />
            </label>
            <div className="w-72 min-w-[16rem] space-y-1">
              <span className="text-xs font-medium text-slate-600">Merchant</span>
              <SearchableSelect
                value={merchantId}
                onChange={setMerchantId}
                options={merchantSelectOptions}
                placeholder="All merchants"
                emptyMessage="No merchants"
                noResultsMessage="No matching merchant"
                ariaLabel="Filter by merchant"
                matchOptionValue
                listWindowInitial={6}
                listWindowStep={6}
                listMaxHeightClass="max-h-56"
                buttonClassName="rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => onRefresh()}
              className="border-b-2 border-teal-600 pb-2 text-sm font-semibold text-teal-700 hover:text-teal-900"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-200 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">{periodLabel}</span>
            {currency ? <span className="text-slate-500"> · {currency}</span> : null}
          </p>
          {canExport ? (
            <div ref={exportMenuRef} className="relative">
              <button
                type="button"
                disabled={exportDisabled || busy}
                aria-haspopup="menu"
                aria-expanded={exportOpen}
                onClick={() => setExportOpen((open) => !open)}
                className="inline-flex items-center gap-1.5 border-b border-slate-800 pb-1 text-sm font-medium text-slate-800 hover:border-teal-600 hover:text-teal-800 disabled:opacity-40"
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                {exporting ? 'Exporting…' : 'Export'}
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition ${exportOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
              {exportOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={() => void runExport('csv')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <FileDown className="h-4 w-4 text-slate-500" />
                    CSV
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={() => void runExport('pdf')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <FileText className="h-4 w-4 text-slate-500" />
                    PDF
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Export needs the <strong>Business merchants</strong> export permission.
            </p>
          )}
        </div>

        {error ? <div className="border-b border-red-200 py-3 text-sm text-red-800">{error}</div> : null}

        {loading ? <p className="border-b border-slate-200 py-4 text-sm text-slate-500">Loading…</p> : null}

        {children}
      </PageCard>
    </PageTransition>
  )
}
