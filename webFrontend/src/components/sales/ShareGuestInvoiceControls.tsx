import { useRef, useState } from 'react'
import { Check, Copy, Loader2, Share2 } from 'lucide-react'

import { fetchSalesInvoicePdfBlob } from '../../services/salesDocumentsApi'
import { formatMoney } from '../../utils/formatMoney'
import {
  invoiceShareMessage,
  shareLinkAndPdf,
  whatsappShareHref,
} from '../../utils/shareGuestInvoice'

export function ShareGuestInvoiceControls({
  businessId,
  invoiceId,
  publicCode,
  businessName,
  currency,
  total,
  guestPayUrl,
  contactPhone,
  compact,
}: {
  businessId: string
  invoiceId: string
  publicCode: string
  businessName: string
  currency: string
  total: number
  guestPayUrl: string
  contactPhone?: string | null
  compact?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copyTimer = useRef<number>(0)

  const amountLabel = `${formatMoney(total, { decimals: 2 })} ${currency}`
  const text = invoiceShareMessage({
    businessName,
    publicCode,
    amountLabel,
    guestPayUrl,
  })
  const whatsappHref = whatsappShareHref(text, contactPhone)

  const btnClass = compact
    ? 'inline-flex items-center gap-1 rounded-sm border border-qb-border bg-white px-2.5 py-1 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50'
    : 'inline-flex items-center gap-2 rounded-sm border border-qb-border bg-white px-4 py-2 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50'

  const copyLink = async () => {
    setError(null)
    try {
      await navigator.clipboard.writeText(guestPayUrl)
      setCopied(true)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy the pay link.')
    }
  }

  const shareApps = async () => {
    setBusy(true)
    setError(null)
    try {
      const { blob, filename } = await fetchSalesInvoicePdfBlob(businessId, invoiceId)
      const file = new File([blob], filename, { type: 'application/pdf' })
      const result = await shareLinkAndPdf({
        title: `${businessName} invoice ${publicCode}`,
        text,
        url: guestPayUrl,
        file,
      })
      if (result === 'aborted') {
        return
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return
      }
      window.open(whatsappHref, '_blank', 'noopener,noreferrer')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void shareApps()} className={btnClass}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
          Share link &amp; PDF
        </button>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className={btnClass}
        >
          WhatsApp
        </a>
        <button type="button" onClick={() => void copyLink()} className={btnClass}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy pay link'}
        </button>
      </div>
      {error ? <p className="text-xs text-amber-800">{error}</p> : null}
    </div>
  )
}
