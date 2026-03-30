import { ChevronLeft, ChevronRight } from 'lucide-react'

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  className = '',
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (nextPage: number) => void
  className?: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const to = Math.min(safePage * pageSize, total)

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/90 px-4 py-3 text-sm text-slate-600 ${className}`}
    >
      <p>
        Showing{' '}
        <span className="font-medium text-slate-800">
          {from}–{to}
        </span>{' '}
        of <span className="font-medium text-slate-800">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>
        <span className="min-w-[7rem] text-center text-xs font-medium text-slate-500">
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
