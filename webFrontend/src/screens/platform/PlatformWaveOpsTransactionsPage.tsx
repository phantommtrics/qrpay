import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, FileDown, FileText, Loader2, RotateCcw, Waves } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { SearchableSelect } from '../../components/ui/SearchableSelect'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchWaveOpsAggregatedMerchants,
  fetchWaveOpsTransactions,
  refundWaveOpsTransaction,
  type WaveOpsAggregatedMerchant,
  type WaveOpsTransaction,
} from '../../services/subscriptionApi'
import { downloadCsv, downloadFinancePdf } from '../../utils/financeReportExport'
import { isPlatformOperator } from '../../utils/platformOperator'

const fieldInput =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600/30'

const WAVE_TX_TYPE_LABELS: Record<string, string> = {
  merchant_payment: 'Merchant payment',
  merchant_payment_refund: 'Merchant payment refund',
  api_checkout: 'Checkout payment',
  api_checkout_refund: 'Checkout refund',
  api_payout: 'Payout',
  api_payout_reversal: 'Payout reversal',
  bulk_payment: 'Bulk payment',
  bulk_payment_reversal: 'Bulk payment reversal',
  b2b_payment: 'Business-to-business payment',
  b2b_payment_reversal: 'Business-to-business reversal',
  merchant_sweep: 'Merchant sweep',
}

const UNASSIGNED_MERCHANT = '__unassigned__'

function todayYmd() {
  return new Date().toISOString().slice(0, 10)
}

function waveTransactionDescription(tx: WaveOpsTransaction): string {
  const reason = tx.payment_reason?.trim()
  if (reason) return reason
  const type = tx.transaction_type?.trim()
  if (!type) return ''
  return WAVE_TX_TYPE_LABELS[type] ?? type.replace(/_/g, ' ')
}

function merchantLabel(tx: WaveOpsTransaction): string {
  return tx.aggregated_merchant_name?.trim() || tx.aggregated_merchant_id?.trim() || ''
}

function exportRows(items: WaveOpsTransaction[]): string[][] {
  return items.map((tx) => [
    new Date(tx.timestamp).toLocaleString(),
    tx.transaction_id,
    merchantLabel(tx) || 'Unassigned',
    tx.aggregated_merchant_id ?? '',
    waveTransactionDescription(tx),
    tx.client_reference ?? '',
    `${tx.amount} ${tx.currency}`,
    tx.fee,
    tx.counterparty_name ?? '',
    tx.counterparty_mobile ?? '',
    tx.is_reversal ? 'Reversal' : '',
  ])
}

const EXPORT_HEADERS = [
  'Time',
  'Transaction',
  'Merchant',
  'Merchant ID',
  'Description',
  'Client reference',
  'Amount',
  'Fee',
  'Counterparty',
  'Mobile',
  'Flags',
]

