import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, FileDown, Loader2, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { SalesDocumentPaper } from '../components/sales/SalesDocumentPaper'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { ApiError } from '../services/subscriptionApi'
import {
  fetchBill,
  downloadBillPdf,
  type BillRow,
} from '../services/salesDocumentsApi'

export function BillDetailPage() {
  const { billId } = useParams<{ billId: string }>()
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id
  const businessName = currentOrganization?.name ?? 'Business'

  const [row, setRow] = useState<BillRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  useEffect(() => {
    if (!businessId || !billId) return
    setLoading(true)
    setError(null)
    void fetchBill(businessId, billId)
      .then(setRow)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Could not load.'),
      )
      .finally(() => setLoading(false))
  }, [businessId, billId])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  const handlePdf = useCallback(async () => {
    if (!businessId || !billId) return
    setPdfBusy(true)
    try {
      await downloadBillPdf(businessId, billId)
    } finally {
      setPdfBusy(false)
    }
  }, [businessId, billId])

  if (!businessId) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <p className="text-slate-500">Select a business.</p>
        </PageCard>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #sales-doc-print-root, #sales-doc-print-root * { visibility: visible; }
          #sales-doc-print-root { position: absolute; left: 0; top: 0; width: 100%; }
          .sales-detail-no-print { display: none !important; }
        }
      `}</style>
      <div className="space-y-5 py-2 lg:space-y-6">
        <PageCard
          variant="default"
          className="sales-detail-no-print space-y-4 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={APP_PATHS.salesBills}
              className="inline-flex items-center text-sm font-medium text-qb-muted hover:text-qb-heading"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to bills
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-sm border border-qb-border bg-white px-4 py-2 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button
              type="button"
              disabled={pdfBusy || !row}
              onClick={() => void handlePdf()}
              className="inline-flex items-center gap-2 rounded-sm border border-qb-border bg-white px-4 py-2 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
            >
              {pdfBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              Export PDF
            </button>
          </div>
        </PageCard>

        {loading ? (
          <PageCard variant="default" className="flex items-center gap-2 py-12 text-qb-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </PageCard>
        ) : error ? (
          <PageCard variant="default" className="rounded-md border-red-200 bg-red-50/80 p-4">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </PageCard>
        ) : row ? (
          <div className="mx-auto max-w-[210mm] print:p-0">
            <SalesDocumentPaper variant="bill" document={row} businessName={businessName} />
          </div>
        ) : null}
      </div>
    </PageTransition>
  )
}
