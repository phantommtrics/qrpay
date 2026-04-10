import { JournalSourceType, Prisma } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

function dec(v: Prisma.Decimal | number): Prisma.Decimal {
  return typeof v === "number" ? new Prisma.Decimal(v) : v;
}

const journalListInclude = {
  lines: {
    select: {
      id: true,
      debitAmount: true,
      creditAmount: true,
    },
  },
  _count: { select: { lines: true } },
} as const;

const journalDetailInclude = {
  lines: {
    orderBy: { id: "asc" as const },
    include: {
      chartOfAccount: { select: { id: true, code: true, name: true } },
    },
  },
  salesInvoiceFromPayment: { select: { id: true, publicCode: true } },
  billFromPayment: { select: { id: true, publicCode: true } },
  salesLedger: { select: { id: true }, take: 1 },
  reversedByEntry: { select: { id: true, postedAt: true } },
  reversesJournalEntry: { select: { id: true, postedAt: true } },
} as const;

function mapJournalListRow(row: {
  id: string;
  postedAt: Date;
  memo: string | null;
  reference: string | null;
  sourceType: JournalSourceType | null;
  sourceId: string | null;
  reversesJournalEntryId: string | null;
  lines: { debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal }[];
  _count: { lines: number };
}) {
  let dr = dec(0);
  let cr = dec(0);
  for (const ln of row.lines) {
    dr = dr.add(ln.debitAmount);
    cr = cr.add(ln.creditAmount);
  }
  return {
    id: row.id,
    postedAt: row.postedAt,
    memo: row.memo,
    reference: row.reference,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    lineCount: row._count.lines,
    totalDebit: Number(dr.toString()),
    totalCredit: Number(cr.toString()),
    reversesJournalEntryId: row.reversesJournalEntryId,
  };
}

/** `YYYY-MM-DD` → UTC day start / end for filtering `postedAt`. */
export function utcDayBoundsFromYmd(ymd: string): { start: Date; end: Date } {
  const t = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    throw new HttpError(400, "Date must be YYYY-MM-DD.");
  }
  return {
    start: new Date(`${t}T00:00:00.000Z`),
    end: new Date(`${t}T23:59:59.999Z`),
  };
}

export async function listJournalEntriesPaginated(
  businessId: string,
  input: {
    page: number;
    pageSize: number;
    startDate?: Date | null;
    endDate?: Date | null;
    sourceType?: JournalSourceType | null;
  },
) {
  const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
  const page = Math.max(input.page, 1);
  const skip = (page - 1) * pageSize;

  const where: Prisma.JournalEntryWhereInput = { businessId };

  if (input.startDate || input.endDate) {
    const postedAt: Prisma.DateTimeFilter = {};
    if (input.startDate) {
      postedAt.gte = input.startDate;
    }
    if (input.endDate) {
      postedAt.lte = input.endDate;
    }
    where.postedAt = postedAt;
  }

  if (input.sourceType) {
    where.sourceType = input.sourceType;
  }

  const [total, rows] = await prisma.$transaction([
    prisma.journalEntry.count({ where }),
    prisma.journalEntry.findMany({
      where,
      orderBy: { postedAt: "desc" },
      skip,
      take: pageSize,
      include: journalListInclude,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    entries: rows.map(mapJournalListRow),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getJournalEntryForReversalDetail(businessId: string, journalEntryId: string) {
  const row = await prisma.journalEntry.findFirst({
    where: { id: journalEntryId, businessId },
    include: journalDetailInclude,
  });
  if (!row) {
    throw new HttpError(404, "Journal entry not found.");
  }

  const blockReason = getReversalBlockReason(row);
  return { entry: row, canReverse: blockReason === null, blockReason };
}

function getReversalBlockReason(row: {
  reversesJournalEntryId: string | null;
  reversedByEntry: { id: string } | null;
  salesInvoiceFromPayment: { id: string } | null;
  billFromPayment: { id: string } | null;
  salesLedger: { id: string }[];
}): string | null {
  if (row.reversesJournalEntryId) {
    return "This entry is already a reversal; reverse the original journal instead if needed.";
  }
  if (row.reversedByEntry) {
    return "This journal entry has already been reversed.";
  }
  if (row.salesInvoiceFromPayment) {
    return "Entries linked to a sales invoice payment cannot be reversed here. Use invoice/bill workflows.";
  }
  if (row.billFromPayment) {
    return "Entries linked to a purchase bill payment cannot be reversed here. Use bill workflows.";
  }
  if (row.salesLedger.length > 0) {
    return "Entries tied to POS sales ledger activity cannot be reversed here.";
  }
  return null;
}

/**
 * Posts a new journal with swapped debits/credits on the same accounts/lines.
 */
export async function reverseJournalEntry(
  businessId: string,
  journalEntryId: string,
  input: { postedAt: Date; memo?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.journalEntry.findFirst({
      where: { id: journalEntryId, businessId },
      include: {
        lines: { orderBy: { id: "asc" } },
        salesInvoiceFromPayment: { select: { id: true } },
        billFromPayment: { select: { id: true } },
        salesLedger: { select: { id: true }, take: 1 },
        reversedByEntry: { select: { id: true } },
        reversesJournalEntry: { select: { id: true } },
      },
    });

    if (!original) {
      throw new HttpError(404, "Journal entry not found.");
    }

    const block = getReversalBlockReason({
      reversesJournalEntryId: original.reversesJournalEntryId,
      reversedByEntry: original.reversedByEntry,
      salesInvoiceFromPayment: original.salesInvoiceFromPayment,
      billFromPayment: original.billFromPayment,
      salesLedger: original.salesLedger,
    });
    if (block) {
      throw new HttpError(400, block);
    }

    if (!original.lines.length) {
      throw new HttpError(400, "Journal has no lines to reverse.");
    }

    const existingReversal = await tx.journalEntry.findFirst({
      where: { reversesJournalEntryId: original.id },
      select: { id: true },
    });
    if (existingReversal) {
      throw new HttpError(400, "This journal entry has already been reversed.");
    }

    const memoParts = [
      input.memo?.trim() || `Reversal of journal ${original.id.slice(0, 8)}…`,
      original.memo?.trim() ? `Original memo: ${original.memo.trim()}` : null,
    ].filter(Boolean);

    const reversal = await tx.journalEntry.create({
      data: {
        businessId,
        postedAt: input.postedAt,
        memo: memoParts.join(" | "),
        reference: original.reference?.trim() || null,
        contactId: original.contactId,
        sourceType: JournalSourceType.MANUAL_JOURNAL_REVERSAL,
        sourceId: original.id,
        reversesJournalEntryId: original.id,
        journalApprovalExempt: original.journalApprovalExempt,
        postedByPlatformUserId: original.postedByPlatformUserId,
        lines: {
          create: original.lines.map((ln) => {
            const desc = ln.description?.trim()
              ? `Reversal: ${ln.description.trim()}`
              : "Reversal of journal line";
            return {
              chartOfAccountId: ln.chartOfAccountId,
              debitAmount: ln.creditAmount,
              creditAmount: ln.debitAmount,
              description: desc.length > 4000 ? desc.slice(0, 4000) : desc,
              quantity: ln.quantity,
              unitLabel: ln.unitLabel,
              taxAmount: ln.taxAmount,
            };
          }),
        },
      },
      include: {
        lines: {
          include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
        },
      },
    });

    return reversal;
  });
}