export function PlatformWaveOpsTransactionsPage() {
  const { user, canAccess } = useAuth()
  const canManage = canAccess('platform.wave_operations.manage')
  const [from, setFrom] = useState(todayYmd)
  const [to, setTo] = useState(todayYmd)
  const [merchant, setMerchant] = useState('')
  const [merchants, setMerchants] = useState<WaveOpsAggregatedMerchant[]>([])
  const [items, setItems] = useState<WaveOpsTransaction[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [refundId, setRefundId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const merchantOptions = useMemo(
    () => [
      { value: '', label: 'All merchants' },
      { value: UNASSIGNED_MERCHANT, label: 'Unassigned' },
      ...merchants.map((m) => ({
        value: m.id,
        label: m.name,
        hint: m.id,
      })),
    ],
    [merchants],
  )

  const filterParams = useMemo(
    () => ({
      from,
      to,
      ...(merchant ? { merchant } : {}),
    }),
    [from, merchant, to],
  )

  const load = useCallback(
    async (opts?: { append?: boolean; after?: string }) => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchWaveOpsTransactions({
          ...filterParams,
          after: opts?.after,
        })
        setItems((prev) => (opts?.append ? [...prev, ...data.items] : data.items))
        setCursor(data.page_info.end_cursor ?? null)
        setHasNext(Boolean(data.page_info.has_next_page))
      } catch (e) {
        if (!opts?.append) setItems([])
        setError(e instanceof ApiError ? e.message : 'Could not load transactions.')
      } finally {
        setLoading(false)
      }
    },
    [filterParams],
  )

  useEffect(() => {
    if (!isPlatformOperator(user) || !canAccess('platform.wave_operations.view')) return
    void load()
  }, [user, canAccess, load])

  useEffect(() => {
    if (!isPlatformOperator(user) || !canAccess('platform.wave_operations.view')) return
    void fetchWaveOpsAggregatedMerchants()
      .then(setMerchants)
      .catch(() => setMerchants([]))
  }, [user, canAccess])

  useEffect(() => {
    if (!exportOpen) return
    const onDoc = (e: MouseEvent) => {
      if (exportMenuRef.current?.contains(e.target as Node)) return
      setExportOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [exportOpen])

  const confirmRefund = async () => {
    if (!refundId) return
    setBusyId(refundId)
    setError(null)
    try {
      await refundWaveOpsTransaction(refundId)
      setRefundId(null)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Refund failed.')
    } finally {
      setBusyId(null)
    }
  }

  const loadExportRows = async (): Promise<WaveOpsTransaction[]> => {
    const data = await fetchWaveOpsTransactions({ ...filterParams, all: true })
    return data.items
  }

  const exportCsv = async () => {
    setExportOpen(false)
    setExporting('csv')
    setError(null)
    try {
      const rows = await loadExportRows()
      downloadCsv(`wave-transactions-${from}-to-${to}.csv`, EXPORT_HEADERS, exportRows(rows))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not export CSV.')
    } finally {
      setExporting(null)
    }
  }

  const exportPdf = async () => {
    setExportOpen(false)
    setExporting('pdf')
    setError(null)
    try {
      const rows = await loadExportRows()
      const merchantName = merchant
        ? merchants.find((m) => m.id === merchant)?.name ||
          (merchant === UNASSIGNED_MERCHANT ? 'Unassigned' : merchant)
        : 'All merchants'
      await downloadFinancePdf({
        title: 'Wave operations — Transactions',
        subtitle: `${from} to ${to} · ${merchantName} · ${rows.length} row(s)`,
        filename: `wave-transactions-${from}-to-${to}.pdf`,
        sections: [
          {
            headers: ['Time', 'Transaction', 'Merchant', 'Description', 'Amount', 'Fee', 'Counterparty', 'Flags'],
            columnWeights: [1.3, 1.2, 1.3, 1.6, 0.9, 0.6, 1.3, 0.7],
            rows: rows.map((tx) => [
              new Date(tx.timestamp).toLocaleString(),
              tx.transaction_id,
              merchantLabel(tx) || 'Unassigned',
              waveTransactionDescription(tx) || '—',
              `${tx.amount} ${tx.currency}`,
              tx.fee,
              [tx.counterparty_name, tx.counterparty_mobile].filter(Boolean).join(' · ') || '—',
              tx.is_reversal ? 'Reversal' : '',
            ]),
          },
        ],
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not export PDF.')
    } finally {
      setExporting(null)
    }
  }

  if (!isPlatformOperator(user) || !canAccess('platform.wave_operations.view')) {
    return (
      <PageTransition className="space-y-6" withSlide>
        <PageCard className="p-6">
          <p className="text-slate-600">You do not have access to Wave operations.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const busy = loading || Boolean(exporting)

  return (
    <PageTransition className="space-y-6" withSlide>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
          Platform · Wave operations
        </p>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-slate-900">
          <Waves className="h-8 w-8 text-teal-700" aria-hidden />
          Transactions
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Wallet transactions for the selected date range (up to 31 days), same as merchant
          summary. Description uses Wave&apos;s payment reason, or the transaction type when none
          is set. Refund reverses a received payment including fees.
        </p>
      </div>

      <PageCard className="p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1.5 block font-medium text-slate-700">From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={fieldInput}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block font-medium text-slate-700">To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={fieldInput}
              />
            </label>
            <div className="w-72 min-w-[16rem] text-sm">
              <span className="mb-1.5 block font-medium text-slate-700">Merchant</span>
              <SearchableSelect
                value={merchant}
                onChange={setMerchant}
                options={merchantOptions}
                placeholder="All merchants"
                emptyMessage="No merchants"
                noResultsMessage="No matching merchant"
                ariaLabel="Filter by merchant"
                matchOptionValue
                listWindowInitial={4}
                listWindowStep={4}
                listMaxHeightClass="max-h-56"
                buttonClassName="rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={busy}
              className="inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Load'}
            </button>
          </div>
          <div ref={exportMenuRef} className="relative ml-auto">
            <button
              type="button"
              disabled={busy}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((open) => !open)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
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
                  onClick={() => void exportCsv()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  <FileDown className="h-4 w-4 text-slate-500" />
                  Export CSV
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => void exportPdf()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  <FileText className="h-4 w-4 text-slate-500" />
                  Export PDF
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Transaction</th>
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Fee</th>
                <th className="px-4 py-3">Counterparty</th>
                <th className="px-4 py-3">Flags</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    No transactions for this filter.
                  </td>
                </tr>
              ) : null}
              {items.map((tx, idx) => {
                const description = waveTransactionDescription(tx)
                return (
                  <tr key={`${tx.transaction_id}-${idx}`} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {new Date(tx.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-800">{tx.transaction_id}</td>
                    <td className="px-4 py-3 text-slate-800">
                      {tx.aggregated_merchant_name || tx.aggregated_merchant_id ? (
                        <>
                          <span>{tx.aggregated_merchant_name || '—'}</span>
                          {tx.aggregated_merchant_id ? (
                            <span className="block font-mono text-[10px] text-slate-500">
                              {tx.aggregated_merchant_id}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-slate-800">
                      {description ? (
                        <span>{description}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      {tx.client_reference ? (
                        <span className="block font-mono text-[10px] text-slate-500">
                          {tx.client_reference}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {tx.amount} {tx.currency}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{tx.fee}</td>
                    <td className="px-4 py-3 text-slate-800">
                      {tx.counterparty_name || '—'}
                      {tx.counterparty_mobile ? (
                        <span className="block text-xs text-slate-500">{tx.counterparty_mobile}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {tx.is_reversal ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          Reversal
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && !tx.is_reversal && Number(tx.amount) > 0 ? (
                        <button
                          type="button"
                          onClick={() => setRefundId(tx.transaction_id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-800"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Refund
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {hasNext && cursor ? (
          <div className="mt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void load({ append: true, after: cursor })}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Load more
            </button>
          </div>
        ) : null}
      </PageCard>

      {refundId ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Refund transaction?</h3>
            <p className="mt-2 text-sm text-slate-600">
              This reverses payment <span className="font-mono text-xs">{refundId}</span> including
              fees. This cannot be undone from here.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => setRefundId(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => void confirmRefund()}
                className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50"
              >
                {busyId ? 'Refunding…' : 'Confirm refund'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageTransition>
  )
}
