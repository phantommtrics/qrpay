import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Download, Loader2 } from 'lucide-react'

export function InvoiceExportShareMenu({
  onExportPdf,
  onShareWhatsApp,
  exportBusy,
  shareBusy,
  shareDisabled,
}: {
  onExportPdf: () => void
  onShareWhatsApp: () => void
  exportBusy?: boolean
  shareBusy?: boolean
  shareDisabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const busy = Boolean(exportBusy || shareBusy)

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Export PDF
        <ChevronDown className={`h-4 w-4 opacity-80 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
        >
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setOpen(false)
              onExportPdf()
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4 text-slate-500" />
            Export PDF
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy || shareDisabled}
            onClick={() => {
              setOpen(false)
              onShareWhatsApp()
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <WhatsAppGlyph className="h-4 w-4 text-emerald-600" />
            Share on WhatsApp
          </button>
        </div>
      ) : null}
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
