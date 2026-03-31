import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { fetchPublicPayInfo, simulatePublicWalletPay } from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

export function PublicPayPage() {
  const { publicToken } = useParams<{ publicToken: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<Awaited<ReturnType<typeof fetchPublicPayInfo>> | null>(null)
  const [paying, setPaying] = useState(false)
  const [paid, setPaid] = useState(false)

  const load = useCallback(async () => {
    if (!publicToken) {
      setError('Invalid link.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPublicPayInfo(publicToken)
      setInfo(data)
      if (data.orderStatus === 'paid' || data.paymentStatus === 'completed') {
        setPaid(true)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load payment.')
    } finally {
      setLoading(false)
    }
  }, [publicToken])

  useEffect(() => {
    void load()
  }, [load])

  const handleSimulatePay = async () => {
    if (!publicToken) return
    setPaying(true)
    setError(null)
    try {
      await simulatePublicWalletPay(publicToken)
      setPaid(true)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Payment failed.')
    } finally {
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <p className="text-slate-600">Loading…</p>
      </div>
    )
  }

  if (error && !info) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-6">
        <p className="text-center text-red-600">{error}</p>
      </div>
    )
  }

  if (!info) {
    return null
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-center text-lg font-semibold text-slate-900">{info.businessName}</h1>
        <p className="mb-6 text-center text-sm text-slate-500">Wallet payment (simulator)</p>
        <div className="mb-6 text-center">
          <p className="text-sm text-slate-500">Amount</p>
          <p className="text-3xl font-bold text-teal-600">{formatMoney(info.amount)}</p>
        </div>
        {paid ? (
          <p className="text-center font-medium text-emerald-600">Payment received. Thank you.</p>
        ) : info.paymentStatus === 'pending' && info.method === 'qr_wallet' ? (
          <div className="space-y-3">
            <p className="text-center text-sm text-slate-600">
              In production, the customer would confirm in their wallet app. For the simulator, tap below
              to complete this payment.
            </p>
            {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
            <button
              type="button"
              onClick={() => void handleSimulatePay()}
              disabled={paying}
              className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {paying ? 'Processing…' : 'Complete payment (simulator)'}
            </button>
          </div>
        ) : (
          <p className="text-center text-sm text-slate-600">This payment is not awaiting wallet confirmation.</p>
        )}
      </div>
    </div>
  )
}
