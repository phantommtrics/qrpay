import { useCallback, useEffect, useState } from 'react'
import { MailCheck, RefreshCw } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchCorporateInvitationEmailLogs,
  type CorporateInvitationEmailLogRow,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusClass(status: CorporateInvitationEmailLogRow['deliveryStatus']) {
  if (status === 'SENT') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (status === 'FAILED') return 'bg-rose-50 text-rose-700 ring-rose-200'
  return 'bg-amber-50 text-amber-700 ring-amber-200'
}

export function PlatformCorporateInvitationRecordsPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<CorporateInvitationEmailLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isPlatformOperator(user)) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchCorporateInvitationEmailLogs())
    } catch (e) {
      setRows([])
      setError(e instanceof ApiError ? e.message : 'Could not load invitation records.')
    } finally {
      setLoading(false)
    }
  }, [user?.isPlatformOwner, user?.isPlatformAdmin])

  useEffect(() => {
    void load()
  }, [load])

  if (!isPlatformOperator(user)) {
    return null
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">Platform</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Sent invitations</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Track corporate and small business proposal emails sent by platform operators, including copied
            recipients, delivery status, and the PDF attachment name.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <PageCard className="overflow-x-auto p-0">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading invitation records…</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <MailCheck className="h-10 w-10 text-slate-300" />
            <div>
              <p className="font-semibold text-slate-900">No invitations sent yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Sent proposal emails will appear here for admin tracking.
              </p>
            </div>
          </div>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Recipients</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent by</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="bg-white align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{row.organizationName}</p>
                    <p className="text-xs text-slate-500">
                      {row.contactName}
                      {row.contactTitle ? `, ${row.contactTitle}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <p>{row.recipientEmail}</p>
                    {row.ccEmails.length > 0 ? (
                      <p className="mt-1 text-xs text-slate-500">CC: {row.ccEmails.join(', ')}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">No CC</p>
                    )}
                  </td>
                  <td className="max-w-sm px-4 py-3 text-slate-700">
                    <p className="font-medium text-slate-800">{row.subject}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.attachmentFilename}</p>
                    {row.failureReason ? (
                      <p className="mt-1 text-xs text-rose-600">{row.failureReason}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClass(
                        row.deliveryStatus,
                      )}`}
                    >
                      {row.deliveryStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <p>{row.createdByName ?? row.senderName}</p>
                    <p className="text-xs text-slate-500">{row.createdByEmail ?? row.senderTitle ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <p>{formatDateTime(row.sentAt ?? row.createdAt)}</p>
                    {row.resendEmailId ? (
                      <p className="mt-1 text-xs text-slate-400">Resend: {row.resendEmailId}</p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PageCard>
    </PageTransition>
  )
}
