import type { BillingInterval } from "@prisma/client";

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

export function dueInDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function createInvoiceReference(prefix = "SUB") {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now()}-${random}`;
}

/** End of the billed service window (invoice line); contract-infinite uses a long horizon for paperwork only. */
export function billingPeriodEndFromStart(start: Date, interval: BillingInterval): Date {
  switch (interval) {
    case "MONTHLY":
      return addMonths(start, 1);
    case "QUARTERLY":
      return addMonths(start, 3);
    case "HALF_YEARLY":
      return addMonths(start, 6);
    case "YEARLY":
      return addYears(start, 1);
    case "TWO_YEARS":
      return addYears(start, 2);
    case "CONTRACT_INFINITE":
      return addYears(start, 25);
    default:
      return addMonths(start, 1);
  }
}
