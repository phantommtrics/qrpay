import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Loader2, Share2 } from 'lucide-react'

import {
  emptyInvoiceRecurrenceDraft,
  InvoiceRecurrenceFields,
  invoiceRecurrencePayload,
  type InvoiceRecurrenceDraft,
} from './InvoiceRecurrenceFields'
import { createSalesInvoiceShareBundle } from '../../services/salesDocumentsApi'
import { ApiError } from '../../services/subscriptionApi'
import { invoiceShareBundleMessage, whatsappShareHref } from '../../utils/shareGuestInvoice'

export function SalesInvoiceBulkShareBar({
  businessId,
  businessName,
  selectedIds,
  shareableCount,
  onClear,
}: {
  businessId: string
  businessName: string
  selectedIds: string[]
  shareableCount: number
  onClear: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [recurrence, setRecurrence] = useState<InvoiceRecurrenceDraft>(emptyInvoiceRecurrenceDraft)
  const copyTimer = useRef<number>(0)

  useEffect(() => {
    setPublicUrl(null)
    setError(null)
    setCopied(false)
    setRecurrence(emptyInvoiceRecurrenceDraft())
  }, [selectedIds.join('|')])

  const count = selectedIds.length
  const text = publicUrl
    ? invoiceShareBundleMessage({
        businessName,
        invoiceCount: count,
        publicUrl,
      })
    : ''
  const whatsappHref = publicUrl ? whatsappShareHref(text) : null

  const createLink = async () => {
    const repeat = invoiceRecurrencePayload(recurrence)
    if (recurrence.frequency && !repeat) {
      setError(
        recurrence.frequency === 'CUSTOM'
          ? 'Add custom dates or a day interval for repeating invoices.'
          : 'Choose a valid repeat schedule.',
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      const out = await createSalesInvoiceShareBundle(businessId, selectedIds, repeat)
      setPublicUrl(out.publicUrl)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create share link.')
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async () => {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy the link.')
    }
  }

  const nativeShare = async () => {
    if (!publicUrl) return
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
    if (typeof nav.share !== 'function') {
      window.open(whatsappHref ?? publicUrl, '_blank', 'noopener,noreferrer')
      return
    }
    try {
      await nav.share({ title: `${businessName} invoices`, text, url: publicUrl })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return
      }
      window.open(whatsappHref ?? publicUrl, '_blank', 'noopener,noreferrer')
    }
  }

  if (count < 1) {
    return null
  }

  return (
    <div className="space-y-3 rounded-sm border border-qb-border bg-qb-surface/50 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-qb-heading">
          {count} selected
          {shareableCount < count ? (
            <span className="ml-2 text-xs font-normal text-amber-800">
              Only approved or paid invoices can be shared ({shareableCount} ready).
            </span>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onClear}
            className="rounded-sm border border-transparent px-3 py-1.5 text-xs font-semibold text-qb-muted hover:text-qb-heading"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={busy || shareableCount !== count || count < 1}
            onClick={() => void createLink()}
            className="inline-flex items-center gap-1.5 rounded-sm border border-qb-border bg-white px-3 py-1.5 text-xs font-semibold text-qb-heading shadow-sm hover:bg-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
            Bulk share
          </button>
        </div>
      </div>
      {error ? <p className="text-xs text-amber-800">{error}</p> : null}
      <InvoiceRecurrenceFields value={recurrence} onChange={setRecurrence} compact />
      {publicUrl ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-qb-muted" title={publicUrl}>
            {publicUrl}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex items-center gap-1 rounded-sm border border-qb-border bg-white px-2.5 py-1 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-sm border border-qb-border bg-white px-2.5 py-1 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface"
              >
                WhatsApp
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void nativeShare()}
              className="inline-flex items-center rounded-sm border border-qb-border bg-white px-2.5 py-1 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface"
            >
              Share
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-sm border border-qb-border bg-white px-2.5 py-1 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface"
            >
              Open
            </a>
          </div>
        </div>
      ) : null}
    </div>
  )
}
