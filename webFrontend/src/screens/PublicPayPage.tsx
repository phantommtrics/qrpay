import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { fetchPublicPayInfo } from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

const DIRECTPAY_LOGO = '/logos/Direct%20Pay-02.png'
const POLL_MS = 3000

function isPaymentSettled(info: Awaited<ReturnType<typeof fetchPublicPayInfo>>) {
  return (
    info.paymentStatus === 'completed' ||
    (info.kind === 'order' && info.orderStatus === 'paid') ||
    (info.kind === 'sales_invoice' && info.invoiceStatus === 'paid')
  )
}

export function PublicPayPage() {
  const { publicToken } = useParams<{ publicToken: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<Awaited<ReturnType<typeof fetchPublicPayInfo>> | null>(null)
  const [paid, setPaid] = useState(false)

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!publicToken) {
      setError('Invalid link.')
      setLoading(false)
      return
    }
    if (!options?.silent) {
      setLoading(true)
    }
    setError(null)
    try {
      const data = await fetchPublicPayInfo(publicToken)
      setInfo(data)
      if (isPaymentSettled(data)) {
        setPaid(true)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load payment.')
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
    }
  }, [publicToken])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!publicToken || paid || !info || isPaymentSettled(info)) {
      return
    }
    const interval = window.setInterval(() => {
      void load({ silent: true })
    }, POLL_MS)
    return () => window.clearInterval(interval)
  }, [publicToken, paid, info, load])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" aria-label="Loading" />
      </div>
    )
  }

  if (error && !info) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6">
        <img
          src={DIRECTPAY_LOGO}
          alt="DirectPay"
          className="h-auto max-h-24 w-full max-w-[14rem] object-contain"
          width={220}
          height={110}
        />
        <p className="max-w-sm text-center text-red-600">{error}</p>
      </div>
    )
  }

  if (!info) {
    return null
  }

  const failed = info.paymentStatus === 'failed' || info.paymentStatus === 'cancelled'
  const confirming = !paid && !failed

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src={DIRECTPAY_LOGO}
            alt="DirectPay"
            className="h-auto max-h-24 w-full max-w-[14rem] object-contain"
            width={220}
            height={110}
          />
        </div>

        <p className="text-center text-sm font-medium uppercase tracking-wide text-teal-700">
          {info.businessName}
        </p>

        <div className="my-6 text-center">
          <p className="text-sm text-slate-500">Amount paid</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{formatMoney(info.amount)}</p>
        </div>

        {paid ? (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" aria-hidden />
            <h1 className="text-xl font-semibold text-slate-900">Thank you</h1>
            <p className="text-sm leading-relaxed text-slate-600">
              Your payment has been received by {info.businessName}. We appreciate your business.
            </p>
          </div>
        ) : failed ? (
          <div className="space-y-2 text-center">
            <h1 className="text-lg font-semibold text-slate-900">Payment not completed</h1>
            <p className="text-sm leading-relaxed text-slate-600">
              This payment could not be confirmed. If money was deducted from your wallet, please contact{' '}
              {info.businessName} for assistance.
            </p>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-teal-600" aria-hidden />
            <h1 className="text-lg font-semibold text-slate-900">Confirming your payment</h1>
            <p className="text-sm leading-relaxed text-slate-600">
              Please wait a moment while we confirm your payment with {info.businessName}.
            </p>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        )}

        {confirming ? (
          <p className="mt-6 text-center text-xs text-slate-400">
            You can close this page once confirmation appears.
          </p>
        ) : null}
      </div>
    </div>
  )
}
