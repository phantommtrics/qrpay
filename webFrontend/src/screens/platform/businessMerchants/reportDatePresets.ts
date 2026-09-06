export type DatePreset = 'today' | 'current_quarter' | 'last_day' | 'last_week' | 'last_month' | 'custom'

export const PRESET_BUTTONS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'current_quarter', label: 'Current quarter' },
  { id: 'last_day', label: 'Last day' },
  { id: 'last_week', label: 'Last week' },
  { id: 'last_month', label: 'Last month' },
  { id: 'custom', label: 'Custom' },
]

function toYmdUTC(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function utcDay(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m, day))
}

function addUtcDays(d: Date, n: number): Date {
  const x = new Date(d.getTime())
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

function startOfUtcQuarter(d: Date): Date {
  const q = Math.floor(d.getUTCMonth() / 3)
  return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1))
}

export function presetRange(preset: DatePreset, ref: Date): { from: string; to: string } | null {
  if (preset === 'custom') return null
  const y = ref.getUTCFullYear()
  const m = ref.getUTCMonth()
  const day = ref.getUTCDate()
  const today = toYmdUTC(ref)

  if (preset === 'today') {
    return { from: today, to: today }
  }

  if (preset === 'last_day') {
    const yest = addUtcDays(utcDay(y, m, day), -1)
    const s = toYmdUTC(yest)
    return { from: s, to: s }
  }

  if (preset === 'last_week') {
    const end = addUtcDays(utcDay(y, m, day), -1)
    const start = addUtcDays(end, -6)
    return { from: toYmdUTC(start), to: toYmdUTC(end) }
  }

  if (preset === 'last_month') {
    const firstThisMonth = utcDay(y, m, 1)
    const lastPrev = addUtcDays(firstThisMonth, -1)
    const firstPrev = utcDay(lastPrev.getUTCFullYear(), lastPrev.getUTCMonth(), 1)
    return { from: toYmdUTC(firstPrev), to: toYmdUTC(lastPrev) }
  }

  if (preset === 'current_quarter') {
    const qs = startOfUtcQuarter(ref)
    return { from: toYmdUTC(qs), to: today }
  }

  return { from: today, to: today }
}

export function humanizeEnumToken(s: string): string {
  return s
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

export function channelPairLabel(method: string, provider: string): string {
  return `${humanizeEnumToken(method)} | ${humanizeEnumToken(provider)}`
}
