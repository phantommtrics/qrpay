import { ChartAccountCategory } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { ensureDefaultPlatformChartAccounts } from "./platform-chart-of-accounts.service.js";

function lineNetMovement(category: ChartAccountCategory, debit: number, credit: number): number {
  if (category === ChartAccountCategory.ASSET || category === ChartAccountCategory.EXPENSE) {
    return debit - credit;
  }
  return credit - debit;
}

function parseYmdUtc(raw: string, label: string): Date {
  const d = new Date(`${raw.trim()}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, `Invalid ${label} date.`);
  }
  return d;
}

function endOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
  );
}

function isCogsAccount(code: string): boolean {
  const u = code.toUpperCase();
  return u === "310" || u === "COGS" || u.startsWith("COGS_");
}

export type PlatformGlBalanceRow = {
  chartOfAccountId: string;
  code: string;
  name: string;
  category: ChartAccountCategory;
  debitTotal: number;
  creditTotal: number;
  balance: number;
};

export async function getPlatformGlBalanceReport(asOfRaw: string) {
  await ensureDefaultPlatformChartAccounts(prisma);
  const asOf = endOfUtcDay(parseYmdUtc(asOfRaw, "as of"));

  const accounts = await prisma.platformChartOfAccount.findMany({
    orderBy: [{ category: "asc" }, { code: "asc" }],
  });

  const sums = await prisma.platformJournalLine.groupBy({
    by: ["chartOfAccountId"],
    where: {
      journalEntry: {
        postedAt: { lte: asOf },
      },
    },
    _sum: { debitAmount: true, creditAmount: true },
  });
  const sumBy = new Map(
    sums.map((s) => [
      s.chartOfAccountId,
      {
        dr: Number(s._sum.debitAmount ?? 0),
        cr: Number(s._sum.creditAmount ?? 0),
      },
    ]),
  );

  const rows: PlatformGlBalanceRow[] = accounts.map((a) => {
    const agg = sumBy.get(a.id) ?? { dr: 0, cr: 0 };
    const balance = lineNetMovement(a.category, agg.dr, agg.cr);
    return {
      chartOfAccountId: a.id,
      code: a.code,
      name: a.name,
      category: a.category,
      debitTotal: agg.dr,
      creditTotal: agg.cr,
      balance,
    };
  });

  const totalDebit = rows.reduce((s, r) => s + r.debitTotal, 0);
  const totalCredit = rows.reduce((s, r) => s + r.creditTotal, 0);

  return {
    asOf: asOf.toISOString(),
    rows,
    totalDebit,
    totalCredit,
    difference: totalDebit - totalCredit,
  };
}

export type PlatformPnlLineRow = {
  chartOfAccountId: string;
  code: string;
  name: string;
  amount: number;
};

export async function getPlatformProfitLossReport(fromRaw: string, toRaw: string) {
  await ensureDefaultPlatformChartAccounts(prisma);
  const from = parseYmdUtc(fromRaw, "from");
  const to = endOfUtcDay(parseYmdUtc(toRaw, "to"));
  if (from.getTime() > to.getTime()) {
    throw new HttpError(400, "From date must be on or before to date.");
  }

  const lines = await prisma.platformJournalLine.findMany({
    where: {
      journalEntry: {
        postedAt: { gte: from, lte: to },
      },
      chartOfAccount: {
        category: { in: [ChartAccountCategory.REVENUE, ChartAccountCategory.EXPENSE] },
      },
    },
    include: { chartOfAccount: true },
  });

  const byAccount = new Map<
    string,
    { code: string; name: string; category: ChartAccountCategory; net: number }
  >();

  for (const line of lines) {
    const a = line.chartOfAccount;
    const dr = Number(line.debitAmount);
    const cr = Number(line.creditAmount);
    let delta = 0;
    if (a.category === ChartAccountCategory.REVENUE) {
      delta = cr - dr;
    } else {
      delta = dr - cr;
    }
    const prev = byAccount.get(a.id);
    if (prev) {
      prev.net += delta;
    } else {
      byAccount.set(a.id, { code: a.code, name: a.name, category: a.category, net: delta });
    }
  }

  const revenueLines: PlatformPnlLineRow[] = [];
  const cogsLines: PlatformPnlLineRow[] = [];
  const opexLines: PlatformPnlLineRow[] = [];

  for (const [chartOfAccountId, v] of byAccount) {
    if (v.category !== ChartAccountCategory.REVENUE && v.category !== ChartAccountCategory.EXPENSE) {
      continue;
    }
    const row: PlatformPnlLineRow = {
      chartOfAccountId,
      code: v.code,
      name: v.name,
      amount: v.net,
    };
    if (v.category === ChartAccountCategory.REVENUE) {
      revenueLines.push(row);
    } else if (isCogsAccount(v.code)) {
      cogsLines.push(row);
    } else {
      opexLines.push(row);
    }
  }

  revenueLines.sort((a, b) => a.code.localeCompare(b.code));
  cogsLines.sort((a, b) => a.code.localeCompare(b.code));
  opexLines.sort((a, b) => a.code.localeCompare(b.code));

  const totalRevenue = revenueLines.reduce((s, r) => s + r.amount, 0);
  const totalCogs = cogsLines.reduce((s, r) => s + r.amount, 0);
  const totalOpex = opexLines.reduce((s, r) => s + r.amount, 0);
  const grossProfit = totalRevenue - totalCogs;
  const netProfit = grossProfit - totalOpex;

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    revenue: { lines: revenueLines, total: totalRevenue },
    costOfSales: { lines: cogsLines, total: totalCogs },
    operatingExpenses: { lines: opexLines, total: totalOpex },
    grossProfit,
    netProfit,
  };
}

export type PlatformAccountStatementLine = {
  id: string;
  postedAt: string;
  journalEntryId: string;
  reference: string | null;
  memo: string | null;
  lineDescription: string | null;
  debit: number;
  credit: number;
  balance: number;
};

export async function listPlatformChartAccountsForReports() {
  await ensureDefaultPlatformChartAccounts(prisma);
  return prisma.platformChartOfAccount.findMany({
    select: { id: true, code: true, name: true, category: true },
    orderBy: [{ code: "asc" }],
  });
}

const MAX_PLATFORM_STATEMENT_BATCH = 40;

export async function getPlatformAccountStatementReport(
  chartOfAccountId: string,
  fromRaw: string,
  toRaw: string,
) {
  await ensureDefaultPlatformChartAccounts(prisma);
  const account = await prisma.platformChartOfAccount.findFirst({
    where: { id: chartOfAccountId },
  });
  if (!account) {
    throw new HttpError(404, "Account not found.");
  }

  const from = parseYmdUtc(fromRaw, "from");
  const to = endOfUtcDay(parseYmdUtc(toRaw, "to"));
  if (from.getTime() > to.getTime()) {
    throw new HttpError(400, "From date must be on or before to date.");
  }

  const openingLines = await prisma.platformJournalLine.findMany({
    where: {
      chartOfAccountId,
      journalEntry: {
        postedAt: { lt: from },
      },
    },
  });

  let opening = 0;
  for (const line of openingLines) {
    opening += lineNetMovement(
      account.category,
      Number(line.debitAmount),
      Number(line.creditAmount),
    );
  }

  const periodLines = await prisma.platformJournalLine.findMany({
    where: {
      chartOfAccountId,
      journalEntry: {
        postedAt: { gte: from, lte: to },
      },
    },
    include: {
      journalEntry: true,
    },
    orderBy: [{ journalEntry: { postedAt: "asc" } }, { id: "asc" }],
  });

  const out: PlatformAccountStatementLine[] = [];
  let running = opening;
  for (const line of periodLines) {
    const dr = Number(line.debitAmount);
    const cr = Number(line.creditAmount);
    running += lineNetMovement(account.category, dr, cr);
    const je = line.journalEntry;
    out.push({
      id: line.id,
      postedAt: je.postedAt.toISOString(),
      journalEntryId: je.id,
      reference: je.reference ?? null,
      memo: je.memo ?? null,
      lineDescription: line.description ?? null,
      debit: dr,
      credit: cr,
      balance: running,
    });
  }

  return {
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      category: account.category,
    },
    from: from.toISOString(),
    to: to.toISOString(),
    openingBalance: opening,
    closingBalance: running,
    lines: out,
  };
}

export async function getPlatformAccountStatementsReports(
  chartOfAccountIds: string[],
  fromRaw: string,
  toRaw: string,
) {
  const unique = [...new Set(chartOfAccountIds.filter(Boolean))];
  if (unique.length === 0) {
    throw new HttpError(400, "Select at least one account.");
  }
  if (unique.length > MAX_PLATFORM_STATEMENT_BATCH) {
    throw new HttpError(
      400,
      `At most ${MAX_PLATFORM_STATEMENT_BATCH} accounts per statement request.`,
    );
  }

  const results = await Promise.all(
    unique.map((id) => getPlatformAccountStatementReport(id, fromRaw, toRaw)),
  );
  results.sort((a, b) => a.account.code.localeCompare(b.account.code));
  return { statements: results };
}
