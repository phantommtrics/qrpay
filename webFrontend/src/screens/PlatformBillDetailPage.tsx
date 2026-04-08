import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileDown, Loader2, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { SalesDocumentPaper } from '../components/sales/SalesDocumentPaper'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import type { BillRow } from '../services/salesDocumentsApi'
import { downloadPlatformBillPdf } from '../services/salesDocumentsApi'
import {
  ApiError,
  approvePlatformBillApi,
  fetchPlatformAccountingChart,
  fetchPlatformBillDetail,
  markPlatformBillPaidApi,
  voidPlatformBillApi,
  type PlatformBillRow,
  type PlatformChartAccountDetail,
} from '../services/subscriptionApi'

const PLATFORM_PAPER_BUSINESS_NAME = 'EasyPay'

function platformBillToPaperDocument(row: PlatformBillRow): BillRow {
  return {
    id: row.id,
    businessId: 'platform',
    contactId: row.supplierId,
    publicCode: row.publicCode,
    status: row.status,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    reference: row.reference,
    currency: row.currency,
    settlementChartAccountId: row.settlementChartAccountId,
    journalEntryId: row.platformJournalEntryId,
    approvedAt: row.approvedAt,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    contact: {
      id: row.supplier.id,
      name: row.supplier.name,
      email: row.supplier.email,
    },
    journalEntry: row.journalEntry,
    lines: row.lines.map((l) => ({
      id: l.id,
      chartOfAccountId: l.chartOfAccountId,
      narration: l.narration,
      quantity: l.quantity,
      unitLabel: l.unitLabel,
      unitAmount: l.unitAmount,
      taxAmount: l.taxAmount,
      sortOrder: l.sortOrder,
      chartOfAccount: l.chartOfAccount,
    })),
  }
}

export function PlatformBillDetailPage() {
  const { billId } = useParams<{ billId: string }>()
  const { canAccess } = useAuth()
  const canManage = canAccess('platform.bills.manage')

  const [row, setRow] = useState<PlatformBillRow | null>(null)
  const [accounts, setAccounts] = useState<PlatformChartAccountDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [settlementId, setSettlementId] = useState('')
  const [postedAt, setPostedAt] = useState(() => new Date().toISOString().slice(0, 10))

  const paperDoc = useMemo(() => (row ? platformBillToPaperDocument(row) : null), [row])

  const load = useCallback(async () => {
    if (!billId) return
    setLoading(true)
    setError(null)
    try {
      const [b, chart] = await Promise.all([fetchPlatformBillDetail(billId), fetchPlatformAccountingChart()])
      setRow(b)
      setAccounts(chart.filter((a) => a.category === 'ASSET'))
      const firstBank = chart.find((a) => a.category === 'ASSET')
      setSettlementId((prev) => prev || firstBank?.id || '')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load bill.')
    } finally {
      setLoading(false)
    }
  }, [billId])

  useEffect(() => {
    void load()
  }, [load])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  const handlePdf = useCallback(async () => {
    if (!billId) return
    setPdfBusy(true)
    try {
      await downloadPlatformBillPdf(billId)
    } finally {
      setPdfBusy(false)
    }
  }, [billId])

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
              to={APP_PATHS.platformBills}
              className="inline-flex items-center text-sm font-medium text-qb-muted hover:text-qb-heading"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to supplier bills
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

          {loading ? <p className="text-sm text-qb-muted">Loading…</p> : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          {row ? (
            <div className="border-t border-qb-border pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-mono text-lg font-semibold text-qb-heading">{row.publicCode}</h1>
                <span className="text-xs font-semibold uppercase text-qb-muted">{row.status}</span>
              </div>
              <p className="mt-2 text-sm text-qb-muted">
                Supplier: <span className="font-medium text-qb-heading">{row.supplier.name}</span>
                {row.supplier.email ? (
                  <>
                    {' '}
                    · <span className="text-qb-heading">{row.supplier.email}</span>
                  </>
                ) : null}
              </p>

              {canManage ? (
                <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {row.status === 'DRAFT' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true)
                          setError(null)
                          try {
                            const u = await approvePlatformBillApi(row.id)
                            setRow(u)
                          } catch (e) {
                            setError(e instanceof ApiError ? e.message : 'Approve failed.')
                          } finally {
                            setBusy(false)
                          }
                        }}
                        className="rounded-sm border border-qb-border bg-white px-3 py-2 text-sm font-medium"
                      >
                        Approve & notify supplier
                      </button>
                    ) : null}
                    {row.status === 'DRAFT' || row.status === 'APPROVED' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (!confirm('Void this bill?')) return
                          setBusy(true)
                          setError(null)
                          try {
                            const u = await voidPlatformBillApi(row.id)
                            setRow(u)
                          } catch (e) {
                            setError(e instanceof ApiError ? e.message : 'Void failed.')
                          } finally {
                            setBusy(false)
                          }
                        }}
                        className="rounded-sm border border-qb-border px-3 py-2 text-sm text-red-700"
                      >
                        Void
                      </button>
                    ) : null}
                  </div>

                  {row.status === 'APPROVED' ? (
                    <div className="mt-4 space-y-3 rounded-sm border border-qb-border bg-qb-surface/30 p-4">
                      <p className="text-sm font-medium text-qb-heading">Mark paid (posts to platform GL)</p>
                      <div className="flex flex-wrap gap-3">
                        <label className="text-sm">
                          <span className="text-qb-muted">Settlement account</span>
                          <select
                            value={settlementId}
                            onChange={(e) => setSettlementId(e.target.value)}
                            className="mt-1 block w-full min-w-[12rem] rounded-sm border border-qb-border px-2 py-1.5"
                          >
                            <option value="">Select…</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.code} — {a.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm">
                          <span className="text-qb-muted">Posted date</span>
                          <input
                            type="date"
                            value={postedAt}
                            onChange={(e) => setPostedAt(e.target.value)}
                            className="mt-1 block rounded-sm border border-qb-border px-2 py-1.5"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        disabled={busy || !settlementId}
                        onClick={async () => {
                          setBusy(true)
                          setError(null)
                          try {
                            const u = await markPlatformBillPaidApi(row.id, {
                              settlementChartAccountId: settlementId,
                              postedAt,
                            })
                            setRow(u)
                          } catch (e) {
                            setError(e instanceof ApiError ? e.message : 'Could not mark paid.')
                          } finally {
                            setBusy(false)
                          }
                        }}
                        className="rounded-sm bg-qb-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Mark paid
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </PageCard>

        {!row || loading ? null : paperDoc ? (
          <div className="mx-auto max-w-[210mm] print:p-0">
            <SalesDocumentPaper variant="bill" document={paperDoc} businessName={PLATFORM_PAPER_BUSINESS_NAME} />
          </div>
        ) : null}
      </div>
    </PageTransition>
  )
}
