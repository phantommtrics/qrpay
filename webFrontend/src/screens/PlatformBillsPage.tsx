import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS, platformBillDetailPath } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { ApiError, fetchPlatformBills, type PlatformBillRow } from '../services/subscriptionApi'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchPlatformBills()
        if (!cancelled) setRows(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Could not load bills.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PageTransition>
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
            {canManage ? (
              <Link
                to={APP_PATHS.platformBillNew}
                className="rounded-sm bg-qb-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              >
                New bill
              </Link>
            ) : null}
          </div>
        </PageCard>

        <PageCard variant="default" className="rounded-md border-qb-border p-5">
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {loading ? <p className="text-sm text-qb-muted">Loading…</p> : null}
          {!loading && rows.length === 0 ? (
            <p className="text-sm text-qb-muted">No platform bills yet.</p>
          ) : null}
          <div className="mt-4 space-y-2">
            {rows.map((r) => (
              <Link
                key={r.id}
                to={platformBillDetailPath(r.id)}
                className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-qb-border bg-white px-3 py-2 text-sm hover:bg-qb-surface/40"
              >
                <div>
                  <span className="font-mono font-medium text-qb-heading">{r.publicCode}</span>
                  <span className="ml-2 text-qb-muted">{r.supplier.name}</span>
                </div>
                <div className="text-right">
                  <span className="font-medium text-qb-heading">
                    {formatMoney(billTotal(r.lines))} {r.currency}
                  </span>
                  <span className="ml-2 text-xs uppercase text-qb-muted">{r.status}</span>
                </div>
              </Link>
            ))}
          </div>
        </PageCard>
      </div>
    </PageTransition>
  )
}
