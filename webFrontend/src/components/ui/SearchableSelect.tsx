import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'

export type SearchableSelectOption = {
  value: string
  label: string
  disabled?: boolean
  /** Extra line in the list (searchable). */
  hint?: string
}

export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  emptyMessage = 'No options',
  noResultsMessage = 'No matches',
  /** Screen reader label for the trigger */
  ariaLabel,
  className = '',
  buttonClassName = '',
  listMaxHeightClass = 'max-h-60',
  /** Extra classes on the floating dropdown panel (e.g. QB borders). */
  dropdownClassName = '',
  /** Also match `option.value` (e.g. enum codes) when filtering. */
  matchOptionValue = false,
  /** Show only this many options at first; scrolling the list reveals more (reduces DOM for long lists). */
  listWindowInitial,
  listWindowStep,
}: {
  id?: string
  value: string
  onChange: (nextValue: string) => void
  options: SearchableSelectOption[]
  placeholder?: string
  disabled?: boolean
  emptyMessage?: string
  noResultsMessage?: string
  ariaLabel?: string
  className?: string
  buttonClassName?: string
  listMaxHeightClass?: string
  dropdownClassName?: string
  matchOptionValue?: boolean
  listWindowInitial?: number
  listWindowStep?: number
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const windowed =
    listWindowInitial != null && Number.isFinite(listWindowInitial) && listWindowInitial > 0
  const step = listWindowStep ?? listWindowInitial ?? 4
  const [listVisible, setListVisible] = useState(() =>
    windowed ? (listWindowInitial as number) : Number.POSITIVE_INFINITY,
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listUlRef = useRef<HTMLUListElement>(null)
  const loadMoreSentinelRef = useRef<HTMLLIElement | null>(null)
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

  useEffect(() => {
    if (!open) {
      setQuery('')
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      if (o.label.toLowerCase().includes(q)) return true
      if (o.hint?.toLowerCase().includes(q)) return true
      if (matchOptionValue && o.value.toLowerCase().includes(q)) return true
      return false
    })
  }, [options, query, matchOptionValue])

  useEffect(() => {
    if (!windowed || !open) return
    setListVisible(Math.min(listWindowInitial as number, filtered.length))
  }, [windowed, listWindowInitial, query, filtered, open])

  useEffect(() => {
    if (!windowed || !open) return
    const sentinel = loadMoreSentinelRef.current
    const root = listUlRef.current
    if (!sentinel || !root) return
    if (listVisible >= filtered.length) return
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting)
        if (!hit) return
        setListVisible((v) => Math.min(v + step, filtered.length))
      },
      { root, rootMargin: '0px', threshold: 0 },
    )
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [windowed, open, listVisible, filtered.length, step])

  const selected = options.find((o) => o.value === value)
  const displayed = windowed ? filtered.slice(0, listVisible) : filtered

  const onListScroll = (e: UIEvent<HTMLUListElement>) => {
    if (!windowed) return
    if (listVisible >= filtered.length) return
    const t = e.currentTarget
    if (t.scrollTop + t.clientHeight >= t.scrollHeight - 12) {
      setListVisible((v) => Math.min(v + step, filtered.length))
    }
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-base text-slate-900 shadow-sm outline-none ring-teal-500/20 transition focus:border-teal-500 focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60 ${buttonClassName}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? '' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              role="listbox"
              className={`fixed z-[300] flex max-h-[min(18rem,calc(100vh-5rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-lg ring-1 ring-black/5 ${dropdownClassName}`}
              style={{
                top: panelBox.top,
                left: panelBox.left,
                width: Math.max(panelBox.width, 200),
              }}
            >
              <div className="shrink-0 border-b border-slate-100 px-2 pb-2">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden
                  />
                  <input
                    type="search"
                    autoComplete="off"
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search…"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>
              <ul
                ref={listUlRef}
                onScroll={onListScroll}
                className={`min-h-0 flex-1 overflow-y-auto py-1 ${listMaxHeightClass}`}
              >
                {options.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-slate-500">{emptyMessage}</li>
                ) : filtered.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-slate-500">{noResultsMessage}</li>
                ) : (
                  <>
                    {displayed.map((o) => {
                      const active = o.value === value
                      return (
                        <li key={o.value} role="option" aria-selected={active} aria-disabled={o.disabled}>
                          <button
                            type="button"
                            disabled={o.disabled}
                            onClick={() => {
                              if (o.disabled) return
                              onChange(o.value)
                              setOpen(false)
                            }}
                            className={`flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left text-sm transition ${
                              o.disabled
                                ? 'cursor-not-allowed text-slate-400'
                                : active
                                  ? 'bg-teal-50 font-semibold text-teal-900'
                                  : 'text-slate-800 hover:bg-slate-50'
                            }`}
                          >
                            <span className="w-full truncate">{o.label}</span>
                            {o.hint ? (
                              <span className="w-full truncate text-xs font-normal text-slate-500">{o.hint}</span>
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                    {windowed && listVisible < filtered.length ? (
                      <li
                        ref={loadMoreSentinelRef}
                        className="pointer-events-none h-px w-full p-0"
                        aria-hidden
                      />
                    ) : null}
                  </>
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
