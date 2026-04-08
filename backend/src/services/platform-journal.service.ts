import { PlatformJournalSourceType, Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { ensureDefaultPlatformChartAccounts } from "./platform-chart-of-accounts.service.js";

function dec(n: number | string): Prisma.Decimal {
  return new Prisma.Decimal(typeof n === "number" && !Number.isFinite(n) ? 0 : n);
}

export async function listPlatformJournalEntries(pagination: { page: number; pageSize: number }) {
  await ensureDefaultPlatformChartAccounts(prisma);
  const pageSize = Math.min(100, Math.max(1, pagination.pageSize));
  const page = Math.max(1, pagination.page);
  const skip = (page - 1) * pageSize;

  const [total, rows] = await prisma.$transaction([
    prisma.platformJournalEntry.count(),
    prisma.platformJournalEntry.findMany({
      orderBy: [{ postedAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
      include: {
        lines: {
          include: { chartOfAccount: { select: { id: true, code: true, name: true, category: true } } },
        },
        reversedByPlatformEntry: { select: { id: true } },
        billFromPayment: { select: { id: true, publicCode: true } },
      },
    }),
  ]);

  return { total, page, pageSize, rows };
}

export type PlatformManualLineInput = {
  chartOfAccountId: string;
  debit: number;
  credit: number;
  description?: string | null;
};

export async function createPlatformManualJournal(input: {
  postedAt: string;
  memo?: string | null;
  reference?: string | null;
  lines: PlatformManualLineInput[];
}) {
  await ensureDefaultPlatformChartAccounts(prisma);

  if (!input.lines.length || input.lines.length < 2) {
    throw new HttpError(400, "At least two lines are required for a balanced journal.");
  }

  let dr = dec(0);
  let cr = dec(0);
  for (const ln of input.lines) {
    const d = dec(ln.debit);
    const c = dec(ln.credit);
    if (d.lt(0) || c.lt(0)) {
      throw new HttpError(400, "Debits and credits cannot be negative.");
    }
    if ((d.eq(0) && c.eq(0)) || (!d.eq(0) && !c.eq(0))) {
      throw new HttpError(400, "Each line must have either a debit or a credit, not both.");
    }
    dr = dr.add(d);
    cr = cr.add(c);
  }

  if (!dr.equals(cr)) {
    throw new HttpError(400, "Total debits must equal total credits.");
  }

  const postedAt = new Date(`${input.postedAt.trim()}T12:00:00.000Z`);
  if (Number.isNaN(postedAt.getTime())) {
    throw new HttpError(400, "Invalid posted date.");
  }

  const accountIds = [...new Set(input.lines.map((l) => l.chartOfAccountId))];
  const accounts = await prisma.platformChartOfAccount.findMany({
    where: { id: { in: accountIds } },
  });
  if (accounts.length !== accountIds.length) {
    throw new HttpError(400, "One or more chart accounts were not found.");
  }

  return prisma.platformJournalEntry.create({
    data: {
      postedAt,
      memo: input.memo?.trim() || null,
      reference: input.reference?.trim() || null,
      sourceType: PlatformJournalSourceType.MANUAL,
      lines: {
        create: input.lines.map((ln) => ({
          chartOfAccountId: ln.chartOfAccountId,
          debitAmount: dec(ln.debit),
          creditAmount: dec(ln.credit),
          description: ln.description?.trim() || null,
        })),
      },
    },
    include: {
      lines: { include: { chartOfAccount: true } },
    },
  });
}
