import { ChartAccountCategory, ChartAccountKind } from "@prisma/client";

import type { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { ensureDefaultChartOfAccountsForBusiness } from "./chart-of-accounts.service.js";

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

/** P&amp;L detail lines omit accounts with net zero activity in the period (includes float tolerance). */
function isNonZeroPnlAmount(amount: number): boolean {
  return Math.abs(amount) > 1e-9;
}

function isCogsAccount(code: string): boolean {
  const u = code.toUpperCase();
  return u === "310" || u === "COGS" || u.startsWith("COGS_");
}

/** GL / P&L / account statement: only approved journals, except customer sale POS/QR postings (exempt). Removed postings never count. */
export const merchantJournalReportingWhere: Prisma.JournalEntryWhereInput = {
  cancelledAt: null,
  OR: [{ journalApprovalExempt: true }, { approvedAt: { not: null } }],
};

export type GlBalanceRow = {
  chartOfAccountId: string;
  code: string;
  name: string;
  category: ChartAccountCategory;
  debitTotal: number;
  creditTotal: number;
  balance: number;
};

export async function getGlBalanceReport(businessId: string, asOfRaw: string) {
  await ensureDefaultChartOfAccountsForBusiness(prisma, businessId);
  const asOf = endOfUtcDay(parseYmdUtc(asOfRaw, "as of"));

  const accounts = await prisma.chartOfAccount.findMany({
    where: { businessId },
    orderBy: [{ category: "asc" }, { code: "asc" }],
  });

  const sums = await prisma.journalLine.groupBy({
    by: ["chartOfAccountId"],
    where: {
      journalEntry: {
        businessId,
        postedAt: { lte: asOf },
        ...merchantJournalReportingWhere,
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

  const rows: GlBalanceRow[] = accounts.map((a) => {
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

export type PnlLineRow = {
  chartOfAccountId: string;
  code: string;
  name: string;
  amount: number;
};

export async function getProfitLossReport(businessId: string, fromRaw: string, toRaw: string) {
  await ensureDefaultChartOfAccountsForBusiness(prisma, businessId);
  const from = parseYmdUtc(fromRaw, "from");
  const to = endOfUtcDay(parseYmdUtc(toRaw, "to"));
  if (from.getTime() > to.getTime()) {
    throw new HttpError(400, "From date must be on or before to date.");
  }

  const lines = await prisma.journalLine.findMany({
    where: {
      journalEntry: {
        businessId,
        postedAt: { gte: from, lte: to },
        ...merchantJournalReportingWhere,
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

  const pnlAccounts = await prisma.chartOfAccount.findMany({
    where: {
      businessId,
      category: { in: [ChartAccountCategory.REVENUE, ChartAccountCategory.EXPENSE] },
    },
    orderBy: [{ code: "asc" }],
  });

  const revenueLines: PnlLineRow[] = [];
  const cogsLines: PnlLineRow[] = [];
  const opexLines: PnlLineRow[] = [];

  for (const a of pnlAccounts) {
    const v = byAccount.get(a.id);
    const amount = v?.net ?? 0;
    if (!isNonZeroPnlAmount(amount)) {
      continue;
    }
    const row: PnlLineRow = {
      chartOfAccountId: a.id,
      code: a.code,
      name: a.name,
      amount,
    };
    if (a.category === ChartAccountCategory.REVENUE) {
      revenueLines.push(row);
    } else if (isCogsAccount(a.code)) {
      cogsLines.push(row);
    } else {
      opexLines.push(row);
    }
  }

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

export type BalanceSheetLine = {
  chartOfAccountId: string;
  code: string;
  name: string;
  amount: number;
};

function isNonZeroBsAmount(n: number): boolean {
  return Math.abs(n) > 1e-9;
}

/** Long-term debt / non-current — heuristic from code and name (e.g. LOAN, NC_*). */
function isNonCurrentLiability(code: string, name: string): boolean {
  const trimmed = code.trim();
  if (/^NC[_-]/i.test(trimmed)) {
    return true;
  }
  const t = `${code} ${name}`.toUpperCase();
  return /\b(LOAN|BORROWING|MORTGAGE|TERM\s*LOAN|LONG[\s-]*TERM|DEBENTURE)\b/.test(t);
}

/**
 * Statement of financial position: assets and liabilities from GL balances; equity reconciles to net assets
 * using posted equity accounts plus YTD P&amp;L and a residual for retained / prior periods.
 */
export async function getBalanceSheetReport(businessId: string, asOfRaw: string) {
  await ensureDefaultChartOfAccountsForBusiness(prisma, businessId);
  const asOf = endOfUtcDay(parseYmdUtc(asOfRaw, "as of"));

  const accounts = await prisma.chartOfAccount.findMany({
    where: { businessId },
    orderBy: [{ code: "asc" }],
  });

  const sums = await prisma.journalLine.groupBy({
    by: ["chartOfAccountId"],
    where: {
      journalEntry: {
        businessId,
        postedAt: { lte: asOf },
        ...merchantJournalReportingWhere,
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

  function signedBalance(a: { id: string; category: ChartAccountCategory }): number {
    const agg = sumBy.get(a.id) ?? { dr: 0, cr: 0 };
    return lineNetMovement(a.category, agg.dr, agg.cr);
  }

  const bankLines: BalanceSheetLine[] = [];
  const otherAssetLines: BalanceSheetLine[] = [];
  const currentLiabLines: BalanceSheetLine[] = [];
  const nonCurrentLiabLines: BalanceSheetLine[] = [];
  const equityGlLines: BalanceSheetLine[] = [];

  for (const a of accounts) {
    const bal = signedBalance(a);
    if (!isNonZeroBsAmount(bal)) {
      continue;
    }
    const row: BalanceSheetLine = {
      chartOfAccountId: a.id,
      code: a.code,
      name: a.name,
      amount: bal,
    };

    if (a.category === ChartAccountCategory.ASSET) {
      if (a.kind === ChartAccountKind.BANK) {
        bankLines.push(row);
      } else {
        otherAssetLines.push(row);
      }
    } else if (a.category === ChartAccountCategory.LIABILITY) {
      if (isNonCurrentLiability(a.code, a.name)) {
        nonCurrentLiabLines.push(row);
      } else {
        currentLiabLines.push(row);
      }
    } else if (a.category === ChartAccountCategory.EQUITY) {
      equityGlLines.push(row);
    }
  }

  const sumLines = (lines: BalanceSheetLine[]) => lines.reduce((s, r) => s + r.amount, 0);

  const bankSubtotal = sumLines(bankLines);
  const otherAssetsSubtotal = sumLines(otherAssetLines);
  const totalAssets = bankSubtotal + otherAssetsSubtotal;

  const currentLiabSubtotal = sumLines(currentLiabLines);
  const nonCurrentLiabSubtotal = sumLines(nonCurrentLiabLines);
  const totalLiabilities = currentLiabSubtotal + nonCurrentLiabSubtotal;

  const netAssets = totalAssets - totalLiabilities;

  const equityFromGl = sumLines(equityGlLines);

  const yearStartYmd = `${asOf.getUTCFullYear()}-01-01`;
  const asOfYmd = asOfRaw.trim();
  const pnlYtd = await getProfitLossReport(businessId, yearStartYmd, asOfYmd);
  const ytdNetIncome = pnlYtd.netProfit;

  const retainedAndOtherEquity = netAssets - equityFromGl - ytdNetIncome;
  const totalEquity = equityFromGl + ytdNetIncome + retainedAndOtherEquity;

  const equationResidual = Math.abs(netAssets - totalEquity);

  return {
    asOf: asOf.toISOString(),
    assets: {
      bank: { key: "bank", label: "Bank", lines: bankLines, subtotal: bankSubtotal },
      otherCurrentAssets: {
        key: "other_assets",
        label: "Other current assets",
        lines: otherAssetLines,
        subtotal: otherAssetsSubtotal,
      },
      total: totalAssets,
    },
    liabilities: {
      current: {
        key: "current_liab",
        label: "Current liabilities",
        lines: currentLiabLines,
        subtotal: currentLiabSubtotal,
      },
      nonCurrent: {
        key: "non_current_liab",
        label: "Non-current liabilities",
        lines: nonCurrentLiabLines,
        subtotal: nonCurrentLiabSubtotal,
      },
      total: totalLiabilities,
    },
    netAssets,
    equity: {
      glLines: equityGlLines,
      equityFromGl,
      ytdNetIncome,
      retainedAndOtherEquity,
      total: totalEquity,
      ytdRange: { from: pnlYtd.from, to: pnlYtd.to },
    },
    checks: {
      netAssetsEqualsEquity: equationResidual < 1e-6,
      equationResidual,
    },
  };
}

export type AccountStatementLine = {
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

export async function listChartAccountsForReports(businessId: string) {
  await ensureDefaultChartOfAccountsForBusiness(prisma, businessId);
  return prisma.chartOfAccount.findMany({
    where: { businessId },
    select: { id: true, code: true, name: true, category: true },
    orderBy: [{ code: "asc" }],
  });
}

export async function getAccountStatementReport(
  businessId: string,
  chartOfAccountId: string,
  fromRaw: string,
  toRaw: string,
) {
  await ensureDefaultChartOfAccountsForBusiness(prisma, businessId);
  const account = await prisma.chartOfAccount.findFirst({
    where: { id: chartOfAccountId, businessId },
  });
  if (!account) {
    throw new HttpError(404, "Account not found.");
  }

  const from = parseYmdUtc(fromRaw, "from");
  const to = endOfUtcDay(parseYmdUtc(toRaw, "to"));
  if (from.getTime() > to.getTime()) {
    throw new HttpError(400, "From date must be on or before to date.");
  }

  const openingLines = await prisma.journalLine.findMany({
    where: {
      chartOfAccountId,
      journalEntry: {
        businessId,
        postedAt: { lt: from },
        ...merchantJournalReportingWhere,
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

  const periodLines = await prisma.journalLine.findMany({
    where: {
      chartOfAccountId,
      journalEntry: {
        businessId,
        postedAt: { gte: from, lte: to },
        ...merchantJournalReportingWhere,
      },
    },
    include: {
      journalEntry: true,
    },
    orderBy: [{ journalEntry: { postedAt: "asc" } }, { id: "asc" }],
  });

  const out: AccountStatementLine[] = [];
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

const MAX_ACCOUNT_STATEMENT_BATCH = 40;

export async function getAccountStatementsReports(
  businessId: string,
  chartOfAccountIds: string[],
  fromRaw: string,
  toRaw: string,
) {
  const unique = [...new Set(chartOfAccountIds.filter(Boolean))];
  if (unique.length === 0) {
    throw new HttpError(400, "Select at least one account.");
  }
  if (unique.length > MAX_ACCOUNT_STATEMENT_BATCH) {
    throw new HttpError(
      400,
      `At most ${MAX_ACCOUNT_STATEMENT_BATCH} accounts per statement request.`,
    );
  }

  const results = await Promise.all(
    unique.map((id) => getAccountStatementReport(businessId, id, fromRaw, toRaw)),
  );
  results.sort((a, b) => a.account.code.localeCompare(b.account.code));
  return { statements: results };
}
