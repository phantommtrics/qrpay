import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Banknote, CreditCard, Download } from 'lucide-react'

import { PaymentStatusBadge } from '../components/status/PaymentStatusBadge'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import {
  fetchBusinessPayments,
  type PaymentsListSummary,
  type SalePayment,
} from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

const PAYMENTS_PAGE_SIZE = 20

const emptySummary: PaymentsListSummary = {
  completedAmount: 0,
  completedCount: 0,
  nonCompletedCount: 0,
  walletCompletedCount: 0,
}

export function PaymentsPage() {
  const { currentOrganization, canAccess } = useAuth()
  const orgId = currentOrganization?.id
  const [payments, setPayments] = useState<SalePayment[]>([])
  const [paymentsTotal, setPaymentsTotal] = useState(0)
  const [paymentsPage, setPaymentsPage] = useState(1)
  const [summary, setSummary] = useState<PaymentsListSummary>(emptySummary)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canExportPayments = canAccess('payments.export')

  const displayPayments = useMemo(
    () => (orgId ? payments : []),
    [orgId, payments],
  )
  const displayLoading = orgId ? loading : false
  const displayError = orgId ? error : null

  useEffect(() => {
    setPaymentsPage(1)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      setLoading(true)
      setError(null)
      try {
        const res = await fetchBusinessPayments(orgId, {
          page: paymentsPage,
          pageSize: PAYMENTS_PAGE_SIZE,
        })
        if (!cancelled) {
          setPayments(res.payments)
          setPaymentsTotal(res.total)
          setSummary(res.summary ?? emptySummary)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'Could not load payments.')
          setPayments([])
          setPaymentsTotal(0)
          setSummary(emptySummary)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, paymentsPage])

  const totalProcessed = summary.completedAmount
  const successfulPayments = summary.completedCount
  const failedOrPending = summary.nonCompletedCount
  const walletShare = useMemo(() => {
    if (summary.completedCount === 0) return 0
    return Math.round((summary.walletCompletedCount / summary.completedCount) * 100)
  }, [summary.completedCount, summary.walletCompletedCount])

  const paymentsRangeLabel = useMemo(() => {
    if (paymentsTotal === 0) return 'No payments'
    const start = (paymentsPage - 1) * PAYMENTS_PAGE_SIZE + 1
    const end = Math.min(paymentsPage * PAYMENTS_PAGE_SIZE, paymentsTotal)
    return `Showing ${start}–${end} of ${paymentsTotal}`
  }, [paymentsTotal, paymentsPage])

  return (
    <PageTransition className="space-y-6">
      {displayError ? (
        <PageCard className="border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {displayError}
        </PageCard>
      ) : null}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <PageCard className="p-6">
          <p className="mb-1 text-sm font-medium text-slate-500">Total Processed</p>
          <h3 className="mb-4 text-2xl font-bold text-slate-800">
            {displayLoading ? '…' : formatMoney(totalProcessed)}
          </h3>
          <svg
            className="h-2 w-full overflow-hidden rounded-full text-slate-100"
            viewBox="0 0 100 1"
            preserveAspectRatio="none"
            aria-hidden
          >
            <rect width="100" height="1" fill="currentColor" />
            <rect
              width={Math.min(100, walletShare)}
              height="1"
              fill="rgb(20 184 166)"
              className="transition-all"
            />
          </svg>
          <p className="mt-2 text-xs text-slate-400">
            {displayLoading ? 'Loading…' : `${walletShare}% via QR wallet (completed)`}
          </p>
        </PageCard>
        <PageCard className="p-6">
          <p className="mb-1 text-sm font-medium text-slate-500">Successful</p>
          <h3 className="mb-4 text-2xl font-bold text-emerald-600">
            {displayLoading ? '…' : successfulPayments}
          </h3>
          <div className="flex items-center text-sm font-medium text-emerald-600">
            <ArrowUpRight className="mr-1 h-4 w-4" />
            Completed payments
          </div>
        </PageCard>
        <PageCard className="p-6">
          <p className="mb-1 text-sm font-medium text-slate-500">Failed / Pending</p>
          <h3 className="mb-4 text-2xl font-bold text-amber-600">
            {displayLoading ? '…' : failedOrPending}
          </h3>
          <p className="text-sm text-slate-500">Non-completed attempts</p>
        </PageCard>
      </div>

      <PageCard className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800">Recent Transactions</h2>
          <button
            type="button"
            disabled={!canExportPayments}
            className="flex items-center text-sm font-medium text-slate-600 hover:text-teal-600 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            <Download className="mr-1.5 h-4 w-4" />
            {canExportPayments ? 'Export CSV' : 'Export locked'}
          </button>
        </div>
        <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
          <table className="min-w-[1100px] w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm text-slate-500">
                <th className="px-5 py-4 font-medium">Reference</th>
                <th className="px-5 py-4 font-medium">Provider ref</th>
                <th className="px-5 py-4 font-medium">Order ref</th>
                <th className="px-5 py-4 font-medium">Method</th>
                <th className="px-5 py-4 font-medium">Provider</th>
                <th className="px-5 py-4 font-medium">Amount</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : displayPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-slate-500">
                    No payments yet. Complete a sale on POS to see records here.
                  </td>
                </tr>
              ) : (
                displayPayments.map((payment) => (
                  <tr key={payment.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-4 font-mono text-sm text-slate-600">{payment.reference}</td>
                    <td className="max-w-[220px] px-5 py-4 font-mono text-sm break-all text-slate-600">
                      {payment.providerReference?.trim() ? payment.providerReference : '—'}
                    </td>
                    <td className="px-5 py-4 font-mono text-sm font-medium text-slate-800">
                      {payment.orderPublicCode ?? payment.orderId}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center text-sm text-slate-700">
                        {payment.method === 'qr_wallet' ? (
                          <>
                            <CreditCard className="mr-2 h-4 w-4 shrink-0 text-teal-500" />
                            QR Wallet
                          </>
                        ) : (
                          <>
                            <Banknote className="mr-2 h-4 w-4 shrink-0 text-emerald-500" />
                            Cash
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm capitalize text-slate-600">{payment.provider}</td>
                    <td className="px-5 py-4 font-bold text-slate-800">
                      {formatMoney(payment.amount, { decimals: 0 })}
                    </td>
                    <td className="px-5 py-4">
                      <PaymentStatusBadge status={payment.status} />
                    </td>
                    <td className="px-5 py-4 text-sm whitespace-nowrap text-slate-500">
                      {new Date(payment.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {orgId && !displayLoading ? (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>{paymentsRangeLabel}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={paymentsPage <= 1}
                onClick={() => setPaymentsPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={paymentsPage * PAYMENTS_PAGE_SIZE >= paymentsTotal}
                onClick={() => setPaymentsPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </PageCard>
    </PageTransition>
  )
}
