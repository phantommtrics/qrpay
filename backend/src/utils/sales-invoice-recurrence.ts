import { SalesInvoiceRecurrenceFrequency } from "@prisma/client";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function calendarDateAtNoonUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0));
}

export function addCalendarDaysUtc(d: Date, days: number): Date {
  const base = calendarDateAtNoonUtc(d);
  return new Date(base.getTime() + days * MS_PER_DAY);
}

export function addCalendarMonthsUtc(d: Date, months: number, dayOfMonth?: number): Date {
  const base = calendarDateAtNoonUtc(d);
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth() + months;
  const day = dayOfMonth && dayOfMonth >= 1 ? dayOfMonth : base.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0, 12, 0, 0, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last), 12, 0, 0, 0));
}

export function dueOffsetDays(issueDate: Date, dueDate: Date | null | undefined): number | null {
  if (!dueDate) return null;
  const a = calendarDateAtNoonUtc(issueDate).getTime();
  const b = calendarDateAtNoonUtc(dueDate).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

export function parseCustomDateKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const keys = raw
    .map((v) => String(v ?? "").trim().slice(0, 10))
    .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v));
  return [...new Set(keys)].sort();
}

export function dateKeyUtc(d: Date): string {
  return calendarDateAtNoonUtc(d).toISOString().slice(0, 10);
}

export function clampClock(hour?: number | null, minute?: number | null): {
  generateHour: number;
  generateMinute: number;
} {
  const generateHour =
    hour == null || !Number.isFinite(hour) ? 8 : Math.min(23, Math.max(0, Math.floor(hour)));
  const generateMinute =
    minute == null || !Number.isFinite(minute) ? 0 : Math.min(59, Math.max(0, Math.floor(minute)));
  return { generateHour, generateMinute };
}

/** Apply hour:minute on the calendar day of `d` (UTC / GMT). */
export function applyGenerateTime(d: Date, hour?: number | null, minute?: number | null): Date {
  const day = calendarDateAtNoonUtc(d);
  const { generateHour, generateMinute } = clampClock(hour, minute);
  return new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), generateHour, generateMinute, 0, 0),
  );
}

function dateFromKey(key: string): Date {
  const [y, m, day] = key.split("-").map((n) => Number(n));
  return new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1, 12, 0, 0, 0));
}

export function nextOccurrenceAfter(input: {
  from: Date;
  frequency: SalesInvoiceRecurrenceFrequency;
  intervalDays?: number | null;
  customDates?: unknown;
  monthDay?: number | null;
  generateHour?: number | null;
  generateMinute?: number | null;
}): Date | null {
  const from = calendarDateAtNoonUtc(input.from);
  let nextDay: Date | null = null;
  if (input.frequency === SalesInvoiceRecurrenceFrequency.CUSTOM) {
    const keys = parseCustomDateKeys(input.customDates);
    if (keys.length > 0) {
      const fromKey = dateKeyUtc(from);
      const nextKey = keys.find((k) => k > fromKey);
      nextDay = nextKey ? dateFromKey(nextKey) : null;
    } else {
      const n = input.intervalDays && input.intervalDays >= 1 ? input.intervalDays : 1;
      nextDay = addCalendarDaysUtc(from, n);
    }
  } else if (input.frequency === SalesInvoiceRecurrenceFrequency.DAILY) {
    nextDay = addCalendarDaysUtc(from, 1);
  } else if (input.frequency === SalesInvoiceRecurrenceFrequency.WEEKLY) {
    nextDay = addCalendarDaysUtc(from, 7);
  } else {
    nextDay = addCalendarMonthsUtc(from, 1, input.monthDay ?? from.getUTCDate());
  }
  if (!nextDay) return null;
  return applyGenerateTime(nextDay, input.generateHour, input.generateMinute);
}

export function occurrenceIsDue(nextIssueAt: Date, now: Date, endDate?: Date | null): boolean {
  if (nextIssueAt.getTime() > now.getTime()) return false;
  if (endDate && calendarDateAtNoonUtc(endDate).getTime() < calendarDateAtNoonUtc(nextIssueAt).getTime()) {
    return false;
  }
  return true;
}
