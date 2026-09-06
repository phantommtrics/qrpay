/** Local calendar date as `YYYY-MM-DD` (for `<input type="date">`). */
export function localCalendarIsoDate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** First day of the local calendar month as `YYYY-MM-DD`. */
export function localCalendarMonthStart(d = new Date()): string {
  return localCalendarIsoDate(new Date(d.getFullYear(), d.getMonth(), 1))
}

/** Last day of the local calendar month as `YYYY-MM-DD`. */
export function localCalendarMonthEnd(d = new Date()): string {
  return localCalendarIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}
