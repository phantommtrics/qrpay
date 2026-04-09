import type { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";

function parseYmdUtc(raw: string, label: string): Date {
  const d = new Date(`${raw.trim()}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, `Invalid ${label} date.`);
  }
  return d;
}

function endOfUtcDayFromYmd(raw: string): Date {
  const d = parseYmdUtc(raw, "date");
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
  );
}

export async function listMerchantJournalEntriesForPlatform(input: {
  page: number;
  pageSize: number;
  businessId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  const page = Math.max(1, input.page);
  const pageSize = Math.min(Math.max(1, input.pageSize), 100);
  const skip = (page - 1) * pageSize;

  const where: Prisma.JournalEntryWhereInput = {};
  if (input.businessId?.trim()) {
    where.businessId = input.businessId.trim();
  }
  if (input.from?.trim() || input.to?.trim()) {
    where.postedAt = {};
    if (input.from?.trim()) {
      where.postedAt.gte = parseYmdUtc(input.from.trim(), "from");
    }
    if (input.to?.trim()) {
      where.postedAt.lte = endOfUtcDayFromYmd(input.to.trim());
    }
  }

  const [total, rows] = await prisma.$transaction([
    prisma.journalEntry.count({ where }),
    prisma.journalEntry.findMany({
      where,
      orderBy: [{ postedAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
      include: {
        business: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        cancelledBy: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    rows,
  };
}

export async function getMerchantJournalEntryForPlatform(journalEntryId: string) {
  const row = await prisma.journalEntry.findFirst({
    where: { id: journalEntryId },
    include: {
      business: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      cancelledBy: { select: { id: true, name: true, email: true } },
      lines: {
        orderBy: { id: "asc" },
        include: {
          chartOfAccount: { select: { id: true, code: true, name: true, category: true } },
        },
      },
    },
  });
  if (!row) {
    throw new HttpError(404, "Journal entry not found.");
  }
  return row;
}

export async function approveMerchantJournalEntry(journalEntryId: string, approvedByUserId: string) {
  const existing = await prisma.journalEntry.findFirst({
    where: { id: journalEntryId },
    select: {
      id: true,
      journalApprovalExempt: true,
      approvedAt: true,
      cancelledAt: true,
    },
  });
  if (!existing) {
    throw new HttpError(404, "Journal entry not found.");
  }
  if (existing.cancelledAt) {
    throw new HttpError(400, "This posting was removed and cannot be approved.");
  }
  if (existing.journalApprovalExempt) {
    throw new HttpError(400, "This posting is exempt from approval.");
  }
  if (existing.approvedAt) {
    throw new HttpError(400, "This journal is already approved.");
  }
  return prisma.journalEntry.update({
    where: { id: journalEntryId },
    data: {
      approvedAt: new Date(),
      approvedByUserId,
    },
    include: {
      business: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      cancelledBy: { select: { id: true, name: true, email: true } },
      lines: {
        orderBy: { id: "asc" },
        include: {
          chartOfAccount: { select: { id: true, code: true, name: true, category: true } },
        },
      },
    },
  });
}

export async function cancelMerchantJournalEntry(journalEntryId: string, cancelledByUserId: string) {
  const existing = await prisma.journalEntry.findFirst({
    where: { id: journalEntryId },
    select: {
      id: true,
      journalApprovalExempt: true,
      approvedAt: true,
      cancelledAt: true,
    },
  });
  if (!existing) {
    throw new HttpError(404, "Journal entry not found.");
  }
  if (existing.journalApprovalExempt) {
    throw new HttpError(400, "Exempt postings cannot be removed here.");
  }
  if (existing.approvedAt) {
    throw new HttpError(400, "Approved journals cannot be removed. Use a reversal from journal entries.");
  }
  if (existing.cancelledAt) {
    throw new HttpError(400, "This posting was already removed.");
  }
  return prisma.journalEntry.update({
    where: { id: journalEntryId },
    data: {
      cancelledAt: new Date(),
      cancelledByUserId,
    },
    include: {
      business: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      cancelledBy: { select: { id: true, name: true, email: true } },
      lines: {
        orderBy: { id: "asc" },
        include: {
          chartOfAccount: { select: { id: true, code: true, name: true, category: true } },
        },
      },
    },
  });
}

/** Merchant UI: journals for a single business (plan entitlement `accounting.transaction_journal`). */
export async function listMerchantJournalEntriesForBusiness(
  businessId: string,
  input: {
    page: number;
    pageSize: number;
    from?: string | null;
    to?: string | null;
  },
) {
  return listMerchantJournalEntriesForPlatform({
    page: input.page,
    pageSize: input.pageSize,
    businessId,
    from: input.from,
    to: input.to,
  });
}

export async function getMerchantJournalEntryForBusiness(businessId: string, journalEntryId: string) {
  const row = await prisma.journalEntry.findFirst({
    where: { id: journalEntryId, businessId },
    include: {
      business: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      cancelledBy: { select: { id: true, name: true, email: true } },
      lines: {
        orderBy: { id: "asc" },
        include: {
          chartOfAccount: { select: { id: true, code: true, name: true, category: true } },
        },
      },
    },
  });
  if (!row) {
    throw new HttpError(404, "Journal entry not found.");
  }
  return row;
}

export async function approveMerchantJournalEntryForBusiness(
  businessId: string,
  journalEntryId: string,
  approvedByUserId: string,
) {
  const existing = await prisma.journalEntry.findFirst({
    where: { id: journalEntryId, businessId },
    select: {
      id: true,
      journalApprovalExempt: true,
      approvedAt: true,
      cancelledAt: true,
    },
  });
  if (!existing) {
    throw new HttpError(404, "Journal entry not found.");
  }
  if (existing.cancelledAt) {
    throw new HttpError(400, "This posting was removed and cannot be approved.");
  }
  if (existing.journalApprovalExempt) {
    throw new HttpError(400, "This posting is exempt from approval.");
  }
  if (existing.approvedAt) {
    throw new HttpError(400, "This journal is already approved.");
  }
  return prisma.journalEntry.update({
    where: { id: journalEntryId },
    data: {
      approvedAt: new Date(),
      approvedByUserId,
    },
    include: {
      business: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      cancelledBy: { select: { id: true, name: true, email: true } },
      lines: {
        orderBy: { id: "asc" },
        include: {
          chartOfAccount: { select: { id: true, code: true, name: true, category: true } },
        },
      },
    },
  });
}

export async function cancelMerchantJournalEntryForBusiness(
  businessId: string,
  journalEntryId: string,
  cancelledByUserId: string,
) {
  const existing = await prisma.journalEntry.findFirst({
    where: { id: journalEntryId, businessId },
    select: {
      id: true,
      journalApprovalExempt: true,
      approvedAt: true,
      cancelledAt: true,
    },
  });
  if (!existing) {
    throw new HttpError(404, "Journal entry not found.");
  }
  if (existing.journalApprovalExempt) {
    throw new HttpError(400, "Exempt postings cannot be removed here.");
  }
  if (existing.approvedAt) {
    throw new HttpError(400, "Approved journals cannot be removed. Use a reversal from journal entries.");
  }
  if (existing.cancelledAt) {
    throw new HttpError(400, "This posting was already removed.");
  }
  return prisma.journalEntry.update({
    where: { id: journalEntryId },
    data: {
      cancelledAt: new Date(),
      cancelledByUserId,
    },
    include: {
      business: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      cancelledBy: { select: { id: true, name: true, email: true } },
      lines: {
        orderBy: { id: "asc" },
        include: {
          chartOfAccount: { select: { id: true, code: true, name: true, category: true } },
        },
      },
    },
  });
}
