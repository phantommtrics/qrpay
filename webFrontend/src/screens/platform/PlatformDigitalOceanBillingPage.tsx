import { useCallback, useEffect, useState } from 'react'
import { Cloud, Loader2, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  fetchDigitalOceanBalance,
  fetchDigitalOceanBillingHistory,
  fetchDigitalOceanInvoices,
  formatUsdAmount,
  syncDigitalOceanInvoices,
  type DigitalOceanBalancePayload,
  type DigitalOceanBillingHistoryItem,
  type DigitalOceanInvoiceListPayload,
} from '../../services/digitalOceanBillingApi'
import { ApiError } from '../../services/subscriptionApi'
import { formatMoney } from '../../utils/formatMoney'
import { isPlatformOperator } from '../../utils/platformOperator'

type TabId = 'overview' | 'invoices' | 'history'

export function PlatformDigitalOceanBillingPage() {
  const { user, canAccess } = useAuth()
  const canView = canAccess('platform.digitalocean_billing.view')
  const [tab, setTab] = useState<TabId>('overview')
  const [list, setList] = useState<DigitalOceanInvoiceListPayload | null>(null)
  const [balance, setBalance] = useState<DigitalOceanBalancePayload | null>(null)
  const [history, setHistory] = useState<DigitalOceanBillingHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)

  const loadList = useCallback(async () => {
    const payload = await fetchDigitalOceanInvoices()
    setList(payload)
    setNotConfigured(!payload.configured)
    return payload
  }, [])

  const loadBalance = useCallback(async () => {
    try {
      setBalanceError(null)
      setBalance(await fetchDigitalOceanBalance())
    } catch (e) {
      setBalance(null)
      const message = e instanceof ApiError ? e.message : 'Could not load DigitalOcean balance.'
      setBalanceError(message)
      if (e instanceof ApiError && e.statusCode === 503) {
        setNotConfigured(true)
      }
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([loadList(), loadBalance()])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load DigitalOcean billing.')
    } finally {
      setLoading(false)
    }
  }, [loadBalance, loadList])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      setHistory(await fetchDigitalOceanBillingHistory())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load billing history.')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isPlatformOperator(user) || !canView) return
    void load()
  }, [user, canView, load])

  useEffect(() => {
    if (tab !== 'history' || history.length || historyLoading || notConfigured) return
    void loadHistory()
  }, [tab, history.length, historyLoading, loadHistory, notConfigured])

  const onSync = async () => {
    setSyncing(true)
    setError(null)
    try {
      const payload = await syncDigitalOceanInvoices()
      setList(payload)
      setNotConfigured(!payload.configured)
      await loadBalance()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sync invoices.')
    } finally {
      setSyncing(false)
    }
  }

  if (!isPlatformOperator(user) || !canView) {
    return (
      <PageTransition className="space-y-6" withSlide>
        <PageCard className="p-6">
          <p className="text-slate-600">You do not have access to DigitalOcean billing.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const invoices = list?.invoices ?? []
  const postedCount = invoices.filter((i) => i.status === 'POSTED').length

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
            Platform · Finance
          </p>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-slate-900">
            <Cloud className="h-8 w-8 text-teal-700" aria-hidden />
            DigitalOcean billing
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Review hosting invoices, convert USD to GMD, and post expenses to Hosting &amp;
            infrastructure (P-5100).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onSync()}
          disabled={syncing || loading || notConfigured}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          Sync invoices
        </button>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {notConfigured ? (
        <PageCard className="p-6">
          <p className="text-sm font-medium text-slate-900">DigitalOcean is not configured</p>
          <p className="mt-2 text-sm text-slate-600">
            Set <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">DIGITALOCEAN_TOKEN</code>{' '}
            on the API server with the <strong>billing:read</strong> scope. The token is never entered
            in this UI.
          </p>
        </PageCard>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['overview', 'Overview'],
            ['invoices', 'Invoices'],
            ['history', 'Billing history'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === id
                ? 'bg-teal-700 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <PageCard className="p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account balance</p>
            {loading && !balance ? (
              <p className="mt-3 text-sm text-slate-500">Loading…</p>
            ) : balance ? (
              <>
                <p className="mt-2 text-3xl font-semibold text-slate-900">
                  {formatUsdAmount(balance.accountBalance)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  As of {new Date(balance.generatedAt).toLocaleString()}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-500">{balanceError ?? 'Unavailable'}</p>
            )}
          </PageCard>
          <PageCard className="p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Month-to-date usage</p>
            {balance ? (
              <>
                <p className="mt-2 text-3xl font-semibold text-slate-900">
                  {formatUsdAmount(balance.monthToDateUsage)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  MTD balance {formatUsdAmount(balance.monthToDateBalance)}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-500">{loading ? 'Loading…' : '—'}</p>
            )}
          </PageCard>
          <PageCard className="p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Posted invoices</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {postedCount}
              <span className="ml-2 text-base font-medium text-slate-500">/ {invoices.length}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Last sync{' '}
              {list?.lastSyncedAt ? new Date(list.lastSyncedAt).toLocaleString() : 'not yet'}
            </p>
          </PageCard>
        </div>
      ) : null}

      {tab === 'overview' && list?.invoicePreview ? (
        <PageCard className="p-6">
          <p className="text-sm font-semibold text-slate-900">Current month preview</p>
          <p className="mt-1 text-sm text-slate-600">
            Period {list.invoicePreview.billingPeriod} ·{' '}
            {formatUsdAmount(list.invoicePreview.amountUsd)} (not postable until DigitalOcean
            finalizes the invoice)
          </p>
          <Link
            to={`${APP_PATHS.platformDigitalOceanBilling}/invoices/${encodeURIComponent(list.invoicePreview.invoiceUuid)}`}
            className="mt-3 inline-block text-sm font-medium text-teal-700 hover:underline"
          >
            View preview detail
          </Link>
        </PageCard>
      ) : null}

      {tab === 'invoices' ? (
        <PageCard className="overflow-hidden p-0">
          {loading ? (
            <p className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices…
            </p>
          ) : invoices.length === 0 ? (
            <p className="p-6 text-sm text-slate-600">
              No finalized invoices yet. Click Sync invoices after the token is configured.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Period</th>
                    <th className="px-4 py-3 font-semibold">Invoice</th>
                    <th className="px-4 py-3 font-semibold">USD</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">GMD posted</th>
                    <th className="px-4 py-3 font-semibold">Bill</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.billingPeriod}</td>
                      <td className="px-4 py-3">
                        <Link
                          to={`${APP_PATHS.platformDigitalOceanBilling}/invoices/${encodeURIComponent(row.invoiceUuid)}`}
                          className="font-medium text-teal-700 hover:underline"
                        >
                          {row.invoiceId}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{formatUsdAmount(row.amountUsd)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            row.status === 'POSTED'
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {row.status === 'POSTED' ? 'Posted' : 'Ready to post'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.amountGmd ? formatMoney(Number(row.amountGmd)) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.platformBill ? (
                          <Link
                            to={APP_PATHS.platformBillDetail.replace(':billId', row.platformBill.id)}
                            className="text-teal-700 hover:underline"
                          >
                            {row.platformBill.publicCode}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PageCard>
      ) : null}

      {tab === 'history' ? (
        <PageCard className="overflow-hidden p-0">
          {historyLoading ? (
            <p className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading billing history…
            </p>
          ) : history.length === 0 ? (
            <p className="p-6 text-sm text-slate-600">No billing history returned from DigitalOcean.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Description</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={`${h.date}-${h.type}-${i}`} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {h.date ? new Date(h.date).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3">{h.type}</td>
                      <td className="max-w-md px-4 py-3 text-slate-600">{h.description}</td>
                      <td className="px-4 py-3">{formatUsdAmount(h.amount)}</td>
                      <td className="px-4 py-3">
                        {h.invoiceUuid ? (
                          <Link
                            to={`${APP_PATHS.platformDigitalOceanBilling}/invoices/${encodeURIComponent(h.invoiceUuid)}`}
                            className="text-teal-700 hover:underline"
                          >
                            {h.invoiceId ?? h.invoiceUuid.slice(0, 8)}
                          </Link>
                        ) : (
                          (h.invoiceId ?? '—')
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PageCard>
      ) : null}
    </PageTransition>
  )
}
