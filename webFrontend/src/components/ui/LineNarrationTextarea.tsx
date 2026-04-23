import { useLayoutEffect, useRef } from 'react'

/** Line-table narration: inset well + focus ring on shell (textarea is borderless inside). */
export const QB_LINE_NARRATION_SHELL =
  'rounded-md border border-qb-border bg-white p-[2px] shadow-[0_1px_2px_rgba(57,58,61,0.08)] transition-[border-color,box-shadow] duration-200 focus-within:border-qb-primary focus-within:shadow-[0_1px_3px_rgba(57,58,61,0.12)] focus-within:ring-2 focus-within:ring-qb-primary/12'

const QB_LINE_NARRATION_FIELD =
  'block max-h-40 min-h-[2.25rem] w-full resize-none overflow-y-auto rounded-[6px] border-0 bg-qb-surface/25 px-3 py-2.5 text-xs leading-relaxed text-qb-heading break-words [scrollbar-width:thin] [scrollbar-color:var(--color-qb-border)_transparent] selection:bg-qb-primary/10 placeholder:text-qb-muted/55 hover:bg-qb-surface/35 focus:bg-white focus:outline-none focus:ring-0 focus:placeholder:text-qb-muted/45'

function fitLineNarrationHeight(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

export function LineNarrationTextarea({
  value,
  onValueChange,
  placeholder,
  ariaLabel = 'Line narration',
}: {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  /** Accessibility label (column header may be Narration, Description, etc.). */
  ariaLabel?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    fitLineNarrationHeight(el)
    const shell = el.parentElement
    if (!shell || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => fitLineNarrationHeight(el))
    ro.observe(shell)
    return () => ro.disconnect()
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      wrap="soft"
      spellCheck
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      className={QB_LINE_NARRATION_FIELD}
      onChange={(e) => onValueChange(e.target.value)}
    />
  )
}
