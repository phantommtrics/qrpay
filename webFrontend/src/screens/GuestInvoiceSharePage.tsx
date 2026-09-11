import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { EasypayLogoMark } from '../components/branding/EasypayLogoMark'
import { recurrenceSummary } from '../components/sales/InvoiceRecurrenceFields'
import { guestInvoiceFromSharePath } from '../config/navigation'
import { fetchGuestInvoiceShareBundle, type GuestInvoiceSharePayload } from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

function formatShortDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function GuestInvoiceSharePage() {
  const { shareToken } = useParams<{ shareToken: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<GuestInvoiceSharePayload | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!shareToken) {
      setError('Invalid link.')
      setLoading(false)
      return
    }
    if (!silent) {
      setLoading(true)
    }
    try {
      const data = await fetchGuestInvoiceShareBundle(shareToken)
      setPayload(data)
      setError(null)
    } catch (e) {
      if (!silent) {
        setPayload(null)
        setError(e instanceof ApiError ? e.message : 'Could not load invoices.')
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [shareToken])

  useEffect(() => {
    void load(false)
  }, [load])

  useEffect(() => {
    if (!shareToken) {
      return
    }
    const tick = () => {
      if (document.visibilityState === 'hidden') {
        return
      }
      void load(true)
    }
    const id = window.setInterval(tick, 4000)
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void load(true)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [shareToken, load])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error && !payload) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-6">
        <p className="text-center text-red-600">{error}</p>
      </div>
    )
  }

  if (!payload || !shareToken) {
    return null
  }

  const paidCount = payload.invoices.filter((row) => row.status.toUpperCase() === 'PAID').length

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto flex max-w-lg flex-col gap-5">
        <article className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 px-5 pb-6 pt-5 text-white">
            <EasypayLogoMark className="h-8 w-auto max-w-[160px] object-contain brightness-0 invert" />
            <p className="mt-5 text-sm font-medium text-teal-100/90">{payload.businessName}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Invoices</h1>
            <p className="mt-2 text-sm text-slate-300">
              {paidCount} of {payload.invoices.length} paid
            </p>
            {payload.recurrence ? (
              <p className="mt-2 text-sm text-teal-100/90">
                {recurrenceSummary(payload.recurrence)}
                {payload.recurrence.nextIssueAt
                  ? ` · next ${formatShortDate(payload.recurrence.nextIssueAt)}`
                  : ''}
              </p>
            ) : null}
          </div>

          <ul className="divide-y divide-slate-100">
            {payload.invoices.map((row) => {
              const isPaid = row.status.toUpperCase() === 'PAID'
              const isVoid = row.status.toUpperCase() === 'VOID'
              const amountLabel = `${formatMoney(row.amount, { decimals: 2 })} ${row.currency}`
              const invoiceHref =
                row.guestToken && !isVoid
                  ? guestInvoiceFromSharePath(row.guestToken, shareToken)
                  : null
              return (
                <li key={row.id} className="flex items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{row.contactName}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">{row.publicCode}</p>
                    {row.issueDate ? (
                      <p className="mt-0.5 text-xs text-slate-500">{formatShortDate(row.issueDate)}</p>
                    ) : null}
                    <p className="mt-1 text-sm font-medium tabular-nums text-slate-800">{amountLabel}</p>
                    {isPaid && row.paidAt ? (
                      <p className="mt-1 text-xs text-emerald-700">Paid {formatShortDate(row.paidAt)}</p>
                    ) : null}
                  </div>
                  {isPaid ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800">
                      Paid
                    </span>
                  ) : isVoid ? (
                    <span className="shrink-0 rounded-full bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-800">
                      Void
                    </span>
                  ) : invoiceHref ? (
                    <Link
                      to={invoiceHref}
                      className="shrink-0 rounded-2xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-500"
                    >
                      {row.canPay ? 'Pay' : 'View invoice'}
                    </Link>
                  ) : (
                    <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600">
                      Unavailable
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </article>
        <p className="text-center text-xs text-slate-500">
          {payload.recurrence
            ? 'This link stays the same as new invoices are issued. Anyone with it can see each contact and whether they have paid.'
            : 'Anyone with this link can see each contact and whether they have paid.'}
        </p>
      </div>
    </div>
  )
}
