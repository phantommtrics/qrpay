import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Waves } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchWaveMerchantTransactionSummary,
  type WaveMerchantSummaryMoney,
  type WaveMerchantSummaryRow,
  type WaveMerchantTransactionSummary,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

const fieldInput =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600/30'

function todayYmd() {
  return new Date().toISOString().slice(0, 10)
}

function formatMoney(amount: string, currency: string) {
  const n = Number(amount)
  if (!Number.isFinite(n)) {
    return `${amount} ${currency}`
  }
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

function formatCountAmount(totals: WaveMerchantSummaryMoney) {
  if (totals.count === 0) {
    return '—'
  }
  return `${totals.count} · ${formatMoney(totals.totalAmount, totals.currency)}`
}

export function PlatformWaveOpsMerchantSummaryPage() {
  const { user, canAccess } = useAuth()
  const [from, setFrom] = useState(todayYmd)
  const [to, setTo] = useState(todayYmd)
  const [data, setData] = useState<WaveMerchantTransactionSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const summary = await fetchWaveMerchantTransactionSummary({ from, to })
      setData(summary)
      setExpanded(new Set())
    } catch (e) {
      setData(null)
      setError(e instanceof ApiError ? e.message : 'Could not load merchant summary.')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    if (!isPlatformOperator(user) || !canAccess('platform.wave_operations.view')) return
    void load()
  }, [user, canAccess, load])

  function toggleRow(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (!isPlatformOperator(user) || !canAccess('platform.wave_operations.view')) {
    return (
      <PageTransition className="space-y-6" withSlide>
        <PageCard className="p-6">
          <p className="text-slate-600">You do not have access to Wave operations.</p>
        </PageCard>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
          Platform · Wave operations
        </p>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-slate-900">
          <Waves className="h-8 w-8 text-teal-700" aria-hidden />
          Merchant summary
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Transaction count and totals by aggregated merchant and date. <strong>Wave</strong> is the
          parent wallet for the selected days (collections, payouts, and reversals).{' '}
          <strong>Local</strong> is completed DirectPay Wave checkouts only. The two will not match
          1:1.
        </p>
      </div>

      <PageCard className="p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-slate-700">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={fieldInput}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-slate-700">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={fieldInput}
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 px-3 py-3" />
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">DirectPay business</th>
                <th className="px-4 py-3">Wave</th>
                <th className="px-4 py-3">Local</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading from Wave and local payments…
                    </span>
                  </td>
                </tr>
              ) : null}
              {data && data.merchants.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No aggregated merchants in this range.
                  </td>
                </tr>
              ) : null}
              {data?.merchants.map((row) => (
                <MerchantSummaryRows
                  key={row.id}
                  row={row}
                  expanded={expanded.has(row.id)}
                  onToggle={() => toggleRow(row.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </PageCard>

      {data && data.unassignedWave.totals.count > 0 ? (
        <PageCard className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Wave unassigned</h2>
          <p className="mt-1 text-sm text-slate-600">
            Parent-wallet movements with no aggregated merchant id (payouts, refunds, or platform
            checkout). {formatCountAmount(data.unassignedWave.totals)}
          </p>
          <DayOnlyTable
            days={data.unassignedWave.days.map((d) => ({
              date: d.date,
              label: formatCountAmount(d.wave),
            }))}
          />
        </PageCard>
      ) : null}

      {data && (data.unlinkedLocal.totals.count > 0 || data.unlinkedLocal.businesses.length > 0) ? (
        <PageCard className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Local unlinked</h2>
          <p className="mt-1 text-sm text-slate-600">
            Completed DirectPay Wave payments whose business has no stored aggregated merchant id.{' '}
            {formatCountAmount(data.unlinkedLocal.totals)}
          </p>
          {data.unlinkedLocal.businesses.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {data.unlinkedLocal.businesses.map((b) => (
                <li key={b.id}>
                  {b.name} <span className="text-xs text-slate-500">({b.slug})</span>
                </li>
              ))}
            </ul>
          ) : null}
          <DayOnlyTable
            days={data.unlinkedLocal.days.map((d) => ({
              date: d.date,
              label: formatCountAmount(d.local),
            }))}
          />
        </PageCard>
      ) : null}
    </PageTransition>
  )
}

function MerchantSummaryRows({
  row,
  expanded,
  onToggle,
}: {
  row: WaveMerchantSummaryRow
  expanded: boolean
  onToggle: () => void
}) {
  const canExpand = row.days.length > 0
  return (
    <>
      <tr className="hover:bg-slate-50/80">
        <td className="px-3 py-3">
          {canExpand ? (
            <button
              type="button"
              onClick={onToggle}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse dates' : 'Expand dates'}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span className="block w-6" />
          )}
        </td>
        <td className="px-4 py-3">
          <p className="font-medium text-slate-900">{row.name}</p>
          <p className="font-mono text-xs text-slate-500">{row.id}</p>
        </td>
        <td className="px-4 py-3">
          {row.business ? (
            <div>
              <p className="font-medium text-slate-900">{row.business.name}</p>
              <p className="text-xs text-slate-500">{row.business.slug}</p>
            </div>
          ) : (
            <span className="text-xs text-amber-800">Not linked locally</span>
          )}
        </td>
        <td className="px-4 py-3 text-slate-800">{formatCountAmount(row.waveTotals)}</td>
        <td className="px-4 py-3 text-slate-800">{formatCountAmount(row.localTotals)}</td>
      </tr>
      {expanded
        ? row.days.map((day) => (
            <tr key={`${row.id}-${day.date}`} className="bg-slate-50/70 text-xs">
              <td />
              <td className="px-4 py-2 pl-10 font-medium text-slate-600">{day.date}</td>
              <td />
              <td className="px-4 py-2 text-slate-700">{formatCountAmount(day.wave)}</td>
              <td className="px-4 py-2 text-slate-700">{formatCountAmount(day.local)}</td>
            </tr>
          ))
        : null}
    </>
  )
}

function DayOnlyTable({ days }: { days: Array<{ date: string; label: string }> }) {
  if (days.length === 0) {
    return null
  }
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Count · total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {days.map((d) => (
            <tr key={d.date}>
              <td className="px-4 py-2 text-slate-700">{d.date}</td>
              <td className="px-4 py-2 text-slate-800">{d.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
