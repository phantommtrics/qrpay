import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PlatformBillBulkPostModal } from '../components/platform/PlatformBillBulkPostModal'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { Toast, type ToastVariant } from '../components/ui/Toast'
import { APP_PATHS, platformBillDetailPath } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformBillBulkPostGateways,
  fetchPlatformBills,
  type PlatformBillBulkPostGatewayRow,
  type PlatformBillBulkPostSummary,
  type PlatformBillRow,
} from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

function billTotal(lines: PlatformBillRow['lines']): number {
  let s = 0
  for (const l of lines) {
    s += l.quantity * l.unitAmount + l.taxAmount
  }
  return s
}

export function PlatformBillsPage() {
  const { canAccess } = useAuth()
  const canManage = canAccess('platform.bills.manage')
  const [rows, setRows] = useState<PlatformBillRow[]>([])
  const [gateways, setGateways] = useState<PlatformBillBulkPostGatewayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null)

  const dismissToast = useCallback(() => setToast(null), [])

  const approvedRows = useMemo(() => rows.filter((r) => r.status === 'APPROVED'), [rows])
  const selectedApprovedCount = useMemo(
    () => approvedRows.filter((r) => selectedIds.has(r.id)).length,
    [approvedRows, selectedIds],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [bills, gatewayRows] = await Promise.all([
        fetchPlatformBills(),
        canManage ? fetchPlatformBillBulkPostGateways().catch(() => []) : Promise.resolve([]),
      ])
      setRows(bills)
      setGateways(gatewayRows)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load bills.')
    } finally {
      setLoading(false)
    }
  }, [canManage])

  useEffect(() => {
    void load()
  }, [load])

  const toggleBill = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllApproved = () => {
    setSelectedIds(new Set(approvedRows.map((r) => r.id)))
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleBulkComplete = useCallback(
    (summary: PlatformBillBulkPostSummary) => {
      void load()
      clearSelection()

      if (summary.failed === 0) {
        setToast({
          message: `${summary.succeeded} bill${summary.succeeded === 1 ? '' : 's'} posted successfully.`,
          variant: 'success',
        })
        return
      }

      const apsFailures = summary.results.filter((r) => !r.success && r.errorPhase === 'aps_send')
      const firstApsError = apsFailures[0]?.error

      if (summary.succeeded === 0) {
        setToast({
          message: firstApsError
            ? `Send money failed: ${firstApsError}`
            : summary.results.find((r) => !r.success)?.error ?? 'Bulk post failed for all selected bills.',
          variant: 'error',
        })
        return
      }

      setToast({
        message: `${summary.succeeded} posted, ${summary.failed} failed.${
          firstApsError ? ` APS error: ${firstApsError}` : ''
        }`,
        variant: 'error',
      })
    },
    [load],
  )

  return (
    <PageTransition>
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant ?? 'success'}
        onDismiss={dismissToast}
      />
      <div className="space-y-6 py-2">
        <PageCard variant="default" className="rounded-md border-qb-border p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-qb-heading">Supplier bills</h1>
              <p className="mt-2 text-sm text-qb-muted">
                Platform accounts payable — mirror of merchant purchase bills, posted to the operator chart when
                paid.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to={APP_PATHS.platformContacts}
                className="rounded-sm border border-qb-border bg-white px-4 py-2 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface"
              >
                Supplier contacts
              </Link>
              {canManage ? (
                <Link
                  to={APP_PATHS.platformBillNew}
                  className="rounded-sm bg-qb-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                >
                  New bill
                </Link>
              ) : null}
            </div>
          </div>
        </PageCard>

        <PageCard variant="default" className="rounded-md border-qb-border p-5">
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {loading ? <p className="text-sm text-qb-muted">Loading…</p> : null}

          {canManage && approvedRows.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={selectAllApproved}
                className="rounded-sm border border-qb-border px-3 py-1.5 text-xs font-medium"
              >
                Select all approved
              </button>
              {selectedIds.size > 0 ? (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-sm border border-qb-border px-3 py-1.5 text-xs font-medium"
                >
                  Clear ({selectedIds.size})
                </button>
              ) : null}
              {selectedApprovedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(true)}
                  className="rounded-sm bg-qb-primary px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Bulk post ({selectedApprovedCount})
                </button>
              ) : null}
              <span className="text-xs text-qb-muted">
                APS bulk pay needs mobile on{' '}
                <Link to={APP_PATHS.platformContacts} className="text-qb-primary hover:underline">
                  supplier contacts
                </Link>
                .
              </span>
            </div>
          ) : null}

          {!loading && rows.length === 0 ? (
            <p className="text-sm text-qb-muted">No platform bills yet.</p>
          ) : null}
          <div className="mt-4 space-y-2">
            {rows.map((r) => {
              const isApproved = r.status === 'APPROVED'
              const checked = selectedIds.has(r.id)
              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 rounded-sm border border-qb-border bg-white px-3 py-2 text-sm"
                >
                  {canManage && isApproved ? (
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleBill(r.id)}
                      aria-label={`Select ${r.publicCode}`}
                      className="shrink-0"
                    />
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <Link
                    to={platformBillDetailPath(r.id)}
                    className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 hover:bg-qb-surface/40"
                  >
                    <div>
                      <span className="font-mono font-medium text-qb-heading">{r.publicCode}</span>
                      <span className="ml-2 text-qb-muted">{r.supplier.name}</span>
                      {r.supplier.phone ? (
                        <span className="ml-2 text-xs text-qb-muted">{r.supplier.phone}</span>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <span className="font-medium text-qb-heading">
                        {formatMoney(billTotal(r.lines))} {r.currency}
                      </span>
                      <span className="ml-2 text-xs uppercase text-qb-muted">{r.status}</span>
                    </div>
                  </Link>
                </div>
              )
            })}
          </div>
        </PageCard>
      </div>

      {bulkModalOpen ? (
        <PlatformBillBulkPostModal
          open={bulkModalOpen}
          billIds={[...selectedIds].filter((id) => approvedRows.some((r) => r.id === id))}
          gateways={gateways}
          onClose={() => setBulkModalOpen(false)}
          onComplete={handleBulkComplete}
        />
      ) : null}
    </PageTransition>
  )
}
