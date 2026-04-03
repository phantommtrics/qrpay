import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ClipboardList, Filter, RefreshCw } from 'lucide-react'
import { generatePath, Link } from 'react-router-dom'

import { CenteredModal } from '../../components/ui/CenteredModal'
import { ModalOverlay } from '../../components/ui/ModalOverlay'
import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { TablePagination } from '../../components/ui/TablePagination'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformBillingReview,
  patchPlatformBillingReviewInvoice,
  type InvoiceStatus,
  type ManualRefundReviewStatus,
  type PlatformBillingReviewRow,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

const PAGE_SIZE = 15

const INVOICE_STATUS_OPTIONS: Array<{ value: '' | InvoiceStatus; label: string }> = [
  { value: '', label: 'All invoice statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PAID', label: 'Paid' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'VOID', label: 'Void' },
]

const REFUND_STATUS_OPTIONS: Array<{ value: '' | ManualRefundReviewStatus; label: string }> = [
  { value: '', label: 'All refund flags' },
  { value: 'NONE', label: 'None' },
  { value: 'PENDING_REVIEW', label: 'Pending review' },
  { value: 'APPROVED_FOR_REFUND', label: 'Approved for refund' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'REFUNDED_EXTERNALLY', label: 'Refunded externally' },
]

const REFUND_STATUS_LABELS: Record<ManualRefundReviewStatus, string> = {
  NONE: 'None',
  PENDING_REVIEW: 'Pending review',
  APPROVED_FOR_REFUND: 'Approved for refund',
  DECLINED: 'Declined',
  REFUNDED_EXTERNALLY: 'Refunded externally',
}

function formatShortDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso))
  } catch {
    return iso
  }
}

function daysRemainingLabel(days: number) {
  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'} left`
  }
  if (days === 0) {
    return 'Ends today'
  }
  const ago = Math.abs(days)
  return `Ended ${ago} day${ago === 1 ? '' : 's'} ago`
}

function daysRemainingClass(days: number) {
  if (days < 0) {
    return 'font-semibold text-red-700'
  }
  if (days <= 7) {
    return 'font-semibold text-amber-800'
  }
  return 'font-medium text-slate-800'
}

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''
}

type RefundAmountMode = 'FULL' | 'PARTIAL'

const CLICKABLE_TD =
  'cursor-pointer select-none align-top px-5 py-3.5 transition-colors hover:bg-teal-50/60 focus-visible:bg-teal-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500'

function ReviewDataCell({
  row,
  onOpen,
  className = '',
  children,
}: {
  row: PlatformBillingReviewRow
  onOpen: (r: PlatformBillingReviewRow) => void
  className?: string
  children: ReactNode
}) {
  return (
    <td
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(row)
        }
      }}
      className={`${CLICKABLE_TD} ${className}`.trim()}
    >
      {children}
    </td>
  )
}

