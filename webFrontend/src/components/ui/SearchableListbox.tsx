import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'

/** ~4 visible rows; remainder scroll inside the panel */
const LIST_MAX_HEIGHT = 'max-h-40'

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

  return (
    <div ref={rootRef} className={`block ${className}`}>
      <span className={`mb-1 block ${fieldLabelClassName}`}>{fieldLabel}</span>
      <div className="relative">
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
            const currentLabel = options.find((o) => o.id === value)?.label ?? ''
            if (v !== currentLabel) {
              onChange('')
            }
          }}
          onFocus={() => setOpen(true)}
          className="w-full rounded-xl border border-slate-200 py-2 pr-3 pl-10 text-sm outline-none focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70"
        />
        {showList ? (
          <ul
            id={listId}
            role="listbox"
            className={`absolute z-30 mt-1 w-full ${LIST_MAX_HEIGHT} overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/5`}
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
