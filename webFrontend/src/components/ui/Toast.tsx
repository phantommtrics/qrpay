import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

export type ToastVariant = 'success' | 'error'

/**
 * Corner toast on `document.body` — avoids `position:fixed` inside transformed parents (e.g. framer-motion).
 */
export function Toast({
  message,
  variant = 'success',
  onDismiss,
}: {
  message: string | null
  variant?: ToastVariant
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(onDismiss, variant === 'error' ? 8000 : 5000)
    return () => window.clearTimeout(t)
  }, [message, variant, onDismiss])

  if (!message?.trim() || typeof document === 'undefined') return null

  const isError = variant === 'error'

  const node = (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex max-w-[min(calc(100vw-2rem),22rem)]"
      role="alert"
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <div
        className={`pointer-events-auto flex w-full items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ring-1 ${
          isError
            ? 'border-red-200 bg-white text-red-900 ring-red-900/10'
            : 'border-qb-border bg-white text-qb-heading ring-slate-900/5'
        }`}
      >
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            isError ? 'bg-red-100' : 'bg-qb-primary-soft'
          }`}
        >
          {isError ? (
            <AlertCircle className="h-5 w-5 text-red-600" aria-hidden strokeWidth={2.25} />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-qb-muted" aria-hidden strokeWidth={2.25} />
          )}
        </div>
        <p className="min-w-0 flex-1 pt-0.5 text-sm font-semibold leading-snug">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className={`shrink-0 rounded p-1 transition-colors ${
            isError
              ? 'text-red-600 hover:bg-red-50 hover:text-red-800'
              : 'text-qb-muted hover:bg-qb-surface hover:text-qb-heading'
          }`}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
