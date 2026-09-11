import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  Ban,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MoreVertical,
  Pencil,
  Share2,
} from 'lucide-react'

import { salesInvoiceDetailPath } from '../../config/navigation'
import { fetchSalesInvoicePdfBlob, type SalesInvoiceRow } from '../../services/salesDocumentsApi'
import { formatMoney } from '../../utils/formatMoney'
import {
  invoiceShareMessage,
  shareLinkAndPdf,
  whatsappShareHref,
} from '../../utils/shareGuestInvoice'

const MENU_ITEM =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-qb-heading hover:bg-qb-surface disabled:opacity-50'

function linesTotal(lines: SalesInvoiceRow['lines']): number {
  return lines.reduce((s, l) => s + l.quantity * l.unitAmount + l.taxAmount, 0)
}

export function SalesInvoiceRowActionsMenu({
  invoice,
  businessId,
  businessName,
  busy,
  canEditDraft,
  canApprove,
  canPay,
  canVoid,
  hasEmail,
  onEdit,
  onApprove,
  onMarkPaid,
  onVoid,
  onCopied,
}: {
  invoice: SalesInvoiceRow
  businessId: string
  businessName: string
  busy: boolean
  canEditDraft: boolean
  canApprove: boolean
  canPay: boolean
  canVoid: boolean
  hasEmail: boolean
  onEdit: () => void
  onApprove: () => void
  onMarkPaid: () => void
  onVoid: () => void
  onCopied?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const copyTimer = useRef<number>(0)

  const guestPayUrl = invoice.guestPayUrl?.trim() || null
  const amountLabel = `${formatMoney(linesTotal(invoice.lines), { decimals: 2 })} ${invoice.currency}`
  const shareText = guestPayUrl
    ? invoiceShareMessage({
        businessName,
        publicCode: invoice.publicCode,
        amountLabel,
        guestPayUrl,
      })
    : ''
  const whatsappHref = guestPayUrl ? whatsappShareHref(shareText, invoice.contact.phone) : null

  const close = () => setOpen(false)

  const placeMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const right = Math.max(8, window.innerWidth - rect.right)
    const spaceBelow = window.innerHeight - rect.bottom
    if (spaceBelow < 280) {
      setCoords({ bottom: window.innerHeight - rect.top + 6, right })
    } else {
      setCoords({ top: rect.bottom + 6, right })
    }
  }

  useEffect(() => {
    if (!open) return
    placeMenu()
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onReposition = () => close()
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open])

  useEffect(() => {
    return () => window.clearTimeout(copyTimer.current)
  }, [])

  const copyPayLink = async () => {
    if (!guestPayUrl) return
    try {
      await navigator.clipboard.writeText(guestPayUrl)
      setCopied(true)
      onCopied?.()
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const shareLinkPdf = async () => {
    if (!guestPayUrl) return
    setShareBusy(true)
    try {
      const { blob, filename } = await fetchSalesInvoicePdfBlob(businessId, invoice.id)
      const file = new File([blob], filename, { type: 'application/pdf' })
      const result = await shareLinkAndPdf({
        title: `${businessName} invoice ${invoice.publicCode}`,
        text: shareText,
        url: guestPayUrl,
        file,
      })
      if (result !== 'aborted') close()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return
      }
      if (whatsappHref) {
        window.open(whatsappHref, '_blank', 'noopener,noreferrer')
      }
      close()
    } finally {
      setShareBusy(false)
    }
  }

  return (
    <div className="relative flex justify-end">
      <button
        ref={buttonRef}
        type="button"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for invoice ${invoice.publicCode}`}
        onClick={() => {
          if (open) {
            close()
            return
          }
          placeMenu()
          setOpen(true)
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-qb-border bg-white text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ top: coords.top, bottom: coords.bottom, right: coords.right }}
              className="fixed z-50 w-56 overflow-hidden rounded-md border border-qb-border bg-white py-1 shadow-lg ring-1 ring-black/5"
            >
              <Link
                role="menuitem"
                to={salesInvoiceDetailPath(invoice.id)}
                onClick={close}
                className={MENU_ITEM}
              >
                <ExternalLink className="h-4 w-4 text-qb-muted" />
                View
              </Link>
              {canEditDraft ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    close()
                    onEdit()
                  }}
                  className={MENU_ITEM}
                >
                  <Pencil className="h-4 w-4 text-qb-muted" />
                  Edit
                </button>
              ) : null}
              {canApprove ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  title={
                    hasEmail
                      ? 'Approve and email the guest pay link and PDF.'
                      : 'Approve and generate a guest pay link you can share.'
                  }
                  onClick={() => {
                    close()
                    onApprove()
                  }}
                  className={MENU_ITEM}
                >
                  Approve
                </button>
              ) : null}
              {guestPayUrl ? (
                <>
                  <div className="my-1 border-t border-qb-border" />
                  <button
                    type="button"
                    role="menuitem"
                    disabled={shareBusy}
                    onClick={() => void shareLinkPdf()}
                    className={MENU_ITEM}
                  >
                    {shareBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin text-qb-muted" />
                    ) : (
                      <Share2 className="h-4 w-4 text-qb-muted" />
                    )}
                    Share link &amp; PDF
                  </button>
                  {whatsappHref ? (
                    <a
                      role="menuitem"
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={close}
                      className={MENU_ITEM}
                    >
                      <WhatsAppGlyph className="h-4 w-4 text-emerald-600" />
                      Share on WhatsApp
                    </a>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void copyPayLink()}
                    className={MENU_ITEM}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4 text-qb-muted" />
                    )}
                    {copied ? 'Copied' : 'Copy pay link'}
                  </button>
                </>
              ) : null}
              {canPay ? (
                <>
                  <div className="my-1 border-t border-qb-border" />
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={() => {
                      close()
                      onMarkPaid()
                    }}
                    className={MENU_ITEM}
                  >
                    Mark paid
                  </button>
                </>
              ) : null}
              {canVoid ? (
                <>
                  <div className="my-1 border-t border-qb-border" />
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={() => {
                      close()
                      onVoid()
                    }}
                    className={`${MENU_ITEM} text-red-700 hover:bg-red-50`}
                  >
                    <Ban className="h-4 w-4" />
                    Void
                  </button>
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M20.5 3.5A11 11 0 0 0 2.2 17.4L1 23l5.8-1.5A11 11 0 0 0 20.5 3.5Zm-8.5 17a9.1 9.1 0 0 1-4.6-1.3l-.3-.2-3.4.9.9-3.3-.2-.3A9.1 9.1 0 1 1 12 20.5Zm5-6.8c-.3-.1-1.6-.8-1.9-.9s-.4-.1-.6.1-.7.9-.8 1-.3.2-.6.1a7.4 7.4 0 0 1-2.2-1.3 8.2 8.2 0 0 1-1.5-1.9c-.2-.3 0-.4.1-.6l.4-.5.3-.4c.1-.2 0-.3 0-.5l-.9-2.1c-.2-.6-.5-.5-.6-.5h-.5c-.2 0-.5.1-.7.3s-1 1-1 2.4 1 2.8 1.2 3 .9 1.7 3.4 3a14 14 0 0 0 1.4.5 3.3 3.3 0 0 0 1.5.1c.5-.1 1.6-.6 1.8-1.3s.2-1.1.2-1.2 0-.2-.2-.3Z" />
    </svg>
  )
}
