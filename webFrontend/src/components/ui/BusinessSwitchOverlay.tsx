import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Building2, Loader2 } from 'lucide-react'

export type BusinessSwitchFeedback = {
  fromName: string
  toName: string
}

/**
 * Full-screen feedback while the merchant switches businesses.
 * Mounted via portal so it covers sidebar + header.
 */
export function BusinessSwitchOverlay({
  feedback,
}: {
  feedback: BusinessSwitchFeedback | null
}) {
  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <AnimatePresence>
      {feedback ? (
        <motion.div
          key={`${feedback.fromName}->${feedback.toName}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Switching business</p>
                <p className="text-xs text-slate-500">Loading workspace data…</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200 text-slate-600">
                  <Building2 className="h-4 w-4" aria-hidden />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  From
                </p>
                <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-800">
                  {feedback.fromName}
                </p>
              </div>

              <ArrowRight className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />

              <div className="rounded-2xl border border-teal-200 bg-teal-50 px-3 py-3">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-teal-600 text-white">
                  <Building2 className="h-4 w-4" aria-hidden />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                  To
                </p>
                <p className="mt-1 line-clamp-2 text-sm font-semibold text-teal-950">
                  {feedback.toName}
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
