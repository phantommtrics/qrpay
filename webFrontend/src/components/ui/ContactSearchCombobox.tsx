import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Loader2, Plus, UserPlus } from 'lucide-react'
import { createPortal } from 'react-dom'

import { createBusinessContact, fetchBusinessContacts, type BusinessContactRow } from '../../services/journalApi'
import { ApiError } from '../../services/subscriptionApi'
import { CenteredModal } from './CenteredModal'
import { ModalOverlay } from './ModalOverlay'

const fieldClass =
  'w-full rounded-sm border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading placeholder:text-qb-muted/60 focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

type Props = {
  businessId: string
  /** Current contact id when a row is selected */
  selectedId: string
  /** Text shown in the input (search or selected name) */
  inputValue: string
  onInputChange: (value: string) => void
  /** Row pick or successful create — parent should set id and display name. */
  onSelectContact: (id: string, name: string) => void
  disabled?: boolean
  label?: string
  className?: string
  /** Max height of the options list (Tailwind class), e.g. max-h-[7.5rem] */
  listMaxHeightClass?: string
}

export function ContactSearchCombobox({
  businessId,
  selectedId,
  inputValue,
  onInputChange,
  onSelectContact,
  disabled = false,
  label,
  className = '',
  listMaxHeightClass = 'max-h-[7.5rem]',
}: Props) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<BusinessContactRow[]>([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [modalName, setModalName] = useState('')
  const [modalEmail, setModalEmail] = useState('')
  const [modalPhone, setModalPhone] = useState('')
  const [creating, setCreating] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const blurCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [panelBox, setPanelBox] = useState({ top: 0, left: 0, width: 0 })

  const placePanel = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPanelBox({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [])

  useEffect(() => {
    if (!open) return
    placePanel()
    const onReposition = () => placePanel()
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [open, placePanel])

  useEffect(() => {
    if (!open || !businessId) return
    const q = inputValue.trim()
    setLoading(true)
    const t = window.setTimeout(() => {
      void fetchBusinessContacts(businessId, q || undefined)
        .then(setOptions)
        .catch(() => setOptions([]))
        .finally(() => setLoading(false))
    }, 200)
    return () => window.clearTimeout(t)
  }, [businessId, open, inputValue])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const cancelBlurClose = () => {
    if (blurCloseTimer.current) {
      clearTimeout(blurCloseTimer.current)
      blurCloseTimer.current = null
    }
  }

  const scheduleClose = () => {
    cancelBlurClose()
    blurCloseTimer.current = setTimeout(() => setOpen(false), 120)
  }

  const openAddModal = () => {
    setModalError(null)
    setModalName(inputValue.trim())
    setModalEmail('')
    setModalPhone('')
    setAddOpen(true)
    setOpen(false)
  }

  const closeAddModal = () => {
    if (creating) return
    setAddOpen(false)
    setModalError(null)
  }

  const submitAdd = async (e: FormEvent) => {
    e.preventDefault()
    const name = modalName.trim()
    if (!name) {
      setModalError('Name is required.')
      return
    }
    setCreating(true)
    setModalError(null)
    try {
      const row = await createBusinessContact(businessId, {
        name,
        email: modalEmail.trim() || null,
        phone: modalPhone.trim() || null,
      })
      onSelectContact(row.id, row.name)
      setAddOpen(false)
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Could not create contact.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      {label ? (
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-qb-muted">
          {label}
        </span>
      ) : null}
      <div className="relative flex min-w-0">
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          disabled={disabled}
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={() => {
            cancelBlurClose()
            setOpen(true)
          }}
          onBlur={() => scheduleClose()}
          placeholder="Search contacts…"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className={`${fieldClass} min-w-0 flex-1 pr-9`}
        />
        <button
          type="button"
          disabled={disabled}
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            cancelBlurClose()
            setOpen((o) => !o)
            inputRef.current?.focus()
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-qb-muted hover:bg-qb-surface hover:text-qb-heading disabled:opacity-50"
          aria-label="Toggle contact list"
        >
          <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && !disabled
        ? createPortal(
            <div
              ref={panelRef}
              role="listbox"
              className="fixed z-[300] flex flex-col overflow-hidden rounded-md border border-qb-border bg-white shadow-lg ring-1 ring-black/5"
              style={{
                top: panelBox.top,
                left: panelBox.left,
                width: Math.max(panelBox.width, 220),
              }}
              onMouseDown={cancelBlurClose}
            >
              <div className={`overflow-y-auto py-1 ${listMaxHeightClass}`}>
                {loading ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-sm text-qb-muted">
                    <Loader2 className="h-4 w-4 animate-spin text-qb-muted" />
                    Loading…
                  </div>
                ) : options.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-qb-muted">No contacts match.</div>
                ) : (
                  options.map((c) => {
                    const active = c.id === selectedId
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onSelectContact(c.id, c.name)
                          setOpen(false)
                          cancelBlurClose()
                        }}
                        className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition ${
                          active
                            ? 'bg-qb-primary-soft font-semibold text-qb-heading'
                            : 'text-qb-heading hover:bg-qb-surface'
                        }`}
                      >
                        <span className="w-full truncate">{c.name}</span>
                        {c.email ? (
                          <span className="w-full truncate text-xs font-normal text-qb-muted">
                            {c.email}
                          </span>
                        ) : null}
                      </button>
                    )
                  })
                )}
              </div>
              <div className="shrink-0 border-t border-qb-border bg-qb-surface/60 p-1">
                <button
                  type="button"
                  role="option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => openAddModal()}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm font-semibold text-qb-heading hover:bg-white"
                >
                  <UserPlus className="h-4 w-4 shrink-0" />
                  Add contact
                  {inputValue.trim() ? (
                    <span className="truncate font-normal text-qb-muted">
                      (“{inputValue.trim()}”)
                    </span>
                  ) : null}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      <AnimatePresence>
        {addOpen ? (
          <motion.div
            key="add-contact"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[340] flex items-center justify-center p-4"
            role="presentation"
          >
            <ModalOverlay
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => closeAddModal()}
            />
            <CenteredModal className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-qb-border bg-white shadow-2xl">
              <form noValidate onSubmit={(e) => void submitAdd(e)} className="p-6">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-qb-primary-soft">
                      <Plus className="h-5 w-5 text-qb-heading" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-qb-heading">New contact</h2>
                      <p className="text-sm text-qb-muted">Create and select this contact.</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      Name *
                    </span>
                    <input
                      value={modalName}
                      onChange={(e) => setModalName(e.target.value)}
                      className={fieldClass}
                      required
                      autoFocus
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      Email
                    </span>
                    <input
                      type="email"
                      value={modalEmail}
                      onChange={(e) => setModalEmail(e.target.value)}
                      className={fieldClass}
                      placeholder="Optional"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      Phone
                    </span>
                    <input
                      value={modalPhone}
                      onChange={(e) => setModalPhone(e.target.value)}
                      className={fieldClass}
                      placeholder="Optional"
                    />
                  </label>
                </div>
                {modalError ? (
                  <p className="mt-3 text-sm font-medium text-red-700">{modalError}</p>
                ) : null}
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() => closeAddModal()}
                    className="rounded-sm border border-qb-border bg-white px-4 py-2 text-sm font-semibold text-qb-heading hover:bg-qb-surface disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="rounded-sm border border-qb-border bg-white px-4 py-2 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                  >
                    {creating ? 'Saving…' : 'Create contact'}
                  </button>
                </div>
              </form>
            </CenteredModal>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
