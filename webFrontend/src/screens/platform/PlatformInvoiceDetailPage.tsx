import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { EasypayLogoMark } from '../../components/branding/EasypayLogoMark'
import { InvoiceExportShareMenu } from '../../components/invoices/InvoiceExportShareMenu'
import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  downloadPlatformInvoicePdf,
  fetchPlatformInvoiceDetail,
  fetchPlatformInvoicePdfBlob,
  type PlatformInvoiceDetail,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'
import { invoiceShareMessage, shareLinkAndPdf, whatsappShareHref } from '../../utils/shareGuestInvoice'

function formatLongDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'long',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function PlatformInvoiceDetailPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const { user } = useAuth()
  const [inv, setInv] = useState<PlatformInvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!isPlatformOperator(user) || !invoiceId) {
      return
    }
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      setLoading(true)
      setError(null)
      try {
        const data = await fetchPlatformInvoiceDetail(invoiceId)
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
  }, [user?.isPlatformOwner, user?.isPlatformAdmin, invoiceId])

  if (!isPlatformOperator(user)) {
    return null
  }

  const guestPayUrl = inv?.guestPayUrl?.trim() || null
  const publicCode = inv?.externalReference?.trim() || inv?.id.slice(0, 8) || invoiceId || 'invoice'
  const amountLabel = inv ? `${inv.amount} ${inv.currency}` : ''

  const handleExportPdf = async () => {
    if (!invoiceId) {
      return
    }
    setExportBusy(true)
    setActionError(null)
    try {
      await downloadPlatformInvoicePdf(invoiceId)
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Could not download PDF. Try print instead.')
      window.print()
    } finally {
      setExportBusy(false)
    }
  }

  const handleShareWhatsApp = async () => {
    if (!invoiceId || !inv || !guestPayUrl) {
      return
    }
    const text = invoiceShareMessage({
      businessName: inv.business.name,
      publicCode,
      amountLabel,
      guestPayUrl,
    })
    const href = whatsappShareHref(text)
    setShareBusy(true)
    setActionError(null)
    try {
      const { blob, filename } = await fetchPlatformInvoicePdfBlob(invoiceId)
      const file = new File([blob], filename, { type: 'application/pdf' })
      const result = await shareLinkAndPdf({
        title: `${inv.business.name} invoice ${publicCode}`,
        text,
        url: guestPayUrl,
        file,
      })
      if (result === 'aborted') {
        return
      }
    } catch {
      window.open(href, '_blank', 'noopener,noreferrer')
    } finally {
      setShareBusy(false)
    }
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="print:hidden flex flex-wrap items-center justify-between gap-4">
        <Link
          to={APP_PATHS.platformInvoices}
          className="inline-flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to invoices
        </Link>
        <InvoiceExportShareMenu
          onExportPdf={() => void handleExportPdf()}
          onShareWhatsApp={() => void handleShareWhatsApp()}
          exportBusy={exportBusy}
          shareBusy={shareBusy}
          shareDisabled={!guestPayUrl}
        />
      </div>
      {actionError ? <p className="print:hidden text-xs text-amber-800">{actionError}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading invoice…</p>
      ) : error ? (
        <PageCard className="p-6">
          <p className="text-sm text-red-600">{error}</p>
        </PageCard>
      ) : !inv ? null : (
        <div
          id="platform-invoice-document"
          className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none"
        >
          <header className="flex flex-col gap-6 border-b border-slate-200 pb-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 max-w-full">
              <EasypayLogoMark className="mb-4 h-10 w-auto max-w-[min(100%,280px)] object-contain object-left sm:h-11" />
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Invoice</h1>
              <p className="mt-2 font-mono text-sm text-slate-500">{inv.id}</p>
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
            <p>Thank you for using DirectPay.</p>
            <p className="mt-1">This document was generated from the platform billing system.</p>
          </footer>
        </div>
      )}
    </PageTransition>
  )
}
