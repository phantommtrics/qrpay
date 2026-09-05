import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { fetchPublicPayInfo, type PublicPayInfo } from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

const DIRECTPAY_LOGO = '/logos/Direct%20Pay-02.png'
const POLL_MS = 2000
const GIVE_UP_MS = 45_000

function isPaymentSettled(info: PublicPayInfo) {
  return (
    info.paymentStatus === 'completed' ||
    (info.kind === 'order' && info.orderStatus === 'paid') ||
    (info.kind === 'sales_invoice' && info.invoiceStatus === 'paid')
  )
}

function isPaymentFailed(info: PublicPayInfo) {
  return info.paymentStatus === 'failed' || info.paymentStatus === 'cancelled'
}

function publicPayLookupToken(raw: string | undefined): string {
  if (!raw) {
    return ''
  }
  let decoded = raw.trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    /* keep raw trim */
  }
  return decoded.split(/[?#&]/)[0] ?? ''
}

export function PublicPayPage() {
  const { publicToken: rawPublicToken } = useParams<{ publicToken: string }>()
  const publicToken = publicPayLookupToken(rawPublicToken)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<PublicPayInfo | null>(null)
  const [paid, setPaid] = useState(false)
  const giveUpAtRef = useRef(0)

  useEffect(() => {
    giveUpAtRef.current = Date.now() + GIVE_UP_MS
  }, [publicToken])

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!publicToken) {
      setError('Invalid link.')
      setLoading(false)
      return
    }
    if (!options?.silent) {
      setLoading(true)
    }
    try {
      const data = await fetchPublicPayInfo(publicToken)
      setInfo(data)
      setError(null)
      if (isPaymentSettled(data)) {
        setPaid(true)
      }
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not load payment.'
      if (Date.now() < giveUpAtRef.current) {
        return
      }
      setError(message)
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
    }
  }, [publicToken])

  useEffect(() => {
    void load()
  }, [load])

  const failed = Boolean(info && isPaymentFailed(info))
  const gaveUp = Boolean(error && !info)
  const shouldPoll = Boolean(publicToken) && !paid && !failed && !gaveUp && (!info || !isPaymentSettled(info))

  useEffect(() => {
    if (!shouldPoll || loading) {
      return
    }
    const interval = window.setInterval(() => {
      void load({ silent: true })
    }, POLL_MS)
    const remaining = Math.max(0, giveUpAtRef.current - Date.now())
    const timeout = window.setTimeout(() => {
      void load({ silent: true })
    }, remaining + 50)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [shouldPoll, loading, load])

  if (loading && !info) {
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

        {info ? (
          <>
            <p className="text-center text-sm font-medium uppercase tracking-wide text-teal-700">
              {info.businessName}
            </p>

            <div className="my-6 text-center">
              <p className="text-sm text-slate-500">Amount paid</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{formatMoney(info.amount)}</p>
            </div>
          </>
        ) : (
          <div className="my-6 text-center">
            <p className="text-sm text-slate-500">Payment</p>
          </div>
        )}

        {paid && info ? (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" aria-hidden />
            <h1 className="text-xl font-semibold text-slate-900">Thank you</h1>
            <p className="text-sm leading-relaxed text-slate-600">
              Your payment has been received by {info.businessName}. We appreciate your payment.
            </p>
          </div>
        ) : failed && info ? (
          <div className="space-y-2 text-center">
            <h1 className="text-lg font-semibold text-slate-900">Payment not completed</h1>
            <p className="text-sm leading-relaxed text-slate-600">
              This payment could not be confirmed. If money was deducted from your wallet, please contact{' '}
              {info.businessName} for assistance.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-teal-600" aria-hidden />
            <h1 className="text-lg font-semibold text-slate-900">Confirming your payment</h1>
            <p className="text-sm leading-relaxed text-slate-600">
              {info
                ? `Please wait a moment while we confirm your payment with ${info.businessName}.`
                : 'Please wait a moment while we confirm your payment.'}
            </p>
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
