import { ChevronLeft, ChevronRight } from 'lucide-react'

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  className = '',
  /** Narrow sidebars: stack controls vertically and avoid horizontal bleed. */
  compact = false,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (nextPage: number) => void
  className?: string
  compact?: boolean
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const to = Math.min(safePage * pageSize, total)

  if (compact) {
    return (
      <div
        className={`box-border w-full min-w-0 max-w-full border-t border-slate-100 bg-slate-50/90 px-2 py-2.5 text-xs text-slate-600 sm:px-3 ${className}`}
      >
        <p className="mb-2 text-center leading-snug">
          <span className="font-medium text-slate-800">
            {from}–{to}
          </span>{' '}
          of <span className="font-medium text-slate-800">{total}</span>
        </p>
        <div className="grid w-full min-w-0 grid-cols-[2.5rem_1fr_2.5rem] items-center gap-1">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Previous page"
            className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-0 truncate text-center text-[11px] font-medium tabular-nums text-slate-500">
            Page {safePage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Next page"
            className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`box-border flex w-full min-w-0 max-w-full flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/90 px-3 py-3 text-sm text-slate-600 sm:px-4 ${className}`}
    >
      <p className="min-w-0 shrink text-center sm:text-left">
        Showing{' '}
        <span className="font-medium text-slate-800">
          {from}–{to}
        </span>{' '}
        of <span className="font-medium text-slate-800">{total}</span>
      </p>
      <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-center gap-2 sm:justify-end">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>
        <span className="min-w-[5.5rem] text-center text-xs font-medium text-slate-500">
          Page {safePage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
