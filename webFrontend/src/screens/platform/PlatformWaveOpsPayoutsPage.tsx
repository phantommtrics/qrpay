import { useCallback, useEffect, useMemo, useState } from 'react'
import { generatePath, Link, useNavigate } from 'react-router-dom'
import { Loader2, Plus, Search, Trash2, Waves } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  createWaveOpsPayout,
  createWaveOpsPayoutBulk,
  fetchPlatformSuppliers,
  fetchWaveOpsPayouts,
  searchWaveOpsPayouts,
  type PlatformSupplierRow,
  type WaveOpsPayoutRow,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

type Tab = 'single' | 'bulk' | 'history'

type BulkRow = { key: string; supplierId: string; receiveAmount: string; clientReference: string }

const fieldInput =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600/30'

const fieldTextarea =
  'w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600/30'

function statusClass(status: string) {
  switch (status) {
    case 'succeeded':
      return 'bg-emerald-50 text-emerald-800'
    case 'processing':
      return 'bg-amber-50 text-amber-900'
    case 'failed':
    case 'reversed':
      return 'bg-rose-50 text-rose-800'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

export function PlatformWaveOpsPayoutsPage() {
  const { user, canAccess } = useAuth()
  const canManage = canAccess('platform.wave_operations.manage')
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('history')
  const [suppliers, setSuppliers] = useState<PlatformSupplierRow[]>([])
  const [history, setHistory] = useState<WaveOpsPayoutRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchRef, setSearchRef] = useState('')

  const [supplierId, setSupplierId] = useState('')
  const [amount, setAmount] = useState('')
  const [clientRef, setClientRef] = useState('')
  const [lastResult, setLastResult] = useState<WaveOpsPayoutRow | null>(null)

  const [bulkRows, setBulkRows] = useState<BulkRow[]>([
    { key: '1', supplierId: '', receiveAmount: '', clientReference: '' },
  ])

  const supplierOptions = useMemo(
    () => [...suppliers].sort((a, b) => a.name.localeCompare(b.name)),
    [suppliers],
  )

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchWaveOpsPayouts({ limit: 100 })
      setHistory(rows)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load payouts.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isPlatformOperator(user) || !canAccess('platform.wave_operations.view')) return
    void (async () => {
      try {
        const s = await fetchPlatformSuppliers()
        setSuppliers(s)
      } catch {
        // non-fatal for history-only view
      }
      await loadHistory()
    })()
  }, [user, canAccess, loadHistory])

  const submitSingle = async () => {
    if (!supplierId || !amount) return
    setLoading(true)
    setError(null)
    try {
      const row = await createWaveOpsPayout({
        supplierId,
        receiveAmount: amount,
        clientReference: clientRef.trim() || null,
      })
      setLastResult(row)
      await loadHistory()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Payout failed.')
    } finally {
      setLoading(false)
    }
  }

  const submitBulk = async () => {
    const items = bulkRows
      .filter((r) => r.supplierId && r.receiveAmount)
      .map((r) => ({
        supplierId: r.supplierId,
        receiveAmount: r.receiveAmount,
        clientReference: r.clientReference.trim() || null,
      }))
    if (!items.length) {
      setError('Add at least one payout row with supplier and amount.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const batch = await createWaveOpsPayoutBulk({ items })
      navigate(generatePath(APP_PATHS.platformWaveOpsPayoutBatchDetail, { batchId: batch.id }))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Bulk payout failed.')
    } finally {
      setLoading(false)
    }
  }

  const runSearch = async () => {
    if (!searchRef.trim()) return
    setLoading(true)
    setError(null)
    try {
      const rows = await searchWaveOpsPayouts(searchRef.trim())
      setHistory(rows)
      setTab('history')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Search failed.')
    } finally {
      setLoading(false)
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

  const tabs: [Tab, string][] = [
    ['history', 'History'],
    ...(canManage
      ? ([
          ['single', 'Single payout'],
          ['bulk', 'Bulk payout'],
        ] as [Tab, string][])
      : []),
  ]

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
            Platform · Wave operations
          </p>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-slate-900">
            <Waves className="h-8 w-8 text-teal-700" aria-hidden />
            Payouts
          </h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Send money from the Wave wallet to supplier contacts. Pay approved bills from Supplier
            bills with Wave selected.
          </p>
        </div>
        <Link
          to={APP_PATHS.platformBills}
          className="inline-flex items-center justify-center self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Pay bills
        </Link>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      <PageCard className="overflow-hidden p-0">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50/80 px-3 pt-3 sm:px-4">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-medium transition ${
                tab === id
                  ? 'bg-white text-teal-800 shadow-[0_-1px_0_0_white] ring-1 ring-slate-200 ring-b-0'
                  : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-5 sm:p-6">
          {tab === 'single' && canManage ? (
            <div className="max-w-xl space-y-4">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-slate-700">Supplier contact</span>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className={fieldInput}
                >
                  <option value="">Select…</option>
                  {supplierOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.phone ? ` (${s.phone})` : ' — no phone'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-slate-700">Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={fieldInput}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-slate-700">
                  Client reference (optional)
                </span>
                <textarea
                  value={clientRef}
                  onChange={(e) => setClientRef(e.target.value)}
                  rows={4}
                  maxLength={500}
                  placeholder="Optional note or reference. Text wraps to new lines."
                  className={fieldTextarea}
                />
                <span className="mt-1 block text-xs text-slate-500">
                  {clientRef.length}/500 · wraps onto new lines
                </span>
              </label>
              <button
                type="button"
                disabled={loading || !supplierId || !amount}
                onClick={() => void submitSingle()}
                className="inline-flex rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send payout'}
              </button>
              {lastResult ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <p className="text-slate-800">
                    Status:{' '}
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(lastResult.status)}`}
                    >
                      {lastResult.status}
                    </span>
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-600">
                    {lastResult.wavePayoutId || lastResult.id}
                  </p>
                  {lastResult.fee ? (
                    <p className="mt-1 text-slate-500">Fee: {lastResult.fee}</p>
                  ) : null}
                  <Link
                    to={generatePath(APP_PATHS.platformWaveOpsPayoutDetail, {
                      payoutId: lastResult.id,
                    })}
                    className="mt-2 inline-block font-medium text-teal-700 hover:text-teal-800"
                  >
                    View detail
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'bulk' && canManage ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Add multiple supplier payouts. Submitted as one Wave payout batch.
              </p>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="min-w-[14rem] px-4 py-3">Client ref</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkRows.map((row, idx) => (
                      <tr key={row.key}>
                        <td className="px-4 py-3 align-top">
                          <select
                            value={row.supplierId}
                            onChange={(e) => {
                              const v = e.target.value
                              setBulkRows((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, supplierId: v } : r)),
                              )
                            }}
                            className={`${fieldInput} min-w-[12rem]`}
                          >
                            <option value="">Select…</option>
                            {supplierOptions.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                                {s.phone ? ` (${s.phone})` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.receiveAmount}
                            onChange={(e) => {
                              const v = e.target.value
                              setBulkRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, receiveAmount: v } : r,
                                ),
                              )
                            }}
                            className={`${fieldInput} w-28`}
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <textarea
                            value={row.clientReference}
                            onChange={(e) => {
                              const v = e.target.value
                              setBulkRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, clientReference: v } : r,
                                ),
                              )
                            }}
                            rows={3}
                            maxLength={500}
                            placeholder="Optional reference…"
                            className={`${fieldTextarea} min-w-[14rem]`}
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <button
                            type="button"
                            onClick={() =>
                              setBulkRows((prev) =>
                                prev.length === 1 ? prev : prev.filter((_, i) => i !== idx),
                              )
                            }
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-700"
                            aria-label="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setBulkRows((prev) => [
                      ...prev,
                      {
                        key: String(Date.now()),
                        supplierId: '',
                        receiveAmount: '',
                        clientReference: '',
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                  Add row
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void submitBulk()}
                  className="inline-flex rounded-xl bg-teal-700 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-800 disabled:opacity-50"
                >
                  {loading ? 'Submitting…' : 'Submit batch'}
                </button>
              </div>
            </div>
          ) : null}

          {tab === 'history' ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <textarea
                  value={searchRef}
                  onChange={(e) => setSearchRef(e.target.value)}
                  rows={2}
                  placeholder="Search by client reference (text wraps)…"
                  className={`${fieldTextarea} min-w-0 flex-1`}
                />
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => void runSearch()}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Search className="h-4 w-4" />
                    Search Wave
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadHistory()}
                    disabled={loading}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    Refresh
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Recipient</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Wave id</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading && history.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                        </td>
                      </tr>
                    ) : null}
                    {!loading && history.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          No payouts yet.
                        </td>
                      </tr>
                    ) : null}
                    {history.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          {row.name}
                          <span className="block text-xs text-slate-500">{row.mobile}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          {row.receiveAmount} {row.currency}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(row.status)}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {row.wavePayoutId || '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={generatePath(APP_PATHS.platformWaveOpsPayoutDetail, {
                              payoutId: row.id,
                            })}
                            className="font-medium text-teal-700 hover:text-teal-800"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </PageCard>
    </PageTransition>
  )
}
