import {
  Prisma,
  SalesInvoiceRecurrenceFrequency,
  SalesInvoiceStatus,
} from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { newGuestToken } from "../lib/guest-token.js";
import { guestInvoiceShareUrl } from "../lib/public-guest-urls.js";
import { prisma } from "../lib/prisma.js";
import { allocateInvoicePublicCode } from "./sales-document-code.service.js";
import { queueSalesInvoiceApprovedEmail } from "./sales-invoice-email.service.js";
import {
  addCalendarDaysUtc,
  calendarDateAtNoonUtc,
  clampClock,
  dateKeyUtc,
  dueOffsetDays,
  nextOccurrenceAfter,
  occurrenceIsDue,
  parseCustomDateKeys,
} from "../utils/sales-invoice-recurrence.js";

const MAX_CATCH_UP = 12;

export type SalesInvoiceRecurrenceInput = {
  frequency: SalesInvoiceRecurrenceFrequency;
  intervalDays?: number | null;
  customDates?: string[] | null;
  endDate?: Date | null;
  generateHour?: number | null;
  generateMinute?: number | null;
};

export const recurrenceApiSelect = {
  id: true,
  publicToken: true,
  frequency: true,
  intervalDays: true,
  customDates: true,
  nextIssueAt: true,
  generateHour: true,
  generateMinute: true,
  endDate: true,
  active: true,
} as const;