export function PlatformBillingReviewPage() {
  const { user, canAccess } = useAuth()
  const canEditRefund = canAccess('platform.billing_review.edit')

  const [invoiceStatus, setInvoiceStatus] = useState<'' | InvoiceStatus>('')
  const [refundReviewStatus, setRefundReviewStatus] = useState<'' | ManualRefundReviewStatus>('')
  const [rows, setRows] = useState<PlatformBillingReviewRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editRow, setEditRow] = useState<PlatformBillingReviewRow | null>(null)
  const [editStatus, setEditStatus] = useState<ManualRefundReviewStatus>('NONE')
  const [editNote, setEditNote] = useState('')
  const [refundExpectedBy, setRefundExpectedBy] = useState('')
  const [refundAmountMode, setRefundAmountMode] = useState<RefundAmountMode>('FULL')
  const [refundPartialAmount, setRefundPartialAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isPlatformOperator(user)) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchPlatformBillingReview({
        invoiceStatus: invoiceStatus || undefined,
        refundReviewStatus: refundReviewStatus || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      setRows(payload.data)
      setTotal(payload.total)
    } catch (e) {
      setRows([])
      setTotal(0)
      setError(e instanceof ApiError ? e.message : 'Could not load billing review.')
    } finally {
      setLoading(false)
    }
  }, [user?.isPlatformOwner, user?.isPlatformAdmin, invoiceStatus, refundReviewStatus, page])

  useEffect(() => {
    void load()
  }, [load])

  const openEdit = (row: PlatformBillingReviewRow) => {
    setEditRow(row)
    setEditStatus(row.manualRefundReview.status)
    setEditNote(row.manualRefundReview.note ?? '')
    setRefundExpectedBy(isoToDateInput(row.manualRefundReview.expectedRefundBy))
    const partial = row.manualRefundReview.approvedRefundAmount
    setRefundAmountMode(partial ? 'PARTIAL' : 'FULL')
    setRefundPartialAmount(partial ?? '')
    setSaveError(null)
  }

  const closeEdit = () => {
    setEditRow(null)
    setSaveError(null)
  }

  const handleSaveRefundFlag = async () => {
    if (!editRow) {
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      if (editStatus === 'APPROVED_FOR_REFUND') {
        const day = refundExpectedBy.trim()
        if (!day) {
          setSaveError('Choose the expected refund completion date.')
          return
        }
        if (refundAmountMode === 'PARTIAL') {
          const n = Number(refundPartialAmount)
          const max = Number(editRow.invoice.amount)
          if (!Number.isFinite(n) || n <= 0) {
            setSaveError('Enter a valid partial refund amount.')
            return
          }
          if (n > max) {
            setSaveError('Partial amount cannot exceed the invoice amount.')
            return
          }
        }
        await patchPlatformBillingReviewInvoice(editRow.invoice.id, {
          manualRefundReviewStatus: editStatus,
          manualRefundNote: editNote.trim() || null,
          refundExpectedBy: day,
          refundAmountMode,
          refundPartialAmount: refundAmountMode === 'PARTIAL' ? Number(refundPartialAmount) : undefined,
        })
      } else {
        await patchPlatformBillingReviewInvoice(editRow.invoice.id, {
          manualRefundReviewStatus: editStatus,
          manualRefundNote: editNote.trim() || null,
        })
      }
      closeEdit()
      void load()
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  if (!isPlatformOperator(user)) {
    return null
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">Platform</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Billing review & refunds</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Click any cell in a row to open the review panel. Use <strong className="font-semibold text-slate-800">Open invoice</strong>{' '}
            when you need the full invoice page (it does not open the panel). Scroll the table horizontally for all columns.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <PageCard className="p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Filter className="h-4 w-4 text-teal-600" />
          Filters
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Invoice status</span>
            <select
              value={invoiceStatus}
              onChange={(e) => {
                setInvoiceStatus(e.target.value as '' | InvoiceStatus)
                setPage(1)
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-800 outline-none focus:border-teal-500"
            >
              {INVOICE_STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Refund review flag</span>
            <select
              value={refundReviewStatus}
              onChange={(e) => {
                setRefundReviewStatus(e.target.value as '' | ManualRefundReviewStatus)
                setPage(1)
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-800 outline-none focus:border-teal-500"
            >
              {REFUND_STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </PageCard>

      <PageCard className="p-0">
        {loading && rows.length === 0 ? (
          <p className="p-8 text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="p-8 text-sm text-red-600">{error}</p>
        ) : (
          <>
            <div className="overflow-x-auto overscroll-x-contain">
              {rows.length === 0 ? (
                <p className="p-8 text-sm text-slate-500">No rows match these filters.</p>
              ) : (
                <table className="w-max min-w-full border-separate border-spacing-0 text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="min-w-[220px] whitespace-nowrap px-5 py-3.5">Business</th>
                      <th className="min-w-[200px] whitespace-nowrap px-5 py-3.5">Invoice</th>
                      <th className="min-w-[120px] whitespace-nowrap px-5 py-3.5">Status</th>
                      <th className="min-w-[160px] whitespace-nowrap px-5 py-3.5">Paid / due</th>
                      <th className="min-w-[260px] whitespace-nowrap px-5 py-3.5">Payment (ledger)</th>
                      <th className="min-w-[140px] whitespace-nowrap px-5 py-3.5">Sub ends</th>
                      <th className="min-w-[140px] whitespace-nowrap px-5 py-3.5">Days left</th>
                      <th className="min-w-[200px] whitespace-nowrap px-5 py-3.5">Refund flag</th>
                      <th className="min-w-[150px] whitespace-nowrap px-5 py-3.5">Refund by</th>
                      <th className="min-w-[160px] whitespace-nowrap px-5 py-3.5">Approved refund</th>
                      <th className="min-w-[260px] px-5 py-3.5">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => {
                      const inv = row.invoice
                      const pt = row.paymentTransaction
                      const d = row.subscription.daysRemaining
                      return (
                        <tr key={inv.id} className="bg-white">
                          <ReviewDataCell row={row} onOpen={openEdit} className="min-w-[220px]">
                            <p className="font-medium text-slate-900">{row.business.name}</p>
                            <p className="text-xs text-slate-500">{row.plan.name}</p>
                          </ReviewDataCell>
                          <td
                            role="button"
                            tabIndex={0}
                            className={`${CLICKABLE_TD} min-w-[200px]`}
                            onClick={() => openEdit(row)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                openEdit(row)
                              }
                            }}
                          >
                            <p className="font-mono text-xs text-slate-600">
                              {inv.externalReference?.trim() || `${inv.id.slice(0, 10)}…`}
                            </p>
                            <Link
                              to={generatePath(APP_PATHS.platformInvoiceDetail, {
                                invoiceId: inv.id,
                              })}
                              onClick={(e) => e.stopPropagation()}
                              className="relative z-10 mt-1 inline-block text-xs font-medium text-teal-600 hover:text-teal-700"
                            >
                              Open invoice
                            </Link>
                          </td>
                          <ReviewDataCell row={row} onOpen={openEdit} className="min-w-[120px] whitespace-nowrap">
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                              {inv.status}
                            </span>
                          </ReviewDataCell>
                          <ReviewDataCell row={row} onOpen={openEdit} className="min-w-[160px] text-slate-600">
                            {inv.paidAt ? (
                              <span className="whitespace-nowrap">Paid {formatShortDate(inv.paidAt)}</span>
                            ) : (
                              <span className="whitespace-nowrap">Due {formatShortDate(inv.dueDate)}</span>
                            )}
                            <p className="mt-0.5 text-xs text-slate-500">
                              {inv.amount} {inv.currency}
                            </p>
                          </ReviewDataCell>
                          <ReviewDataCell row={row} onOpen={openEdit} className="min-w-[260px] text-slate-600">
                            {pt ? (
                              <>
                                <p className="font-medium text-slate-800">{pt.provider}</p>
                                <p className="text-xs">
                                  {pt.amount} {pt.currency}
                                </p>
                                {pt.succeededAt ? (
                                  <p className="text-xs text-slate-500">
                                    {formatShortDate(pt.succeededAt)}
                                  </p>
                                ) : null}
                                {pt.providerPaymentRef ? (
                                  <p className="mt-0.5 break-all font-mono text-[10px] text-slate-400">
                                    {pt.providerPaymentRef}
                                  </p>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </ReviewDataCell>
                          <ReviewDataCell row={row} onOpen={openEdit} className="min-w-[140px] whitespace-nowrap text-slate-600">
                            {formatShortDate(row.subscription.currentPeriodEnd)}
                          </ReviewDataCell>
                          <ReviewDataCell
                            row={row}
                            onOpen={openEdit}
                            className={`min-w-[140px] whitespace-nowrap ${daysRemainingClass(d)}`}
                          >
                            {daysRemainingLabel(d)}
                          </ReviewDataCell>
                          <ReviewDataCell row={row} onOpen={openEdit} className="min-w-[200px]">
                            <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-900">
                              {REFUND_STATUS_LABELS[row.manualRefundReview.status]}
                            </span>
                          </ReviewDataCell>
                          <ReviewDataCell row={row} onOpen={openEdit} className="min-w-[150px] whitespace-nowrap text-xs text-slate-600">
                            {row.manualRefundReview.expectedRefundBy
                              ? formatShortDate(row.manualRefundReview.expectedRefundBy)
                              : '—'}
                          </ReviewDataCell>
                          <ReviewDataCell row={row} onOpen={openEdit} className="min-w-[160px] text-xs text-slate-600">
                            {row.manualRefundReview.status === 'APPROVED_FOR_REFUND' ? (
                              row.manualRefundReview.approvedRefundAmount ? (
                                <span>
                                  Partial{' '}
                                  <span className="font-medium text-slate-800">
                                    {row.manualRefundReview.approvedRefundAmount} {inv.currency}
                                  </span>
                                </span>
                              ) : (
                                <span className="font-medium text-slate-800">
                                  Full ({inv.amount} {inv.currency})
                                </span>
                              )
                            ) : (
                              '—'
                            )}
                          </ReviewDataCell>
                          <ReviewDataCell
                            row={row}
                            onOpen={openEdit}
                            className="min-w-[260px] max-w-xs break-words text-xs leading-relaxed text-slate-500"
                          >
                            {row.manualRefundReview.note ?? '—'}
                          </ReviewDataCell>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {total > 0 ? (
              <TablePagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={setPage}
              />
            ) : null}
          </>
        )}
      </PageCard>

      {editRow ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <ModalOverlay className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeEdit} />
          <CenteredModal className="relative z-10 w-full max-w-lg">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="refund-review-title"
              className="flex max-h-[min(92dvh,820px)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
            <div className="flex shrink-0 flex-col border-b border-slate-100 px-6 pt-6 pb-4">
              <div className="mb-2 flex items-center gap-2 text-teal-600">
                <ClipboardList className="h-5 w-5 shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wider">Billing review</span>
              </div>
              <h2 id="refund-review-title" className="text-lg font-semibold text-slate-900">
                {editRow.business.name}
              </h2>
              <p className="mt-1 font-mono text-xs text-slate-500">
                Invoice:{' '}
                {editRow.invoice.externalReference?.trim() || `${editRow.invoice.id.slice(0, 14)}…`}
              </p>
              <Link
                to={generatePath(APP_PATHS.platformInvoiceDetail, {
                  invoiceId: editRow.invoice.id,
                })}
                className="mt-2 inline-flex text-xs font-semibold text-teal-600 hover:text-teal-700"
              >
                Open full invoice page →
              </Link>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-4">
              <section className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Row details
                </h3>
                <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-slate-500">Plan</dt>
                    <dd className="font-medium text-slate-900">{editRow.plan.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Invoice status</dt>
                    <dd className="font-medium text-slate-900">{editRow.invoice.status}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Paid / due</dt>
                    <dd className="text-slate-800">
                      {editRow.invoice.paidAt
                        ? `Paid ${formatShortDate(editRow.invoice.paidAt)}`
                        : `Due ${formatShortDate(editRow.invoice.dueDate)}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Amount</dt>
                    <dd className="font-medium text-slate-900">
                      {editRow.invoice.amount} {editRow.invoice.currency}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">Payment (ledger)</dt>
                    <dd className="text-slate-800">
                      {editRow.paymentTransaction ? (
                        <span>
                          {editRow.paymentTransaction.provider} · {editRow.paymentTransaction.amount}{' '}
                          {editRow.paymentTransaction.currency}
                          {editRow.paymentTransaction.succeededAt
                            ? ` · ${formatShortDate(editRow.paymentTransaction.succeededAt)}`
                            : ''}
                          {editRow.paymentTransaction.providerPaymentRef ? (
                            <span className="mt-0.5 block font-mono text-xs text-slate-500">
                              {editRow.paymentTransaction.providerPaymentRef}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Subscription ends</dt>
                    <dd className="text-slate-800">
                      {formatShortDate(editRow.subscription.currentPeriodEnd)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Days left</dt>
                    <dd className={daysRemainingClass(editRow.subscription.daysRemaining)}>
                      {daysRemainingLabel(editRow.subscription.daysRemaining)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Refund flag</dt>
                    <dd className="font-medium text-slate-900">
                      {REFUND_STATUS_LABELS[editRow.manualRefundReview.status]}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Refund by</dt>
                    <dd className="text-slate-800">
                      {editRow.manualRefundReview.expectedRefundBy
                        ? formatShortDate(editRow.manualRefundReview.expectedRefundBy)
                        : '—'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">Approved refund</dt>
                    <dd className="text-slate-800">
                      {editRow.manualRefundReview.status === 'APPROVED_FOR_REFUND' ? (
                        editRow.manualRefundReview.approvedRefundAmount ? (
                          <>
                            Partial {editRow.manualRefundReview.approvedRefundAmount}{' '}
                            {editRow.invoice.currency}
                          </>
                        ) : (
                          <>
                            Full ({editRow.invoice.amount} {editRow.invoice.currency})
                          </>
                        )
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">Note</dt>
                    <dd className="text-slate-700">{editRow.manualRefundReview.note ?? '—'}</dd>
                  </div>
                </dl>
              </section>

              <div className="mt-6 border-t border-slate-200 pt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Update review
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Flags and emails do not move money — finance completes refunds outside the app.
                </p>

                <label className="mt-4 block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Refund review status</span>
                  <select
                    value={editStatus}
                    disabled={!canEditRefund}
                    onChange={(e) => setEditStatus(e.target.value as ManualRefundReviewStatus)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-800 outline-none focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    {(Object.keys(REFUND_STATUS_LABELS) as ManualRefundReviewStatus[]).map((k) => (
                      <option key={k} value={k}>
                        {REFUND_STATUS_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>

                {editStatus === 'PENDING_REVIEW' ? (
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Saving with <strong>Pending review</strong> emails the business owner a professional
                    notice and attaches a PDF of this invoice.
                  </p>
                ) : null}

                {editStatus === 'APPROVED_FOR_REFUND' ? (
                  <div className="mt-4 space-y-3 rounded-xl border border-teal-100 bg-teal-50/40 p-4">
                    <p className="text-xs font-medium text-teal-900">Refund approval</p>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">
                        Expected refund completion date
                      </span>
                      <input
                        type="date"
                        value={refundExpectedBy}
                        disabled={!canEditRefund}
                        onChange={(e) => setRefundExpectedBy(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 outline-none focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                      <span className="mt-1 block text-xs text-slate-500">
                        Shown to the business in the approval email (target date for finance to
                        complete the refund).
                      </span>
                    </label>
                    <fieldset className="space-y-2" disabled={!canEditRefund}>
                      <legend className="mb-1 text-sm font-medium text-slate-700">Refund amount</legend>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                        <input
                          type="radio"
                          name="refundAmountMode"
                          checked={refundAmountMode === 'FULL'}
                          onChange={() => setRefundAmountMode('FULL')}
                          className="text-teal-600"
                        />
                        Full invoice ({editRow.invoice.amount} {editRow.invoice.currency})
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                        <input
                          type="radio"
                          name="refundAmountMode"
                          checked={refundAmountMode === 'PARTIAL'}
                          onChange={() => setRefundAmountMode('PARTIAL')}
                          className="text-teal-600"
                        />
                        Partial refund
                      </label>
                      {refundAmountMode === 'PARTIAL' ? (
                        <div className="flex flex-wrap items-center gap-2 pl-6">
                          <input
                            type="number"
                            min={0.01}
                            step="0.01"
                            value={refundPartialAmount}
                            onChange={(e) => setRefundPartialAmount(e.target.value)}
                            placeholder={`Max ${editRow.invoice.amount}`}
                            className="w-full max-w-[11rem] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 outline-none focus:border-teal-500 disabled:bg-slate-50"
                          />
                          <span className="text-sm text-slate-600">{editRow.invoice.currency}</span>
                        </div>
                      ) : null}
                    </fieldset>
                    <p className="text-xs text-slate-600">
                      Saving with <strong>Approved for refund</strong> emails the business a confirmation,
                      the approved amount, the expected completion date, and attaches the invoice PDF.
                    </p>
                  </div>
                ) : null}

                <label className="mt-4 block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Note (optional)</span>
                  <textarea
                    value={editNote}
                    disabled={!canEditRefund}
                    onChange={(e) => setEditNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-800 outline-none focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                    placeholder="Internal note for your team…"
                  />
                </label>

                {saveError ? (
                  <p className="mt-3 text-sm text-red-600">{saveError}</p>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-4">
              {!canEditRefund ? (
                <p className="mb-3 text-xs text-slate-500">
                  Your role can view this panel but cannot change refund flags. Ask a platform admin to
                  grant <span className="font-medium text-slate-700">Billing review (edit)</span>.
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  Close
                </button>
                {canEditRefund ? (
                  <button
                    type="button"
                    onClick={() => void handleSaveRefundFlag()}
                    disabled={saving}
                    className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save review'}
                  </button>
                ) : null}
              </div>
            </div>
            </div>
          </CenteredModal>
        </div>
      ) : null}
    </PageTransition>
  )
}
