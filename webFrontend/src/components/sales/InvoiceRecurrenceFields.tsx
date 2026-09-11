export type SalesInvoiceRecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM'

export type InvoiceRecurrenceDraft = {
  frequency: '' | SalesInvoiceRecurrenceFrequency
  customMode: 'interval' | 'dates'
  intervalDays: string
  customDates: string[]
  endDate: string
  dateToAdd: string
  generateTime: string
}

export const emptyInvoiceRecurrenceDraft = (): InvoiceRecurrenceDraft => ({
  frequency: '',
  customMode: 'interval',
  intervalDays: '14',
  customDates: [],
  endDate: '',
  dateToAdd: '',
  generateTime: '08:00',
})

export function parseGenerateTime(raw: string): { generateHour: number; generateMinute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim())
  if (!m) return { generateHour: 8, generateMinute: 0 }
  return {
    generateHour: Math.min(23, Math.max(0, Number(m[1]))),
    generateMinute: Math.min(59, Math.max(0, Number(m[2]))),
  }
}

export function formatClock(hour?: number | null, minute?: number | null): string {
  const h = hour == null || !Number.isFinite(hour) ? 8 : Math.min(23, Math.max(0, Math.floor(hour)))
  const min = minute == null || !Number.isFinite(minute) ? 0 : Math.min(59, Math.max(0, Math.floor(minute)))
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function invoiceRecurrencePayload(draft: InvoiceRecurrenceDraft): {
  frequency: SalesInvoiceRecurrenceFrequency
  intervalDays?: number | null
  customDates?: string[] | null
  endDate?: string | null
  generateHour: number
  generateMinute: number
} | null {
  if (!draft.frequency) return null
  const clock = parseGenerateTime(draft.generateTime)
  if (draft.frequency !== 'CUSTOM') {
    return {
      frequency: draft.frequency,
      endDate: draft.endDate.trim() || null,
      ...clock,
    }
  }
  if (draft.customMode === 'dates') {
    if (draft.customDates.length < 1) return null
    return {
      frequency: 'CUSTOM',
      customDates: draft.customDates,
      endDate: draft.endDate.trim() || null,
      ...clock,
    }
  }
  const n = Number.parseInt(draft.intervalDays, 10)
  if (!Number.isFinite(n) || n < 1) return null
  return {
    frequency: 'CUSTOM',
    intervalDays: n,
    endDate: draft.endDate.trim() || null,
    ...clock,
  }
}

export function recurrenceSummary(input: {
  frequency: string
  intervalDays?: number | null
  customDates?: string[] | null
  nextIssueAt?: string | null
  generateHour?: number | null
  generateMinute?: number | null
}): string {
  const f = input.frequency.toUpperCase()
  const at = formatClock(input.generateHour, input.generateMinute)
  if (f === 'DAILY') return `Repeats daily at ${at}`
  if (f === 'WEEKLY') return `Repeats weekly at ${at}`
  if (f === 'MONTHLY') return `Repeats monthly at ${at}`
  if (input.customDates && input.customDates.length > 0) {
    return `Repeats on ${input.customDates.length} custom date${input.customDates.length === 1 ? '' : 's'} at ${at}`
  }
  if (input.intervalDays && input.intervalDays > 0) {
    return `Repeats every ${input.intervalDays} day${input.intervalDays === 1 ? '' : 's'} at ${at}`
  }
  return `Repeats on a custom schedule at ${at}`
}

const fieldInput =
  'w-full rounded-sm border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading placeholder:text-qb-muted/60 focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

const FREQS: Array<{ id: InvoiceRecurrenceDraft['frequency']; label: string; hint: string }> = [
  { id: '', label: 'Off', hint: 'One-off invoice' },
  { id: 'DAILY', label: 'Daily', hint: 'Every day' },
  { id: 'WEEKLY', label: 'Weekly', hint: 'Every 7 days' },
  { id: 'MONTHLY', label: 'Monthly', hint: 'Same day each month' },
  { id: 'CUSTOM', label: 'Custom', hint: 'Interval or dates' },
]

export function InvoiceRecurrenceFields({
  value,
  onChange,
  compact,
}: {
  value: InvoiceRecurrenceDraft
  onChange: (next: InvoiceRecurrenceDraft) => void
  compact?: boolean
}) {
  const set = (patch: Partial<InvoiceRecurrenceDraft>) => onChange({ ...value, ...patch })
  const addCustomDate = () => {
    const d = value.dateToAdd.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return
    if (value.customDates.includes(d)) {
      set({ dateToAdd: '' })
      return
    }
    set({
      customDates: [...value.customDates, d].sort(),
      dateToAdd: '',
    })
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4 rounded-md border border-qb-border bg-white p-4'}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Repeat</p>
        <p className="mt-1 text-sm text-qb-muted">
          Schedule future invoices automatically. The job runs at the time you set.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {FREQS.map((opt) => {
          const on = value.frequency === opt.id
          return (
            <button
              key={opt.id || 'off'}
              type="button"
              onClick={() => set({ frequency: opt.id })}
              className={`rounded-sm border px-3 py-2 text-left shadow-sm transition ${
                on
                  ? 'border-qb-primary bg-qb-surface text-qb-heading'
                  : 'border-qb-border bg-white text-qb-muted hover:border-qb-primary/40 hover:text-qb-heading'
              }`}
            >
              <span className="block text-sm font-semibold">{opt.label}</span>
              <span className="mt-0.5 block text-[11px] leading-tight">{opt.hint}</span>
            </button>
          )
        })}
      </div>
      {value.frequency ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
              Generate at
            </span>
            <input
              type="time"
              value={value.generateTime}
              onChange={(e) => set({ generateTime: e.target.value || '08:00' })}
              className={fieldInput}
            />
            <span className="block text-xs text-qb-muted">
              Invoices are created at this time on each scheduled date (GMT).
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
              End date (optional)
            </span>
            <input
              type="date"
              value={value.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
              className={fieldInput}
            />
          </label>
        </div>
      ) : null}
      {value.frequency === 'CUSTOM' ? (
        <div className="space-y-3 rounded-sm border border-qb-border bg-qb-surface/50 p-3">
          <div className="flex gap-1 rounded-sm border border-qb-border bg-white p-0.5">
            <button
              type="button"
              onClick={() => set({ customMode: 'interval' })}
              className={`flex-1 rounded-sm px-3 py-1.5 text-xs font-semibold ${
                value.customMode === 'interval' ? 'bg-qb-surface text-qb-heading' : 'text-qb-muted'
              }`}
            >
              Every N days
            </button>
            <button
              type="button"
              onClick={() => set({ customMode: 'dates' })}
              className={`flex-1 rounded-sm px-3 py-1.5 text-xs font-semibold ${
                value.customMode === 'dates' ? 'bg-qb-surface text-qb-heading' : 'text-qb-muted'
              }`}
            >
              Specific dates
            </button>
          </div>
          {value.customMode === 'interval' ? (
            <label className="block max-w-[14rem] space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                Repeat every
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={value.intervalDays}
                  onChange={(e) => set({ intervalDays: e.target.value })}
                  className={fieldInput}
                />
                <span className="text-sm text-qb-muted">days</span>
              </div>
            </label>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    Add date
                  </span>
                  <input
                    type="date"
                    value={value.dateToAdd}
                    onChange={(e) => set({ dateToAdd: e.target.value })}
                    className={fieldInput}
                  />
                </label>
                <button
                  type="button"
                  onClick={addCustomDate}
                  className="rounded-sm border border-qb-border bg-white px-3 py-2 text-xs font-semibold text-qb-heading shadow-sm hover:bg-qb-surface"
                >
                  Add date
                </button>
              </div>
              {value.customDates.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {value.customDates.map((d) => (
                    <li key={d}>
                      <button
                        type="button"
                        onClick={() =>
                          set({ customDates: value.customDates.filter((x) => x !== d) })
                        }
                        className="rounded-full border border-qb-border bg-white px-2.5 py-0.5 font-mono text-xs text-qb-heading hover:border-red-200 hover:text-red-700"
                      >
                        {d} ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-qb-muted">Pick each date this invoice should be issued.</p>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
