import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

/** ~4 visible option rows (py-2.5 + text-sm); remainder scroll inside the panel */
const DEFAULT_LIST_MAX_HEIGHT = 'max-h-[10rem]'

export type SearchableListboxOption = {
  id: string
  label: string
  depth?: number
}

export function SearchableListbox({
  fieldLabel,
  fieldLabelClassName = 'text-xs font-medium text-slate-600',
  options,
  value,
  onChange,
  placeholder = 'Search…',
  disabled = false,
  listId,
  className = '',
  /** When true, typing only filters the list; selection changes only when an option is clicked. */
  selectOnlyViaList = false,
  listMaxHeightClassName = DEFAULT_LIST_MAX_HEIGHT,
  layout = 'stacked',
  clearable = false,
}: {
  fieldLabel: string
  fieldLabelClassName?: string
  options: SearchableListboxOption[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  disabled?: boolean
  listId: string
  className?: string
  selectOnlyViaList?: boolean
  /** Tailwind max-height for the dropdown (default ≈4 rows + scroll). */
  listMaxHeightClassName?: string
  /** `inline` puts the label on the same row as the field (compact toolbar rows). */
  layout?: 'stacked' | 'inline'
  /** When true, show a clear control when `value` is non-empty. */
  clearable?: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedLabel = useMemo(() => {
    return options.find((o) => o.id === value)?.label ?? ''
  }, [value, options])

  useLayoutEffect(() => {
    if (!open) {
      setQuery(selectedLabel)
    }
  }, [open, selectedLabel])

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      return options
    }
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) {
      return
    }
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  const showList = open && !disabled && options.length > 0
  const showClear = clearable && !disabled && value !== ''

  const inputPaddingRight = showClear ? 'pr-10' : 'pr-3'

  const clearSelection = () => {
    onChange('')
    setQuery('')
    setOpen(false)
  }

  return (
    <div
      ref={rootRef}
      className={
        layout === 'inline'
          ? `flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 ${className}`
          : `block ${className}`
      }
    >
      <span
        className={
          layout === 'inline'
            ? `shrink-0 whitespace-nowrap ${fieldLabelClassName}`
            : `mb-1 block ${fieldLabelClassName}`
        }
      >
        {fieldLabel}
      </span>
      <div
        className={
          layout === 'inline'
            ? 'relative min-w-[min(100%,12rem)] flex-1 sm:min-w-[14rem]'
            : 'relative'
        }
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          disabled={disabled}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          role="combobox"
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            const v = e.target.value
            setQuery(v)
            setOpen(true)
            if (selectOnlyViaList) {
              return
            }
            const currentLabel = options.find((o) => o.id === value)?.label ?? ''
            if (v !== currentLabel) {
              onChange('')
            }
          }}
          onFocus={() => setOpen(true)}
          className={`w-full rounded-xl border border-slate-200 py-2 pl-10 text-sm outline-none focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70 ${inputPaddingRight}`}
        />
        {showClear ? (
          <button
            type="button"
            aria-label="Clear selection"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clearSelection}
            className="absolute top-1/2 right-2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : null}
        {showList ? (
          <ul
            id={listId}
            role="listbox"
            className={`absolute z-30 mt-1 w-full ${listMaxHeightClassName} overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/5`}
          >
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-slate-500">No matches</li>
            ) : (
              filteredOptions.map((o) => {
                const selected = o.id === value
                const depth = o.depth ?? 0
                return (
                  <li key={o.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onChange(o.id)
                        setQuery(o.label)
                        setOpen(false)
                      }}
                      style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
                      className={`flex w-full py-2.5 pr-3 text-left text-sm transition-colors ${
                        selected
                          ? 'bg-teal-50 font-medium text-teal-900'
                          : 'text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {o.label}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
