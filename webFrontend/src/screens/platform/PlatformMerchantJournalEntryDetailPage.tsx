import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Ban, CheckCircle2, Loader2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { FinanceReportChrome } from '../../components/finance/FinanceReportChrome'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchMerchantJournalEntryDetail,
  postMerchantJournalApprove,
  postMerchantJournalCancel,
  type MerchantJournalDetailData,
} from '../../services/subscriptionApi'
import { formatMoney } from '../../utils/formatMoney'

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

export function PlatformMerchantJournalEntryDetailPage() {
  const { journalEntryId } = useParams<{ journalEntryId: string }>()
  const navigate = useNavigate()
  const { canAccess } = useAuth()
  const canView = canAccess('platform.accounting.transaction_journal')
  const canApprove = canAccess('platform.accounting.transaction_journal.approve')

  const [data, setData] = useState<MerchantJournalDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [approveModalOpen, setApproveModalOpen] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)

  const load = useCallback(() => {
    if (!journalEntryId || !canView) return
    setLoading(true)
    setError(null)
    void fetchMerchantJournalEntryDetail(journalEntryId)
      .then(setData)
      .catch((e) => {
        setData(null)
        setError(e instanceof ApiError ? e.message : 'Could not load journal.')
      })
      .finally(() => setLoading(false))
  }, [journalEntryId, canView])

  useEffect(() => {
    load()
  }, [load])

  const runApprove = async () => {
    if (!journalEntryId || !data || data.journalApprovalExempt || data.approvedAt || data.cancelledAt) return
    setApproving(true)
    setError(null)
    try {
      const next = await postMerchantJournalApprove(journalEntryId)
      setData(next)
      setApproveModalOpen(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not approve.')
    } finally {
      setApproving(false)
    }
  }

  const runCancelPosting = async () => {
    if (!journalEntryId || !data || data.journalApprovalExempt || data.approvedAt || data.cancelledAt) return
    setCancelling(true)
    setError(null)
    try {
      const next = await postMerchantJournalCancel(journalEntryId)
      setData(next)
      setCancelModalOpen(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not remove posting.')
    } finally {
      setCancelling(false)
    }
  }

  if (!canView) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <p className="text-qb-muted">You do not have access to transaction journal.</p>
        </PageCard>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <FinanceReportChrome
        title="Journal detail"
        description="Review lines and approve when required."
        toolbar={null}
      >
        <PageCard
          variant="default"
          className="space-y-5 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <Link
            to={
              data?.postedByPlatformUser
                ? APP_PATHS.platformAccountingOperatorJournals
                : APP_PATHS.platformAccountingMerchantJournalEntries
            }
            className="inline-flex items-center text-sm font-medium text-qb-muted hover:text-qb-heading"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to list
          </Link>

          {loading ? (
            <div className="flex items-center gap-2 py-12 text-qb-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <p className="text-sm font-medium text-red-700">{error}</p>
          ) : data ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Business</p>
                  <p className="mt-1 text-lg font-semibold text-qb-heading">{data.businessName}</p>
                  <p className="font-mono text-xs text-qb-muted">{data.businessId}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Posted</p>
                  <p className="mt-1 tabular-nums text-sm text-qb-heading">{formatShortDate(data.postedAt)}</p>
                </div>
              </div>

              {data.postedByPlatformUser ? (
                <div className="rounded-md border border-teal-200/80 bg-teal-50/80 px-3 py-2 text-sm text-teal-950">
                  <span className="font-semibold">Posted by platform operator:</span>{' '}
                  {data.postedByPlatformUser.name}
                  <span className="ml-1 text-teal-800/90">({data.postedByPlatformUser.email})</span>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {data.journalApprovalExempt ? (
                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
                    Exempt from approval (customer sale / wallet fee)
                  </span>
                ) : data.cancelledAt ? (
                  <span className="rounded-md bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-900">
                    Removed
                    {data.cancelledBy ? ` · ${data.cancelledBy.name}` : ''}
                    <span className="ml-1 font-normal text-rose-800">
                      ({formatShortDate(data.cancelledAt)})
                    </span>
                  </span>
                ) : data.approvedAt ? (
                  <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                    Approved
                    {data.approvedBy ? ` · ${data.approvedBy.name}` : ''}
                    <span className="ml-1 font-normal text-emerald-800">
                      ({formatShortDate(data.approvedAt)})
                    </span>
                  </span>
                ) : (
                  <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                    Pending approval
                  </span>
                )}
              </div>

              {!data.journalApprovalExempt && !data.approvedAt && !data.cancelledAt && canApprove ? (
                <div className="rounded-lg border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Action required</p>
                  <p className="mt-1 max-w-xl text-sm text-slate-600">
                    This posting is not yet included in the merchant&apos;s GL, profit &amp; loss, or account
                    statements until you approve it.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={approving || cancelling}
                      onClick={() => setApproveModalOpen(true)}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400/30 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {approving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                          Approving…
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-slate-500" strokeWidth={2} aria-hidden />
                          Approve posting
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={approving || cancelling}
                      onClick={() => setCancelModalOpen(true)}
                      className="inline-flex items-center gap-2 rounded-md border border-rose-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-rose-800 shadow-sm transition hover:border-rose-300 hover:bg-rose-50/80 focus:outline-none focus:ring-2 focus:ring-rose-400/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {cancelling ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                          Removing…
                        </>
                      ) : (
                        <>
                          <Ban className="h-4 w-4 text-rose-600" strokeWidth={2} aria-hidden />
                          Remove posting
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={approving || cancelling}
                      onClick={() =>
                        navigate(
                          data.postedByPlatformUser
                            ? APP_PATHS.platformAccountingOperatorJournals
                            : APP_PATHS.platformAccountingMerchantJournalEntries,
                        )
                      }
                      className="inline-flex items-center rounded-md border border-slate-200/70 bg-slate-50/90 px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-100/90 focus:outline-none focus:ring-2 focus:ring-slate-400/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Back to list
                    </button>
                  </div>
                  <p className="mt-3 max-w-xl text-xs text-slate-500">
                    Remove posting permanently drops it from the approval queue. It will not appear on the
                    merchant&apos;s GL, P&amp;L, or statements.
                  </p>
                </div>
              ) : null}

              <div className="grid gap-2 text-sm">
                <p>
                  <span className="font-semibold text-qb-muted">Source:</span>{' '}
                  <span className="font-mono text-xs">{data.sourceType ?? '—'}</span>
                  {data.sourceId ? (
                    <span className="ml-2 font-mono text-xs text-qb-muted">{data.sourceId}</span>
                  ) : null}
                </p>
                {data.reference ? (
                  <p>
                    <span className="font-semibold text-qb-muted">Reference:</span> {data.reference}
                  </p>
                ) : null}
                {data.memo ? (
                  <p>
                    <span className="font-semibold text-qb-muted">Memo:</span> {data.memo}
                  </p>
                ) : null}
              </div>

              <div className="overflow-x-auto rounded-sm border border-qb-border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-qb-border bg-qb-surface text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      <th className="px-3 py-2.5 text-left">Account</th>
                      <th className="px-3 py-2.5 text-right">Debit</th>
                      <th className="px-3 py-2.5 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-qb-border">
                    {data.lines.map((ln) => (
                      <tr key={ln.id}>
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs">{ln.code}</span>
                          <span className="ml-2 text-qb-heading">{ln.name}</span>
                          {ln.description ? (
                            <span className="mt-0.5 block text-xs text-qb-muted">{ln.description}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {ln.debit > 0 ? formatMoney(ln.debit, { decimals: 2 }) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {ln.credit > 0 ? formatMoney(ln.credit, { decimals: 2 }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <ConfirmModal
            open={approveModalOpen}
            title="Approve this posting?"
            confirmLabel="Approve"
            cancelLabel="Cancel"
            variant="light"
            loading={approving}
            onCancel={() => {
              if (!approving) setApproveModalOpen(false)
            }}
            onConfirm={() => void runApprove()}
          >
            <p>
              Once approved, this journal will appear on the business&apos;s general ledger, profit &amp;
              loss, and account statements for the relevant periods.
            </p>
          </ConfirmModal>

          <ConfirmModal
            open={cancelModalOpen}
            title="Remove this posting?"
            confirmLabel="Remove posting"
            cancelLabel="Back"
            variant="danger"
            loading={cancelling}
            onCancel={() => {
              if (!cancelling) setCancelModalOpen(false)
            }}
            onConfirm={() => void runCancelPosting()}
          >
            <p>
              This pending journal will be marked removed. It will never be included in the merchant&apos;s GL,
              profit &amp; loss, or account statements.
            </p>
          </ConfirmModal>
        </PageCard>
      </FinanceReportChrome>
    </PageTransition>
  )
}
