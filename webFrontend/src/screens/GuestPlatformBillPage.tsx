import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileText } from 'lucide-react'

import { EasypayLogoMark } from '../components/branding/EasypayLogoMark'
import {
  fetchGuestPlatformBill,
  guestPlatformBillPdfApiUrl,
  type GuestPlatformBillPayload,
} from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

export function GuestPlatformBillPage() {
  const { guestToken } = useParams<{ guestToken: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<GuestPlatformBillPayload | null>(null)

  const load = useCallback(async () => {
    if (!guestToken) {
      setError('Invalid link.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const d = await fetchGuestPlatformBill(guestToken)
      setData(d)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load bill.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [guestToken])

  useEffect(() => {
    void load()
  }, [load])

  const openPdf = () => {
    if (!guestToken) return
    window.open(guestPlatformBillPdfApiUrl(guestToken), '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <EasypayLogoMark className="h-10 w-10 text-teal-600" />
          <h1 className="text-xl font-semibold text-slate-900">DPay — Purchase bill</h1>
          <p className="text-sm text-slate-600">
            View this bill without signing in. For questions, reply to the email you received.
          </p>
        </div>

        {loading ? (
          <p className="text-center text-slate-500">Loading…</p>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-800">
            {error}
          </div>
        ) : data ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{data.supplierName}</p>
                  <p className="mt-2 font-mono text-sm text-slate-700">Bill {data.publicCode}</p>
                  {data.reference ? (
                    <p className="mt-1 text-sm text-slate-600">Ref: {data.reference}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase text-slate-500">Status</p>
                  <p className="mt-1 text-sm font-medium text-slate-800">{data.status}</p>
                  {data.paidAt ? (
                    <p className="mt-2 text-xs text-emerald-700">
                      Paid {new Date(data.paidAt).toLocaleString()}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-slate-500">Issue date</span>
                  <p className="font-medium text-slate-900">
                    {new Date(data.issueDate).toLocaleDateString(undefined, { dateStyle: 'long' })}
                  </p>
                </div>
                {data.dueDate ? (
                  <div>
                    <span className="text-slate-500">Due date</span>
                    <p className="font-medium text-slate-900">
                      {new Date(data.dueDate).toLocaleDateString(undefined, { dateStyle: 'long' })}
                    </p>
                  </div>
                ) : null}
                <div>
                  <span className="text-slate-500">Total</span>
                  <p className="text-lg font-semibold tabular-nums text-slate-900">
                    {formatMoney(data.total, { decimals: 2 })} {data.currency}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openPdf()}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
              >
                <FileText className="h-4 w-4" />
                Open PDF
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-4 py-3 align-top font-mono text-xs text-slate-600">
                        {line.chartOfAccount.code}
                      </td>
                      <td className="px-4 py-3 align-top text-slate-800">{line.narration}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                        {formatMoney(line.lineTotal, { decimals: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
