import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Banknote, CreditCard, Download } from 'lucide-react'

import { PaymentStatusBadge } from '../components/status/PaymentStatusBadge'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import { fetchBusinessPayments, type SalePayment } from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

export function PaymentsPage() {
  const { currentOrganization, canAccess } = useAuth()
  const orgId = currentOrganization?.id
  const [payments, setPayments] = useState<SalePayment[]>([])
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
    if (!orgId) return
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      setLoading(true)
      setError(null)
      try {
        const res = await fetchBusinessPayments(orgId, { pageSize: 100 })
        if (!cancelled) {
          setPayments(res.payments)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'Could not load payments.')
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
  }, [orgId])

  const totalProcessed = useMemo(
    () =>
      displayPayments
        .filter((payment) => payment.status === 'completed')
        .reduce((sum, payment) => sum + payment.amount, 0),
    [displayPayments],
  )
  const successfulPayments = useMemo(
    () => displayPayments.filter((payment) => payment.status === 'completed').length,
    [displayPayments],
  )
  const failedOrPending = useMemo(
    () => displayPayments.filter((payment) => payment.status !== 'completed').length,
    [displayPayments],
  )
  const walletShare = useMemo(() => {
    const completed = displayPayments.filter((p) => p.status === 'completed')
    if (completed.length === 0) {
      return 0
    }
    const wallet = completed.filter((p) => p.method === 'qr_wallet').length
    return Math.round((wallet / completed.length) * 100)
  }, [displayPayments])

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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm text-slate-500">
                <th className="p-4 font-medium">Reference</th>
                <th className="p-4 font-medium">Order Ref</th>
                <th className="p-4 font-medium">Method</th>
                <th className="p-4 font-medium">Provider</th>
                <th className="p-4 font-medium">Amount</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : displayPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No payments yet. Complete a sale on POS to see records here.
                  </td>
                </tr>
              ) : (
                displayPayments.map((payment) => (
                  <tr key={payment.id} className="transition-colors hover:bg-slate-50">
                    <td className="p-4 font-mono text-sm text-slate-600">{payment.reference}</td>
                    <td className="p-4 font-mono text-sm font-medium text-slate-800">
                      {payment.orderPublicCode ?? payment.orderId}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center text-sm text-slate-700">
                        {payment.method === 'qr_wallet' ? (
                          <>
                            <CreditCard className="mr-2 h-4 w-4 text-teal-500" />
                            QR Wallet
                          </>
                        ) : (
                          <>
                            <Banknote className="mr-2 h-4 w-4 text-emerald-500" />
                            Cash
                          </>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-sm capitalize text-slate-600">{payment.provider}</td>
                    <td className="p-4 font-bold text-slate-800">
                      {formatMoney(payment.amount, { decimals: 0 })}
                    </td>
                    <td className="p-4">
                      <PaymentStatusBadge status={payment.status} />
                    </td>
                    <td className="p-4 text-sm text-slate-500">
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
      </PageCard>
    </PageTransition>
  )
}
