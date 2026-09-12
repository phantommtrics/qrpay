import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { Toast, type ToastVariant } from '../components/ui/Toast'
import { salesSettlementDetailPath } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  createMerchantSettlementRequest,
  fetchMerchantSettlementRequests,
  fetchMerchantSettlementSummary,
  type MerchantSettlementRequestRow,
  type MerchantSettlementSummary,
} from '../services/merchantSettlementApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

function statusLabel(status: MerchantSettlementRequestRow['status']): string {
  if (status === 'OPEN') return 'Open'
  if (status === 'COMPLETED') return 'Completed'
  return 'Cancelled'
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultDateRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 29)
  return { from: toDateInputValue(from), to: toDateInputValue(to) }
}

const fieldClass =
  'w-full rounded-md border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading outline-none focus:border-qb-heading'

export function SalesSettlementPage() {
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id ?? null

  const initialRange = defaultDateRange()
  const [summary, setSummary] = useState<MerchantSettlementSummary | null>(null)
  const [requests, setRequests] = useState<MerchantSettlementRequestRow[]>([])
  const [requestTotal, setRequestTotal] = useState(0)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [fromDate, setFromDate] = useState(initialRange.from)
  const [toDate, setToDate] = useState(initialRange.to)
  const [appliedFrom, setAppliedFrom] = useState(initialRange.from)
  const [appliedTo, setAppliedTo] = useState(initialRange.to)
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null)

  const loadSummary = useCallback(async () => {
    if (!businessId) return
    setSummaryLoading(true)
    try {
      setSummary(await fetchMerchantSettlementSummary(businessId))
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load settlement.'
      setToast({ message, variant: 'error' })
    } finally {
      setSummaryLoading(false)
    }
  }, [businessId])

  const loadHistory = useCallback(async () => {
    if (!businessId) return
    setHistoryLoading(true)
    try {
      const result = await fetchMerchantSettlementRequests(businessId, {
        from: appliedFrom,
        to: appliedTo,
      })
      setRequests(result.data)
      setRequestTotal(result.meta.total)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load requests.'
      setToast({ message, variant: 'error' })
    } finally {
      setHistoryLoading(false)
    }
  }, [businessId, appliedFrom, appliedTo])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  function applyDateFilter() {
    if (fromDate && toDate && fromDate > toDate) {
      setToast({ message: 'From date must be on or before to date.', variant: 'error' })
      return
    }
    setAppliedFrom(fromDate)
    setAppliedTo(toDate)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!businessId || submitting) return
    const n = Number.parseFloat(amount.replace(/,/g, ''))
    if (!Number.isFinite(n) || n <= 0) {
      setToast({ message: 'Enter a valid amount.', variant: 'error' })
      return
    }
    setSubmitting(true)
    try {
      const row = await createMerchantSettlementRequest(businessId, {
        amount: n,
        note: note.trim() || null,
      })
      setAmount('')
      setNote('')
      setToast({
        message: row.ticketingRef ? `Request ${row.ticketingRef} submitted.` : 'Request submitted.',
        variant: 'success',
      })
      await Promise.all([loadSummary(), loadHistory()])
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not submit request.'
      setToast({ message, variant: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  if (!businessId) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <h1 className="text-xl font-semibold text-qb-heading">DirectPay settlement</h1>
          <p className="mt-4 text-qb-muted">Select a business to continue.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const available = summary?.availableForSettlement ?? 0
  const busy = summaryLoading || submitting

  return (
    <PageTransition>
      <div className="space-y-6 pb-10">
        <PageCard variant="plain">
          <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">
            DirectPay settlement
          </h1>
          <p className="mt-1 text-sm text-qb-muted">{currentOrganization?.name}</p>
        </PageCard>

        <div className="rounded-md border border-qb-border bg-white p-6 shadow-[0_1px_2px_rgba(57,58,61,0.08)] sm:max-w-md">
          <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
            Ready for settlement
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-qb-heading">
            {summaryLoading || !summary ? '…' : formatMoney(available)}
          </p>
          {summary && summary.openRequestTotal > 0 ? (
            <p className="mt-2 text-sm text-qb-muted">
              {formatMoney(summary.clearingBalance)} clearing ·{' '}
              {formatMoney(summary.openRequestTotal)} open
            </p>
          ) : null}
        </div>

        <PageCard variant="plain">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-qb-muted">
            Request payout
          </h2>
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <label className="block max-w-xs">
              <span className="mb-1.5 block text-sm font-medium text-qb-heading">Amount</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={available > 0 ? available.toFixed(2) : '0.00'}
                className={fieldClass}
                disabled={busy}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-qb-heading">Note</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                rows={4}
                className={`${fieldClass} min-h-[6rem] resize-y`}
                disabled={busy}
              />
            </label>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy || available <= 0}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-qb-heading px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Submit
              </button>
            </div>
          </form>
        </PageCard>

        <PageCard variant="plain">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-qb-muted">
              Requests
            </h2>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-qb-heading">From</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className={fieldClass}
                  disabled={historyLoading}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-qb-heading">To</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className={fieldClass}
                  disabled={historyLoading}
                />
              </label>
              <button
                type="button"
                onClick={applyDateFilter}
                disabled={historyLoading}
                className="inline-flex h-10 items-center justify-center rounded-md border border-qb-border bg-white px-4 text-sm font-semibold text-qb-heading hover:bg-qb-surface disabled:opacity-45"
              >
                Apply
              </button>
            </div>
          </div>

          {historyLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-qb-muted" />
            </div>
          ) : requests.length === 0 ? (
            <p className="mt-4 text-sm text-qb-muted">No requests in this range.</p>
          ) : (
            <>
              <p className="mt-3 text-xs text-qb-muted">
                {requests.length === requestTotal
                  ? `${requestTotal} request${requestTotal === 1 ? '' : 's'}`
                  : `Showing ${requests.length} of ${requestTotal}`}
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-qb-border text-xs uppercase tracking-wide text-qb-muted">
                      <th className="py-2 pr-3 font-semibold">Date</th>
                      <th className="py-2 pr-3 font-semibold">Amount</th>
                      <th className="py-2 pr-3 font-semibold">Ticket</th>
                      <th className="py-2 pr-3 font-semibold">Status</th>
                      <th className="py-2 font-semibold">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((row) => (
                      <tr key={row.id} className="border-b border-qb-border/70">
                        <td className="py-3 pr-3 tabular-nums text-qb-heading">
                          <Link
                            to={salesSettlementDetailPath(row.id)}
                            className="font-medium text-qb-heading underline-offset-2 hover:underline"
                          >
                            {new Date(row.createdAt).toLocaleString()}
                          </Link>
                        </td>
                        <td className="py-3 pr-3 font-medium tabular-nums text-qb-heading">
                          {formatMoney(row.amount)}
                        </td>
                        <td className="py-3 pr-3 text-qb-heading">
                          <Link
                            to={salesSettlementDetailPath(row.id)}
                            className="text-qb-heading underline-offset-2 hover:underline"
                          >
                            {row.ticketingRef ?? 'View'}
                          </Link>
                        </td>
                        <td className="py-3 pr-3 text-qb-heading">{statusLabel(row.status)}</td>
                        <td className="py-3 text-qb-muted">{row.requestedByName ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </PageCard>
      </div>

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </PageTransition>
  )
}
