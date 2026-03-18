import { ArrowUpRight, Banknote, CreditCard, Download } from 'lucide-react'

import { PaymentStatusBadge } from '../components/status/PaymentStatusBadge'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { MOCK_PAYMENTS } from '../data/mockData'
import { formatMoney } from '../utils/formatMoney'

export function PaymentsPage() {
  return (
    <PageTransition className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <PageCard className="p-6">
          <p className="mb-1 text-sm font-medium text-slate-500">Total Processed</p>
          <h3 className="mb-4 text-2xl font-bold text-slate-800">
            {formatMoney(12450)}
          </h3>
          <div className="h-2 w-full rounded-full bg-slate-100">
            <div className="h-2 w-[85%] rounded-full bg-teal-500" />
          </div>
          <p className="mt-2 text-xs text-slate-400">85% via QR Wallet</p>
        </PageCard>
        <PageCard className="p-6">
          <p className="mb-1 text-sm font-medium text-slate-500">Successful</p>
          <h3 className="mb-4 text-2xl font-bold text-emerald-600">42</h3>
          <div className="flex items-center text-sm font-medium text-emerald-600">
            <ArrowUpRight className="mr-1 h-4 w-4" />
            +12% this week
          </div>
        </PageCard>
        <PageCard className="p-6">
          <p className="mb-1 text-sm font-medium text-slate-500">Failed / Pending</p>
          <h3 className="mb-4 text-2xl font-bold text-amber-600">3</h3>
          <p className="text-sm text-slate-500">Requires attention</p>
        </PageCard>
      </div>

      <PageCard className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800">Recent Transactions</h2>
          <button className="flex items-center text-sm font-medium text-slate-600 hover:text-teal-600">
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm text-slate-500">
                <th className="p-4 font-medium">Reference</th>
                <th className="p-4 font-medium">Order ID</th>
                <th className="p-4 font-medium">Method</th>
                <th className="p-4 font-medium">Amount</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_PAYMENTS.map((payment) => (
                <tr key={payment.id} className="transition-colors hover:bg-slate-50">
                  <td className="p-4 font-mono text-sm text-slate-600">
                    {payment.reference}
                  </td>
                  <td className="p-4 font-mono text-sm font-medium text-slate-800">
                    {payment.orderId}
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
              ))}
            </tbody>
          </table>
        </div>
      </PageCard>
    </PageTransition>
  )
}
