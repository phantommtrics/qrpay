import { useEffect, useState } from 'react'
import { ArrowLeft, Download } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  ApiError,
  fetchBusinessSubscriptionInvoiceDetail,
  type PlatformInvoiceDetail,
} from '../services/subscriptionApi'

function formatLongDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'long',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function SubscriptionInvoiceDetailPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id
  const [inv, setInv] = useState<PlatformInvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!businessId || !invoiceId) {
      return
    }
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      setLoading(true)
      setError(null)
      try {
        const data = await fetchBusinessSubscriptionInvoiceDetail(businessId, invoiceId)
        if (!cancelled) {
          setInv(data)
        }
      } catch (e) {
        if (!cancelled) {
          setInv(null)
          setError(e instanceof ApiError ? e.message : 'Could not load invoice.')
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
  }, [businessId, invoiceId])

  if (!businessId) {
    return (
      <PageTransition className="space-y-6" withSlide>
        <PageCard className="p-6">
          <p className="text-slate-600">Select a business to view this invoice.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const handleExportPdf = () => {
    window.print()
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="print:hidden flex flex-wrap items-center justify-between gap-4">
        <Link
          to={APP_PATHS.subscriptionsInvoices}
          className="inline-flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to invoices
        </Link>
        <button
          type="button"
          onClick={handleExportPdf}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          Export PDF
        </button>
      </div>
      <p className="print:hidden text-xs text-slate-500">
        Export PDF uses your browser&apos;s print dialog — choose &quot;Save as PDF&quot; as the
        destination.
      </p>

      {loading ? (
        <p className="text-sm text-slate-500">Loading invoice…</p>
      ) : error ? (
        <PageCard className="p-6">
          <p className="text-sm text-red-600">{error}</p>
        </PageCard>
      ) : !inv ? null : (
        <div
          id="business-subscription-invoice-document"
          className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none"
        >
          <header className="flex flex-col gap-6 border-b border-slate-200 pb-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-teal-600">
                EasyPay / EASYPay
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Invoice</h1>
              <p className="mt-1 font-mono text-sm text-slate-500">{inv.id}</p>
            </div>
            <div className="text-right text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Status</p>
              <p className="mt-1 text-lg font-bold text-slate-800">{inv.status}</p>
              <p className="mt-4 font-semibold text-slate-900">Issue date</p>
              <p>{formatLongDate(inv.createdAt)}</p>
              <p className="mt-2 font-semibold text-slate-900">Due date</p>
              <p>{formatLongDate(inv.dueDate)}</p>
            </div>
          </header>

          <div className="grid gap-8 py-8 sm:grid-cols-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Bill to
              </h2>
              <p className="mt-2 text-lg font-semibold text-slate-900">{inv.business.name}</p>
              <p className="text-sm text-slate-600">{inv.business.ownerName}</p>
              <p className="text-sm text-slate-600">{inv.business.ownerEmail}</p>
              {inv.business.industry ? (
                <p className="mt-2 text-xs text-slate-500">Industry: {inv.business.industry}</p>
              ) : null}
              <p className="mt-1 font-mono text-xs text-slate-400">Ref: {inv.business.slug}</p>
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Subscription
              </h2>
              <p className="mt-2 font-medium text-slate-800">{inv.plan.name}</p>
              <p className="text-sm text-slate-600">{inv.plan.description}</p>
              <p className="mt-3 text-xs text-slate-500">
                Subscription status:{' '}
                <span className="font-medium text-slate-700">
                  {inv.subscription.status.replace(/_/g, ' ')}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Service period: {formatLongDate(inv.billingPeriodStart)} —{' '}
                {formatLongDate(inv.billingPeriodEnd)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/80">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-4 text-slate-800">
                    <p className="font-medium">
                      {inv.plan.name} — subscription billing ({inv.plan.code})
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Billing window {formatLongDate(inv.billingPeriodStart)} to{' '}
                      {formatLongDate(inv.billingPeriodEnd)}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-right text-base font-semibold text-slate-900">
                    {inv.amount} {inv.currency}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col items-end gap-2 border-t border-slate-200 pt-6">
            <div className="flex w-full max-w-xs justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span>
                {inv.amount} {inv.currency}
              </span>
            </div>
            <div className="flex w-full max-w-xs justify-between text-lg font-bold text-slate-900">
              <span>Total due</span>
              <span>
                {inv.amount} {inv.currency}
              </span>
            </div>
            {inv.paidAt ? (
              <p className="max-w-xs text-right text-sm text-emerald-700">
                Paid on {formatLongDate(inv.paidAt)}
              </p>
            ) : null}
            {inv.externalReference ? (
              <p className="max-w-xs text-right font-mono text-xs text-slate-400">
                External ref: {inv.externalReference}
              </p>
            ) : null}
          </div>

          <footer className="mt-12 border-t border-slate-100 pt-6 text-center text-xs text-slate-400">
            <p>Thank you for using EasyPay.</p>
            <p className="mt-1">This document was generated from the platform billing system.</p>
          </footer>
        </div>
      )}
    </PageTransition>
  )
}
