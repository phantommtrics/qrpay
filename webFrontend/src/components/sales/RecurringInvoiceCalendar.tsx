import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { salesInvoiceDetailPath } from '../../config/navigation'
import { ApiError } from '../../services/subscriptionApi'
import {
  fetchSalesInvoiceRecurrenceCalendar,
  type RecurringInvoiceCalendarDay,
} from '../../services/salesDocumentsApi'
import { formatMoney } from '../../utils/formatMoney'
import { recurrenceSummary } from './InvoiceRecurrenceFields'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function cellsForMonth(year: number, month: number): Array<{ date: string | null; day: number | null }> {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const startPad = first.getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cells: Array<{ date: string | null; day: number | null }> = []
  for (let i = 0; i < startPad; i++) cells.push({ date: null, day: null })
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ date, day: d })
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null })
  return cells
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
}

export function RecurringInvoiceCalendar({ businessId }: { businessId: string }) {
  const now = new Date()
  const [year, setYear] = useState(now.getUTCFullYear())
  const [month, setMonth] = useState(now.getUTCMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState<RecurringInvoiceCalendarDay[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days])
  const cells = useMemo(() => cellsForMonth(year, month), [year, month])
  const selectedDay = selected ? byDate.get(selected) : null
  const todayKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchSalesInvoiceRecurrenceCalendar(businessId, year, month)
      .then((data) => {
        if (cancelled) return
        setDays(data.days)
        const todayInMonth = data.days.find((d) => d.date === todayKey)
        setSelected((prev) => {
          if (prev && data.days.some((d) => d.date === prev)) return prev
          return todayInMonth?.date ?? data.days[0]?.date ?? null
        })
      })
      .catch((e) => {
        if (cancelled) return
        setDays([])
        setError(e instanceof ApiError ? e.message : 'Could not load recurring invoices.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [businessId, year, month, todayKey])

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1))
    setYear(d.getUTCFullYear())
    setMonth(d.getUTCMonth() + 1)
    setSelected(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-qb-heading">{monthLabel(year, month)}</h2>
          <p className="mt-1 text-sm text-qb-muted">
            Upcoming scheduled invoices and already issued recurring invoices this month.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-sm border border-qb-border bg-white p-2 text-qb-heading shadow-sm hover:bg-qb-surface"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setYear(now.getUTCFullYear())
              setMonth(now.getUTCMonth() + 1)
            }}
            className="rounded-sm border border-qb-border bg-white px-3 py-2 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="rounded-sm border border-qb-border bg-white p-2 text-qb-heading shadow-sm hover:bg-qb-surface"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded-sm border border-qb-border bg-white">
        <div className="grid min-w-[640px] grid-cols-7 border-b border-qb-border bg-qb-surface text-center text-[11px] font-semibold uppercase tracking-wide text-qb-muted">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2">
              {d}
            </div>
          ))}
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-qb-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading calendar…
          </div>
        ) : (
          <div className="grid min-w-[640px] grid-cols-7">
            {cells.map((cell, i) => {
              if (!cell.date) {
                return <div key={`pad-${i}`} className="min-h-[5.5rem] border-b border-r border-qb-border bg-qb-surface/40" />
              }
              const data = byDate.get(cell.date)
              const upcoming = data?.upcomingCount ?? 0
              const issued = data?.issuedCount ?? 0
              const total = upcoming + issued
              const isSelected = selected === cell.date
              const isToday = cell.date === todayKey
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => setSelected(cell.date)}
                  className={`min-h-[5.5rem] border-b border-r border-qb-border p-2 text-left transition ${
                    isSelected ? 'bg-teal-50' : 'bg-white hover:bg-qb-surface/60'
                  }`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday ? 'bg-teal-700 text-white' : 'text-qb-heading'
                    }`}
                  >
                    {cell.day}
                  </span>
                  {total > 0 ? (
                    <span className="mt-2 flex flex-wrap gap-1">
                      {upcoming > 0 ? (
                        <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800">
                          {upcoming} upcoming
                        </span>
                      ) : null}
                      {issued > 0 ? (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                          {issued} issued
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selectedDay && selectedDay.items.length > 0 ? (
        <div className="rounded-sm border border-qb-border bg-white p-4">
          <p className="text-sm font-semibold text-qb-heading">
            {new Date(`${selectedDay.date}T12:00:00.000Z`).toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone: 'UTC',
            })}
            <span className="ml-2 text-xs font-medium text-qb-muted">
              {selectedDay.upcomingCount} upcoming · {selectedDay.issuedCount} issued
            </span>
          </p>
          <ul className="mt-3 divide-y divide-qb-border">
            {selectedDay.items.map((item, idx) => (
              <li key={`${item.kind}-${item.recurrenceId}-${item.invoiceId ?? item.at}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="text-sm font-medium text-qb-heading">{item.contactName}</p>
                  <p className="text-xs text-qb-muted">
                    {item.kind === 'upcoming'
                      ? `${recurrenceSummary({ frequency: item.frequency, generateHour: new Date(item.at).getUTCHours(), generateMinute: new Date(item.at).getUTCMinutes() })} · ${formatTime(item.at)}`
                      : `${item.publicCode ?? 'Invoice'} · ${item.status}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums font-semibold text-qb-heading">
                    {formatMoney(item.amount, { decimals: 2 })} {item.currency}
                  </span>
                  {item.invoiceId ? (
                    <Link
                      to={salesInvoiceDetailPath(item.invoiceId)}
                      className="text-xs font-semibold text-teal-800 hover:text-teal-900"
                    >
                      Open
                    </Link>
                  ) : (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                      Scheduled
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : selected ? (
        <p className="text-sm text-qb-muted">No recurring invoices on this date.</p>
      ) : null}
    </div>
  )
}
