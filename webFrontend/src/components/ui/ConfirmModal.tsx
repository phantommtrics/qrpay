import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

import { CenteredModal } from './CenteredModal'
import { ModalOverlay } from './ModalOverlay'

export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="confirm-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="presentation"
        >
          <ModalOverlay
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => {
              if (!loading) onCancel()
            }}
          />
          <CenteredModal className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div
              className="p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-modal-title"
              aria-describedby={children ? 'confirm-modal-desc' : undefined}
            >
              <h2 id="confirm-modal-title" className="text-lg font-semibold text-slate-900">
                {title}
              </h2>
              {children ? (
                <div id="confirm-modal-desc" className="mt-2 text-sm text-slate-600">
                  {children}
                </div>
              ) : null}
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={onCancel}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={onConfirm}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    variant === 'danger'
                      ? 'bg-red-600 hover:bg-red-500'
                      : 'bg-teal-600 hover:bg-teal-500'
                  }`}
                >
                  {loading ? 'Please wait…' : confirmLabel}
                </button>
              </div>
            </div>
          </CenteredModal>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
