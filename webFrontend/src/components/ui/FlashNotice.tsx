import { useEffect } from 'react'
import { CheckCircle2, X } from 'lucide-react'

/**
 * Centered success toast — high z-index, strong shadow so it reads clearly over any page.
 */
export function FlashNotice({
  message,
  onDismiss,
}: {
  message: string | null
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!message) {
      return
    }
    const t = window.setTimeout(onDismiss, 4500)
    return () => window.clearTimeout(t)
  }, [message, onDismiss])

  if (!message) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-6 pointer-events-none"
      aria-live="polite"
    >
      <div
        role="status"
        className="pointer-events-auto flex max-w-[min(92vw,22rem)] items-center gap-4 rounded-2xl border border-teal-200/80 bg-white px-5 py-4 shadow-2xl shadow-slate-900/15 ring-2 ring-teal-500/20"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-100">
          <CheckCircle2 className="h-6 w-6 text-teal-600" aria-hidden strokeWidth={2.25} />
        </div>
        <p className="min-w-0 flex-1 text-base font-semibold leading-snug text-slate-800">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Dismiss"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