async function mintRecurrenceToken(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = newGuestToken();
    const clash = await prisma.salesInvoiceRecurrence.findUnique({
      where: { publicToken: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new HttpError(500, "Could not create a recurring invoice link.");
}

export function normalizeRecurrenceInput(raw: SalesInvoiceRecurrenceInput): {
  frequency: SalesInvoiceRecurrenceFrequency;
  intervalDays: number | null;
  customDates: string[] | null;
  endDate: Date | null;
  generateHour: number;
  generateMinute: number;
} {
  const frequency = raw.frequency;
  const customDates = parseCustomDateKeys(raw.customDates);
  const intervalDays =
    raw.intervalDays != null && Number.isFinite(raw.intervalDays)
      ? Math.floor(Number(raw.intervalDays))
      : null;
  if (frequency === SalesInvoiceRecurrenceFrequency.CUSTOM) {
    if (customDates.length < 1 && (!intervalDays || intervalDays < 1)) {
      throw new HttpError(
        400,
        "Custom recurrence needs either specific dates or every N days.",
      );
    }
    if (intervalDays != null && intervalDays < 1) {
      throw new HttpError(400, "Custom interval must be at least 1 day.");
    }
  } else if (intervalDays != null) {
    throw new HttpError(400, "intervalDays is only used for custom recurrence.");
  }
  const clock = clampClock(raw.generateHour, raw.generateMinute);
  return {
    frequency,
    intervalDays: frequency === SalesInvoiceRecurrenceFrequency.CUSTOM && customDates.length < 1
      ? intervalDays
      : null,
    customDates: customDates.length > 0 ? customDates : null,
    endDate: raw.endDate ? calendarDateAtNoonUtc(raw.endDate) : null,
    generateHour: clock.generateHour,
    generateMinute: clock.generateMinute,
  };
}

function nextFromSchedule(
  from: Date,
  rec: {
    frequency: SalesInvoiceRecurrenceFrequency;
    intervalDays: number | null;
    customDates: Prisma.JsonValue | null;
    startDate: Date;
    generateHour?: number | null;
    generateMinute?: number | null;
  },
): Date | null {
  return nextOccurrenceAfter({
    from,
    frequency: rec.frequency,
    intervalDays: rec.intervalDays,
    customDates: rec.customDates,
    monthDay: calendarDateAtNoonUtc(rec.startDate).getUTCDate(),
    generateHour: rec.generateHour,
    generateMinute: rec.generateMinute,
  });
}

function formatOccurrenceReference(base: string | null, occurrence: Date): string | null {
  const stamp = calendarDateAtNoonUtc(occurrence).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const trimmed = base?.trim() || "";
  return trimmed ? `${trimmed} · ${stamp}` : stamp;
}

export function formatRecurrenceApi(row: {
  id: string;
  publicToken: string;
  frequency: string;
  intervalDays: number | null;
  customDates: Prisma.JsonValue | null;
  nextIssueAt: Date;
  generateHour?: number | null;
  generateMinute?: number | null;
  endDate: Date | null;
  active: boolean;
} | null | undefined) {
  if (!row) return null;
  const clock = clampClock(row.generateHour, row.generateMinute);
  return {
    id: row.id,
    frequency: row.frequency,
    intervalDays: row.intervalDays,
    customDates: parseCustomDateKeys(row.customDates),
    nextIssueAt: row.nextIssueAt.toISOString(),
    generateHour: clock.generateHour,
    generateMinute: clock.generateMinute,
    endDate: row.endDate?.toISOString() ?? null,
    active: row.active,
    publicUrl: guestInvoiceShareUrl(row.publicToken),
  };
}

export async function attachRecurrenceToNewInvoice(input: {
  businessId: string;
  invoiceId: string;
  issueDate: Date;
  dueDate?: Date | null;
  recurrence: SalesInvoiceRecurrenceInput;
}) {
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: input.invoiceId, businessId: input.businessId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) {
    throw new HttpError(404, "Invoice not found.");
  }
  const spec = normalizeRecurrenceInput(input.recurrence);
  const startDate = calendarDateAtNoonUtc(input.issueDate);
  const nextIssueAt = nextOccurrenceAfter({
    from: startDate,
    frequency: spec.frequency,
    intervalDays: spec.intervalDays,
    customDates: spec.customDates,
    monthDay: startDate.getUTCDate(),
    generateHour: spec.generateHour,
    generateMinute: spec.generateMinute,
  });
  if (!nextIssueAt && spec.customDates && spec.customDates.length > 0) {
    throw new HttpError(400, "Add at least one custom date after the issue date.");
  }
  const publicToken = await mintRecurrenceToken();
  await prisma.$transaction(async (tx) => {
    const rec = await tx.salesInvoiceRecurrence.create({
      data: {
        businessId: input.businessId,
        contactId: invoice.contactId,
        publicToken,
        currency: invoice.currency,
        settlementChartAccountId: invoice.settlementChartAccountId,
        reference: invoice.reference,
        dueOffsetDays: dueOffsetDays(input.issueDate, input.dueDate ?? invoice.dueDate),
        frequency: spec.frequency,
        intervalDays: spec.intervalDays,
        customDates: spec.customDates ?? undefined,
        startDate,
        endDate: spec.endDate,
        nextIssueAt: nextIssueAt ?? addCalendarDaysUtc(startDate, 36500),
        generateHour: spec.generateHour,
        generateMinute: spec.generateMinute,
        active: Boolean(nextIssueAt),
        templateLines: {
          create: invoice.lines.map((l, sortOrder) => ({
            chartOfAccountId: l.chartOfAccountId,
            narration: l.narration,
            quantity: l.quantity,
            unitLabel: l.unitLabel,
            unitAmount: l.unitAmount,
            taxAmount: l.taxAmount,
            sortOrder,
          })),
        },
      },
    });
    await tx.salesInvoice.update({
      where: { id: invoice.id },
      data: {
        recurrenceId: rec.id,
        occurrenceDate: startDate,
      },
    });
  });
}

export async function attachRecurrencesToShareBundle(input: {
  businessId: string;
  bundleId: string;
  invoiceIds: string[];
  recurrence: SalesInvoiceRecurrenceInput;
}) {
  const spec = normalizeRecurrenceInput(input.recurrence);
  const invoices = await prisma.salesInvoice.findMany({
    where: { businessId: input.businessId, id: { in: input.invoiceIds } },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  for (const invoice of invoices) {
    if (invoice.recurrenceId) {
      await prisma.salesInvoiceRecurrence.update({
        where: { id: invoice.recurrenceId },
        data: { shareBundleId: input.bundleId },
      });
      continue;
    }
    const startDate = calendarDateAtNoonUtc(invoice.issueDate);
    const nextIssueAt = nextOccurrenceAfter({
      from: startDate,
      frequency: spec.frequency,
      intervalDays: spec.intervalDays,
      customDates: spec.customDates,
      monthDay: startDate.getUTCDate(),
      generateHour: spec.generateHour,
      generateMinute: spec.generateMinute,
    });
    const publicToken = await mintRecurrenceToken();
    const rec = await prisma.salesInvoiceRecurrence.create({
      data: {
        businessId: input.businessId,
        contactId: invoice.contactId,
        publicToken,
        currency: invoice.currency,
        settlementChartAccountId: invoice.settlementChartAccountId,
        reference: invoice.reference,
        dueOffsetDays: dueOffsetDays(invoice.issueDate, invoice.dueDate),
        frequency: spec.frequency,
        intervalDays: spec.intervalDays,
        customDates: spec.customDates ?? undefined,
        startDate,
        endDate: spec.endDate,
        nextIssueAt: nextIssueAt ?? addCalendarDaysUtc(startDate, 36500),
        generateHour: spec.generateHour,
        generateMinute: spec.generateMinute,
        active: Boolean(nextIssueAt),
        shareBundleId: input.bundleId,
        templateLines: {
          create: invoice.lines.map((l, sortOrder) => ({
            chartOfAccountId: l.chartOfAccountId,
            narration: l.narration,
            quantity: l.quantity,
            unitLabel: l.unitLabel,
            unitAmount: l.unitAmount,
            taxAmount: l.taxAmount,
            sortOrder,
          })),
        },
      },
    });
    await prisma.salesInvoice.update({
      where: { id: invoice.id },
      data: {
        recurrenceId: rec.id,
        occurrenceDate: startDate,
      },
    });
  }
}

async function generateOccurrence(
  rec: {
    id: string;
    businessId: string;
    contactId: string;
    currency: string;
    settlementChartAccountId: string | null;
    reference: string | null;
    dueOffsetDays: number | null;
    autoApprove: boolean;
    shareBundleId: string | null;
    frequency: SalesInvoiceRecurrenceFrequency;
    intervalDays: number | null;
    customDates: Prisma.JsonValue | null;
    startDate: Date;
    endDate: Date | null;
    templateLines: Array<{
      chartOfAccountId: string;
      narration: string;
      quantity: Prisma.Decimal;
      unitLabel: string | null;
      unitAmount: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      sortOrder: number;
    }>;
  },
  occurrence: Date,
): Promise<string | null> {
  const occurrenceDay = calendarDateAtNoonUtc(occurrence);
  if (rec.endDate && calendarDateAtNoonUtc(rec.endDate).getTime() < occurrenceDay.getTime()) {
    return null;
  }
  if (!rec.templateLines.length) {
    return null;
  }
  const existing = await prisma.salesInvoice.findFirst({
    where: { recurrenceId: rec.id, occurrenceDate: occurrenceDay },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  const dueDate =
    rec.dueOffsetDays != null ? addCalendarDaysUtc(occurrenceDay, rec.dueOffsetDays) : null;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const publicCode = await allocateInvoicePublicCode(tx, rec.businessId);
      const invoice = await tx.salesInvoice.create({
        data: {
          businessId: rec.businessId,
          contactId: rec.contactId,
          publicCode,
          status: rec.autoApprove ? SalesInvoiceStatus.APPROVED : SalesInvoiceStatus.DRAFT,
          issueDate: occurrence,
          dueDate,
          reference: formatOccurrenceReference(rec.reference, occurrence),
          currency: rec.currency,
          settlementChartAccountId: rec.settlementChartAccountId,
          recurrenceId: rec.id,
          occurrenceDate: occurrenceDay,
          approvedAt: rec.autoApprove ? new Date() : null,
          guestToken: rec.autoApprove ? newGuestToken() : null,
          lines: {
            create: rec.templateLines.map((l) => ({
              chartOfAccountId: l.chartOfAccountId,
              narration: l.narration,
              quantity: l.quantity,
              unitLabel: l.unitLabel,
              unitAmount: l.unitAmount,
              taxAmount: l.taxAmount,
              sortOrder: l.sortOrder,
            })),
          },
        },
        select: { id: true, guestToken: true },
      });
      if (rec.shareBundleId && invoice.guestToken) {
        const maxSort = await tx.salesInvoiceShareBundleItem.aggregate({
          where: { bundleId: rec.shareBundleId },
          _max: { sortOrder: true },
        });
        await tx.salesInvoiceShareBundleItem.upsert({
          where: {
            bundleId_invoiceId: { bundleId: rec.shareBundleId, invoiceId: invoice.id },
          },
          create: {
            bundleId: rec.shareBundleId,
            invoiceId: invoice.id,
            sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
          },
          update: {},
        });
      }
      return invoice;
    });

    if (rec.autoApprove) {
      queueSalesInvoiceApprovedEmail(created.id);
    }
    return created.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await prisma.salesInvoice.findFirst({
        where: { recurrenceId: rec.id, occurrenceDate: occurrenceDay },
        select: { id: true },
      });
      return raced?.id ?? null;
    }
    throw err;
  }
}

export async function ensureRecurrenceInvoicesDue(recurrenceId: string, now = new Date()) {
  const rec = await prisma.salesInvoiceRecurrence.findUnique({
    where: { id: recurrenceId },
    include: { templateLines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!rec || !rec.active) {
    return { generated: 0 };
  }

  let generated = 0;
  let nextIssueAt: Date | null = rec.nextIssueAt;

  while (nextIssueAt && occurrenceIsDue(nextIssueAt, now, rec.endDate) && generated < MAX_CATCH_UP) {
    await generateOccurrence(rec, nextIssueAt);
    generated += 1;
    nextIssueAt = nextFromSchedule(nextIssueAt, rec);
  }

  const stillActive = Boolean(nextIssueAt) &&
    (!rec.endDate || (nextIssueAt && calendarDateAtNoonUtc(rec.endDate).getTime() >= calendarDateAtNoonUtc(nextIssueAt).getTime()));

  await prisma.salesInvoiceRecurrence.update({
    where: { id: rec.id },
    data: {
      nextIssueAt: nextIssueAt ?? rec.nextIssueAt,
      active: stillActive,
      lastGeneratedAt: generated > 0 ? new Date() : rec.lastGeneratedAt,
    },
  });

  return { generated };
}

export async function ensureShareBundleRecurrencesDue(bundleId: string) {
  const recs = await prisma.salesInvoiceRecurrence.findMany({
    where: { shareBundleId: bundleId, active: true },
    select: { id: true },
  });
  for (const rec of recs) {
    await ensureRecurrenceInvoicesDue(rec.id);
  }
}

export async function getGuestRecurrenceShare(publicToken: string) {
  await ensureRecurrenceInvoicesDueByToken(publicToken);
  const rec = await prisma.salesInvoiceRecurrence.findUnique({
    where: { publicToken },
    include: {
      business: { select: { name: true } },
      invoices: {
        where: { status: { not: SalesInvoiceStatus.DRAFT } },
        orderBy: { issueDate: "desc" },
        include: {
          contact: { select: { name: true } },
          lines: { select: { quantity: true, unitAmount: true, taxAmount: true } },
        },
      },
    },
  });
  return rec;
}

async function ensureRecurrenceInvoicesDueByToken(publicToken: string) {
  const rec = await prisma.salesInvoiceRecurrence.findUnique({
    where: { publicToken },
    select: { id: true },
  });
  if (rec) {
    await ensureRecurrenceInvoicesDue(rec.id);
  }
}

export async function runSalesInvoiceRecurrenceSweepOnce() {
  const due = await prisma.salesInvoiceRecurrence.findMany({
    where: {
      active: true,
      nextIssueAt: { lte: new Date() },
    },
    select: { id: true },
    take: 200,
    orderBy: { nextIssueAt: "asc" },
  });
  let generated = 0;
  for (const rec of due) {
    const result = await ensureRecurrenceInvoicesDue(rec.id);
    generated += result.generated;
  }
  return { scanned: due.length, generated };
}

function templateAmount(lines: Array<{ quantity: Prisma.Decimal; unitAmount: Prisma.Decimal; taxAmount: Prisma.Decimal }>) {
  return lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitAmount) + Number(line.taxAmount), 0);
}

export async function listSalesInvoiceRecurrenceCalendar(
  businessId: string,
  year: number,
  month: number,
) {
  const y = Number.isFinite(year) ? Math.floor(year) : new Date().getUTCFullYear();
  const m = Number.isFinite(month) ? Math.min(12, Math.max(1, Math.floor(month))) : new Date().getUTCMonth() + 1;
  const monthStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  const recs = await prisma.salesInvoiceRecurrence.findMany({
    where: { businessId, active: true },
    include: {
      contact: { select: { id: true, name: true } },
      templateLines: { select: { quantity: true, unitAmount: true, taxAmount: true } },
    },
  });

  const issued = await prisma.salesInvoice.findMany({
    where: {
      businessId,
      recurrenceId: { not: null },
      occurrenceDate: { gte: monthStart, lte: monthEnd },
      status: { not: SalesInvoiceStatus.VOID },
    },
    select: {
      id: true,
      publicCode: true,
      status: true,
      occurrenceDate: true,
      issueDate: true,
      currency: true,
      contact: { select: { name: true } },
      recurrenceId: true,
      lines: { select: { quantity: true, unitAmount: true, taxAmount: true } },
    },
  });

  const days = new Map<
    string,
    {
      date: string;
      upcomingCount: number;
      issuedCount: number;
      items: Array<{
        kind: "upcoming" | "issued";
        recurrenceId: string;
        invoiceId: string | null;
        contactName: string;
        amount: number;
        currency: string;
        frequency: string;
        at: string;
        status: string | null;
        publicCode: string | null;
      }>;
    }
  >();

  const bucket = (key: string) => {
    let row = days.get(key);
    if (!row) {
      row = { date: key, upcomingCount: 0, issuedCount: 0, items: [] };
      days.set(key, row);
    }
    return row;
  };

  for (const rec of recs) {
    let cursor: Date | null = rec.nextIssueAt;
    let guard = 0;
    while (cursor && guard < 400) {
      guard += 1;
      if (cursor.getTime() > monthEnd.getTime()) break;
      if (rec.endDate && calendarDateAtNoonUtc(rec.endDate).getTime() < calendarDateAtNoonUtc(cursor).getTime()) {
        break;
      }
      if (cursor.getTime() >= monthStart.getTime()) {
        const key = dateKeyUtc(cursor);
        const row = bucket(key);
        row.upcomingCount += 1;
        row.items.push({
          kind: "upcoming",
          recurrenceId: rec.id,
          invoiceId: null,
          contactName: rec.contact.name,
          amount: templateAmount(rec.templateLines),
          currency: rec.currency,
          frequency: rec.frequency,
          at: cursor.toISOString(),
          status: null,
          publicCode: null,
        });
      }
      cursor = nextFromSchedule(cursor, rec);
    }
  }

  for (const inv of issued) {
    const key = dateKeyUtc(inv.occurrenceDate ?? inv.issueDate);
    const row = bucket(key);
    row.issuedCount += 1;
    row.items.push({
      kind: "issued",
      recurrenceId: inv.recurrenceId ?? "",
      invoiceId: inv.id,
      contactName: inv.contact.name,
      amount: templateAmount(inv.lines),
      currency: inv.currency,
      frequency: "",
      at: inv.issueDate.toISOString(),
      status: inv.status,
      publicCode: inv.publicCode,
    });
  }

  return {
    year: y,
    month: m,
    days: [...days.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => ({
        ...row,
        items: row.items.sort((a, b) => a.at.localeCompare(b.at) || a.contactName.localeCompare(b.contactName)),
      })),
  };
}
