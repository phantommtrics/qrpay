import { ChartAccountCategory, ChartAccountKind, ChartAccountType, Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import {
  CHART_CODE_CASH_ON_HAND,
  CHART_CODE_MERCHANT_WALLET_CLEARING,
  CHART_CODE_MOBILE_MONEY,
  CHART_CODE_PLATFORM_FUND_TRANSFERS,
  CHART_CODE_WAVE_MERCHANT_PAYOUTS,
  ensureDefaultChartOfAccountsForBusiness,
} from "./chart-of-accounts.service.js";
import { pnlSectionForType, resolveChartAccountType } from "./chart-account-type.js";

function signedBalance(
  category: ChartAccountCategory,
  debits: Prisma.Decimal,
  credits: Prisma.Decimal,
): number {
  const d = new Prisma.Decimal(debits);
  const c = new Prisma.Decimal(credits);
  if (category === ChartAccountCategory.ASSET || category === ChartAccountCategory.EXPENSE) {
    return Number(d.minus(c));
  }
  return Number(c.minus(d));
}

export type AccountingAccountRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: ChartAccountCategory;
  accountType: ChartAccountType;
  balance: number;
  isSystem: boolean;
  kind: ChartAccountKind;
  bankAccountNumber: string | null;
  bankName: string | null;
  bankDetails: string | null;
};

export type AccountingPnl = {
  /** All revenue-category balances, including other income. Dashboard rollup. */
  income: number;
  /** Revenue and sales account types (excludes other income). */
  tradingIncome: number;
  otherIncome: number;
  costOfSales: number;
  operatingExpenses: number;
  grossProfit: number;
  netProfit: number;
};

export type AccountingTrendPoint = {
  period: string;
  income: number;
  expenses: number;
};

async function buildMonthlyTrend(businessId: string): Promise<AccountingTrendPoint[]> {
  const now = new Date();
  const points: AccountingTrendPoint[] = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const anchor = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1, 0, 0, 0, 0),
    );
    const next = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1, 0, 0, 0, 0));

    const lines = await prisma.journalLine.findMany({
      where: {
        journalEntry: {
          businessId,
          postedAt: { gte: anchor, lt: next },
        },
      },
      include: { chartOfAccount: true },
    });

    let income = 0;
    let expenses = 0;
    for (const line of lines) {
      const cat = line.chartOfAccount.category;
      const dr = Number(line.debitAmount);
      const cr = Number(line.creditAmount);
      if (cat === ChartAccountCategory.REVENUE) {
        income += cr - dr;
      } else if (cat === ChartAccountCategory.EXPENSE) {
        expenses += dr - cr;
      }
    }

    points.push({
      period: anchor.toLocaleString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
      income,
      expenses,
    });
  }

  return points;
}

/**
 * Ledger balances from posted journal lines + P&amp;L rollups for the accounting UI.
 */
export async function getAccountingSummaryForBusiness(businessId: string) {
  await ensureDefaultChartOfAccountsForBusiness(prisma, businessId);

  const accountsRaw = await prisma.chartOfAccount.findMany({
    where: { businessId },
    orderBy: [{ category: "asc" }, { code: "asc" }],
  });

  const sums = await prisma.journalLine.groupBy({
    by: ["chartOfAccountId"],
    where: { journalEntry: { businessId } },
    _sum: { debitAmount: true, creditAmount: true },
  });
  const sumByAccount = new Map(
    sums.map((s) => [
      s.chartOfAccountId,
      {
        debits: s._sum.debitAmount ?? new Prisma.Decimal(0),
        credits: s._sum.creditAmount ?? new Prisma.Decimal(0),
      },
    ]),
  );

  const accounts: AccountingAccountRow[] = accountsRaw.map((a) => {
    const agg = sumByAccount.get(a.id);
    const debits = agg?.debits ?? new Prisma.Decimal(0);
    const credits = agg?.credits ?? new Prisma.Decimal(0);
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      description: a.description ?? null,
      category: a.category,
      accountType: resolveChartAccountType(a),
      balance: signedBalance(a.category, debits, credits),
      isSystem: a.isSystem,
      kind: a.kind ?? ChartAccountKind.LEDGER,
      bankAccountNumber: a.bankAccountNumber ?? null,
      bankName: a.bankName ?? null,
      bankDetails: a.bankDetails ?? null,
    };
  });

  const cashCodeSet = new Set([
    CHART_CODE_CASH_ON_HAND,
    CHART_CODE_MERCHANT_WALLET_CLEARING,
    CHART_CODE_MOBILE_MONEY,
    CHART_CODE_WAVE_MERCHANT_PAYOUTS,
    CHART_CODE_PLATFORM_FUND_TRANSFERS,
  ]);
  const cashPositions = accounts.filter((a) => cashCodeSet.has(a.code));
  const cashTotal = cashPositions.reduce((s, a) => s + a.balance, 0);

  const tradingAccounts: AccountingAccountRow[] = [];
  const otherIncomeAccounts: AccountingAccountRow[] = [];
  const costOfGoodsSoldAccounts: AccountingAccountRow[] = [];
  const operatingExpenseAccounts: AccountingAccountRow[] = [];

  let tradingIncome = 0;
  let otherIncome = 0;
  let totalCogs = 0;
  let totalOpex = 0;

  for (const a of accounts) {
    const section = pnlSectionForType(a.accountType);
    if (section === "revenue") {
      tradingIncome += a.balance;
      tradingAccounts.push(a);
    } else if (section === "otherIncome") {
      otherIncome += a.balance;
      otherIncomeAccounts.push(a);
    } else if (section === "costOfSales") {
      totalCogs += a.balance;
      costOfGoodsSoldAccounts.push(a);
    } else if (section === "expenses") {
      totalOpex += a.balance;
      operatingExpenseAccounts.push(a);
    }
  }

  const totalIncome = tradingIncome + otherIncome;
  const grossProfit = totalIncome - totalCogs;
  const netProfit = grossProfit - totalOpex;

  const pnl: AccountingPnl = {
    income: totalIncome,
    tradingIncome,
    otherIncome,
    costOfSales: totalCogs,
    operatingExpenses: totalOpex,
    grossProfit,
    netProfit,
  };

  const trend = await buildMonthlyTrend(businessId);

  return {
    accounts,
    cashPositions,
    cashTotal,
    pnl,
    trend,
    incomeAccounts: tradingAccounts,
    otherIncomeAccounts,
    costOfGoodsSoldAccounts,
    operatingExpenseAccounts,
  };
}
