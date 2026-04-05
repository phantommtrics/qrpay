import { FileDown, FileText } from 'lucide-react'

export function ReportExportToolbar({
  canExport,
  onCsv,
  onPdf,
  disabled,
}: {
  canExport: boolean
  onCsv: () => void
  onPdf: () => void | Promise<void>
  disabled?: boolean
}) {
  if (!canExport) {
    return (
      <p className="text-xs text-qb-muted">
        PDF and CSV export are not enabled for your plan role. Ask an owner to grant export access.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onCsv()}
        className="inline-flex items-center gap-1.5 rounded-sm border border-qb-border bg-white px-3 py-1.5 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
      >
        <FileDown className="h-4 w-4" />
        Export CSV
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void onPdf()}
        className="inline-flex items-center gap-1.5 rounded-sm border border-qb-border bg-white px-3 py-1.5 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
      >
        <FileText className="h-4 w-4" />
        Export PDF
      </button>
    </div>
  )
}
