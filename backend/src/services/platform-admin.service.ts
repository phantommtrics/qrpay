import {
  BillStatus,
  BillingLedgerEntryType,
  BillingLedgerStatus,
  BusinessOperationalStatus,
  ChartAccountCategory,
  ChartAccountKind,
  DigitalOceanInvoiceStatus,
  InvoiceStatus,
  ManualRefundReviewStatus,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import {
  ensureDefaultPlatformChartAccounts,
  PLATFORM_CHART_AGGREGATOR_WAVE_CLEARING,
  PLATFORM_CHART_SUBSCRIPTION_AR_PENDING,
  PLATFORM_CHART_SUBSCRIPTION_CLEARING,
} from "./platform-chart-of-accounts.service.js";
import { recordSubscriptionRefundBillingAndJournalTx } from "./platform-subscription-journal.service.js";
import {
  queueSubscriptionInvoiceRefundApprovedEmail,
  queueSubscriptionInvoiceRefundReviewEmail,
} from "./subscription-refund-review-email.service.js";

/** YYYY-MM-DD for the current UTC calendar day (server). */
export function utcTodayIsoDate(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function clampPage(page: number): number {
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

export function clampPageSize(size: number, max = 100): number {
  if (!Number.isFinite(size) || size < 1) {
    return 10;
  }
  return Math.min(max, Math.floor(size));
}

export function parseDateFilterDayStart(isoDay: string | undefined): Date | undefined {
  const t = isoDay?.trim();
  if (!t) {
    return undefined;
  }
  const d = new Date(`${t}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseDateFilterDayEnd(isoDay: string | undefined): Date | undefined {
  const t = isoDay?.trim();
  if (!t) {
    return undefined;
  }
  const d = new Date(`${t}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export type PlatformSubscriptionFilters = {
  status?: SubscriptionStatus;
  createdFrom?: Date;
  createdTo?: Date;
};

export type PlatformListPagination = {
  page: number;
  pageSize: number;
};

export async function listPlatformSubscriptions(
  filters: PlatformSubscriptionFilters,
  pagination: PlatformListPagination,
) {
  const where: Prisma.SubscriptionWhereInput = {};
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.createdFrom || filters.createdTo) {
    where.createdAt = {};
    if (filters.createdFrom) {
      where.createdAt.gte = filters.createdFrom;
    }
    if (filters.createdTo) {
      where.createdAt.lte = filters.createdTo;
    }
  }

  const skip = (pagination.page - 1) * pagination.pageSize;

  const [total, rows] = await prisma.$transaction([
    prisma.subscription.count({ where }),
    prisma.subscription.findMany({
      where,
      include: { business: true, plan: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: pagination.pageSize,
    }),
  ]);

  return { rows, total };
}

export type PlatformInvoiceFilters = {
  status?: InvoiceStatus;
  createdFrom?: Date;
  createdTo?: Date;
};

export async function listPlatformInvoices(
  filters: PlatformInvoiceFilters,
  pagination: PlatformListPagination,
) {
  const where: Prisma.SubscriptionInvoiceWhereInput = {};
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.createdFrom || filters.createdTo) {
    where.createdAt = {};
    if (filters.createdFrom) {
      where.createdAt.gte = filters.createdFrom;
    }
    if (filters.createdTo) {
      where.createdAt.lte = filters.createdTo;
    }
  }

  const skip = (pagination.page - 1) * pagination.pageSize;

  const [total, rows] = await prisma.$transaction([
    prisma.subscriptionInvoice.count({ where }),
    prisma.subscriptionInvoice.findMany({
      where,
      include: { business: true, plan: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: pagination.pageSize,
    }),
  ]);

  return { rows, total };
}

export async function getPlatformInvoiceDetail(invoiceId: string) {
  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      business: true,
      plan: true,
      subscription: true,
    },
  });
  if (!invoice) {
    throw new HttpError(404, "Invoice not found.");
  }
  return invoice;
}

export type PlatformBusinessDetailPagination = {
  membershipsPage: number;
  membershipsPageSize: number;
  subscriptionsPage: number;
  subscriptionsPageSize: number;
};

export async function getPlatformBusinessDetail(
  businessId: string,
  pagination: PlatformBusinessDetailPagination,
) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      slug: true,
      industry: true,
      ownerName: true,
      ownerEmail: true,
      createdAt: true,
      updatedAt: true,
      operationalStatus: true,
      statusReason: true,
      statusChangedAt: true,
      platformBillingWaived: true,
      partnerProvisioningExternalUserId: true,
      _count: {
        select: { memberships: true, products: true },
      },
    },
  });
  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

  const mSkip = (pagination.membershipsPage - 1) * pagination.membershipsPageSize;
  const sSkip = (pagination.subscriptionsPage - 1) * pagination.subscriptionsPageSize;

  const [membershipsTotal, subscriptionsTotal, memberships, subscriptions] =
    await prisma.$transaction([
      prisma.businessMembership.count({ where: { businessId } }),
      prisma.subscription.count({ where: { businessId } }),
      prisma.businessMembership.findMany({
        where: { businessId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
              createdAt: true,
              totpSecret: true,
              totpEnabledAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        skip: mSkip,
        take: pagination.membershipsPageSize,
      }),
      prisma.subscription.findMany({
        where: { businessId },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
        skip: sSkip,
        take: pagination.subscriptionsPageSize,
      }),
    ]);

  return {
    ...business,
    memberships,
    subscriptions,
    membershipsTotal,
    subscriptionsTotal,
  };
}

export type PlatformBusinessListFilters = {
  nameContains?: string;
  createdFrom?: Date;
  createdTo?: Date;
};

export async function listPlatformBusinessesPaginated(
  pagination: PlatformListPagination,
  filters: PlatformBusinessListFilters = {},
) {
  const where: Prisma.BusinessWhereInput = {};
  const nameQ = filters.nameContains?.trim();
  if (nameQ) {
    where.name = { contains: nameQ, mode: "insensitive" };
  }
  if (filters.createdFrom || filters.createdTo) {
    where.createdAt = {};
    if (filters.createdFrom) {
      where.createdAt.gte = filters.createdFrom;
    }
    if (filters.createdTo) {
      where.createdAt.lte = filters.createdTo;
    }
  }

  const skip = (pagination.page - 1) * pagination.pageSize;

  const [total, rows] = await prisma.$transaction([
    prisma.business.count({ where }),
    prisma.business.findMany({
      where,
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: {
          select: { memberships: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pagination.pageSize,
    }),
  ]);

  return { rows, total };
}

export type PlatformBillingReviewFilters = {
  invoiceStatus?: InvoiceStatus;
  refundReviewStatus?: ManualRefundReviewStatus;
};

/** Whole calendar days until subscription period end (negative if already ended). */
export function subscriptionDaysRemaining(periodEnd: Date): number {
  const ms = periodEnd.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export async function listPlatformBillingReview(
  filters: PlatformBillingReviewFilters,
  pagination: PlatformListPagination,
) {
  const where: Prisma.SubscriptionInvoiceWhereInput = {};
  if (filters.invoiceStatus) {
    where.status = filters.invoiceStatus;
  }
  if (filters.refundReviewStatus) {
    where.manualRefundReviewStatus = filters.refundReviewStatus;
  }

  const skip = (pagination.page - 1) * pagination.pageSize;

  const [total, rows] = await prisma.$transaction([
    prisma.subscriptionInvoice.count({ where }),
    prisma.subscriptionInvoice.findMany({
      where,
      include: {
        business: true,
        plan: true,
        subscription: true,
        ledgerEntries: {
          where: {
            type: BillingLedgerEntryType.INVOICE_PAYMENT,
            status: BillingLedgerStatus.SUCCEEDED,
          },
          orderBy: { succeededAt: "desc" },
          take: 1,
        },
        manualRefundReviewedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: pagination.pageSize,
    }),
  ]);

  return { rows, total };
}

/** Parse YYYY-MM-DD as noon UTC for consistent calendar-day storage. */
export function parseRefundExpectedByDay(isoDate: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) {
    throw new HttpError(400, "refundExpectedBy must be YYYY-MM-DD.");
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) {
    throw new HttpError(400, "refundExpectedBy is not a valid date.");
  }
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
}

export async function patchSubscriptionInvoiceManualRefundReview(input: {
  invoiceId: string;
  actorUserId: string;
  status: ManualRefundReviewStatus;
  note?: string | null;
  /** Required when status is APPROVED_FOR_REFUND (YYYY-MM-DD). */
  refundExpectedBy?: string | null;
  /** When APPROVED_FOR_REFUND: FULL (default) or PARTIAL. */
  refundAmountMode?: "FULL" | "PARTIAL";
  /** Required when refundAmountMode is PARTIAL. */
  refundPartialAmount?: number | null;
}) {
  const existing = await prisma.subscriptionInvoice.findUnique({
    where: { id: input.invoiceId },
  });
  if (!existing) {
    throw new HttpError(404, "Invoice not found.");
  }

  const prevStatus = existing.manualRefundReviewStatus;
  const isApproved = input.status === ManualRefundReviewStatus.APPROVED_FOR_REFUND;
  const isRefundedExternally = input.status === ManualRefundReviewStatus.REFUNDED_EXTERNALLY;

  if (isRefundedExternally) {
    if (existing.status !== InvoiceStatus.PAID) {
      throw new HttpError(400, "Only paid invoices can be recorded as refunded externally.");
    }
    if (prevStatus !== ManualRefundReviewStatus.APPROVED_FOR_REFUND) {
      throw new HttpError(
        400,
        "Approve the refund for this invoice before marking it as completed externally.",
      );
    }
  }

  let manualRefundExpectedBy: Date | null = null;
  let manualRefundApprovedAmount: Prisma.Decimal | null = null;

  if (isApproved) {
    if (!input.refundExpectedBy?.trim()) {
      throw new HttpError(400, "refundExpectedBy (YYYY-MM-DD) is required when approving a refund.");
    }
    manualRefundExpectedBy = parseRefundExpectedByDay(input.refundExpectedBy);

    const invDec = new Prisma.Decimal(existing.amount.toString());
    const mode = input.refundAmountMode ?? "FULL";
    if (mode === "PARTIAL") {
      if (input.refundPartialAmount === undefined || input.refundPartialAmount === null) {
        throw new HttpError(400, "refundPartialAmount is required for a partial refund.");
      }
      const part = new Prisma.Decimal(input.refundPartialAmount);
      if (part.lte(0) || part.gt(invDec)) {
        throw new HttpError(
          400,
          "Partial refund amount must be greater than zero and must not exceed the invoice amount.",
        );
      }
      manualRefundApprovedAmount = part;
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (isRefundedExternally) {
      const refundAmt = existing.manualRefundApprovedAmount ?? existing.amount;
      await recordSubscriptionRefundBillingAndJournalTx(tx, {
        invoiceId: input.invoiceId,
        businessId: existing.businessId,
        subscriptionId: existing.subscriptionId,
        amount: new Prisma.Decimal(refundAmt.toString()),
        currency: existing.currency,
      });
    }

    const preserveApprovedMeta = isRefundedExternally;

    return tx.subscriptionInvoice.update({
      where: { id: input.invoiceId },
      data: {
        manualRefundReviewStatus: input.status,
        manualRefundNote: input.note?.trim() ? input.note.trim() : null,
        manualRefundReviewedAt: new Date(),
        manualRefundReviewedByUserId: input.actorUserId,
        manualRefundExpectedBy: isApproved
          ? manualRefundExpectedBy
          : preserveApprovedMeta
            ? existing.manualRefundExpectedBy
            : null,
        manualRefundApprovedAmount: isApproved
          ? manualRefundApprovedAmount
          : preserveApprovedMeta
            ? existing.manualRefundApprovedAmount
            : null,
      },
      include: {
        business: true,
        plan: true,
        subscription: true,
        ledgerEntries: {
          where: {
            type: BillingLedgerEntryType.INVOICE_PAYMENT,
            status: BillingLedgerStatus.SUCCEEDED,
          },
          orderBy: { succeededAt: "desc" },
          take: 1,
        },
        manualRefundReviewedBy: { select: { id: true, name: true, email: true } },
      },
    });
  });

  if (prevStatus !== ManualRefundReviewStatus.PENDING_REVIEW && input.status === ManualRefundReviewStatus.PENDING_REVIEW) {
    queueSubscriptionInvoiceRefundReviewEmail(updated.id);
  }
  if (
    prevStatus !== ManualRefundReviewStatus.APPROVED_FOR_REFUND &&
    input.status === ManualRefundReviewStatus.APPROVED_FOR_REFUND
  ) {
    queueSubscriptionInvoiceRefundApprovedEmail(updated.id);
  }

  return updated;
}

export type PlatformDashboardRecentBusiness = {
  id: string;
  name: string;
  industry: string | null;
  ownerEmail: string;
  createdAt: string;
};

export type PlatformDashboardCashPosition = {
  id: string;
  code: string;
  name: string;
  balance: number;
};

export type PlatformDashboardPnl = {
  income: number;
  costOfSales: number;
  operatingExpenses: number;
  grossProfit: number;
  netProfit: number;
};

export type PlatformDashboardCashFlowPoint = {
  period: string;
  income: number;
  expenses: number;
};

export type PlatformDashboardDocumentSample = {
  id: string;
  publicCode: string;
  partyName: string;
  dueDate: string | null;
  amount: number;
  currency: string;
  overdue: boolean;
};

export type PlatformDashboardReceivablesPayables = {
  count: number;
  total: number;
  overdueCount: number;
  overdueTotal: number;
  samples: PlatformDashboardDocumentSample[];
};

export type PlatformDashboardExpenses = {
  operatingExpenses: number;
  billsToPayTotal: number;
};

export type PlatformDashboardJournalRow = {
  id: string;
  memo: string | null;
  reference: string | null;
  sourceType: string | null;
  postedAt: string;
};

export type PlatformDashboardJournals = {
  postedLast7Days: number;
  postedLast30Days: number;
  recent: PlatformDashboardJournalRow[];
};

export type PlatformDashboardTask = {
  id: string;
  label: string;
  count: number;
  href: string;
};

export type PlatformDashboardPaidInvoice = {
  id: string;
  publicCode: string;
  partyName: string;
  amount: number;
  currency: string;
  paidAt: string;
};

export type PlatformDashboardFinance = {
  cashTotal: number;
  cashPositions: PlatformDashboardCashPosition[];
  pnl: PlatformDashboardPnl;
  /** Month-to-date net profit from platform journals (UTC calendar month). */
  netProfitMtd: number;
  cashFlowTrend: PlatformDashboardCashFlowPoint[];
  /** Pending subscription invoices (money owed to DirectPay). */
  receivables: PlatformDashboardReceivablesPayables;
  /** Approved platform supplier bills. */
  payables: PlatformDashboardReceivablesPayables;
  expenses: PlatformDashboardExpenses;
  journals: PlatformDashboardJournals;
  tasks: PlatformDashboardTask[];
  recentPaidInvoices: PlatformDashboardPaidInvoice[];
};

export type PlatformDashboardSummary = {
  businessesTotal: number;
  businessesCreatedLast7Days: number;
  subscriptionsActive: number;
  subscriptionsTrialing: number;
  subscriptionsPastDue: number;
  invoicesPendingPayment: number;
  refundReviewsPending: number;
  recentBusinesses: PlatformDashboardRecentBusiness[];
  finance: PlatformDashboardFinance;
};

const DOCUMENT_SAMPLE_LIMIT = 5;
const RECENT_JOURNALS_LIMIT = 5;
const RECENT_PAID_LIMIT = 5;

const PLATFORM_CASH_CODES = new Set([
  PLATFORM_CHART_SUBSCRIPTION_CLEARING,
  PLATFORM_CHART_AGGREGATOR_WAVE_CLEARING,
  PLATFORM_CHART_SUBSCRIPTION_AR_PENDING,
]);

function utcStartOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function signedPlatformBalance(
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

function isPlatformCogsAccount(code: string): boolean {
  const u = code.toUpperCase();
  return u === "310" || u === "COGS" || u.startsWith("COGS_");
}

function billLineTotal(line: {
  quantity: Prisma.Decimal;
  unitAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
}): number {
  const t = line.taxAmount ?? new Prisma.Decimal(0);
  return Number(line.quantity.mul(line.unitAmount).add(t).toFixed(2));
}

function billLinesTotal(
  lines: Array<{
    quantity: Prisma.Decimal;
    unitAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
  }>,
): number {
  return lines.reduce((sum, line) => sum + billLineTotal(line), 0);
}

function isOverdue(dueDate: Date | null, todayStart: Date): boolean {
  if (!dueDate) return false;
  return dueDate < todayStart;
}

async function buildPlatformMonthlyTrend(): Promise<PlatformDashboardCashFlowPoint[]> {
  const now = new Date();
  const points: PlatformDashboardCashFlowPoint[] = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const anchor = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1, 0, 0, 0, 0),
    );
    const next = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1, 0, 0, 0, 0));

    const lines = await prisma.platformJournalLine.findMany({
      where: {
        journalEntry: {
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

async function buildPlatformFinanceSection(input: {
  subscriptionsPastDue: number;
  invoicesPendingPayment: number;
  refundReviewsPending: number;
}): Promise<PlatformDashboardFinance> {
  await ensureDefaultPlatformChartAccounts(prisma);

  const now = new Date();
  const todayStart = utcStartOfDay(now);
  const sevenDaysAgo = addUtcDays(todayStart, -7);
  const thirtyDaysAgo = addUtcDays(todayStart, -30);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

  const accountsRaw = await prisma.platformChartOfAccount.findMany({
    orderBy: [{ category: "asc" }, { code: "asc" }],
  });

  const sums = await prisma.platformJournalLine.groupBy({
    by: ["chartOfAccountId"],
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

  const accountBalances = accountsRaw.map((a) => {
    const agg = sumByAccount.get(a.id);
    const debits = agg?.debits ?? new Prisma.Decimal(0);
    const credits = agg?.credits ?? new Prisma.Decimal(0);
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      category: a.category,
      kind: a.kind ?? ChartAccountKind.LEDGER,
      balance: signedPlatformBalance(a.category, debits, credits),
    };
  });

  const cashPositions = accountBalances
    .filter(
      (a) =>
        a.category === ChartAccountCategory.ASSET &&
        (PLATFORM_CASH_CODES.has(a.code) || a.kind === ChartAccountKind.BANK),
    )
    .map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      balance: a.balance,
    }));
  const cashTotal = cashPositions.reduce((s, a) => s + a.balance, 0);

  let totalIncome = 0;
  let totalCogs = 0;
  let totalOpex = 0;
  for (const a of accountBalances) {
    if (a.category === ChartAccountCategory.REVENUE) {
      totalIncome += a.balance;
    } else if (a.category === ChartAccountCategory.EXPENSE) {
      if (isPlatformCogsAccount(a.code)) {
        totalCogs += a.balance;
      } else {
        totalOpex += a.balance;
      }
    }
  }
  const grossProfit = totalIncome - totalCogs;
  const netProfit = grossProfit - totalOpex;
  const pnl: PlatformDashboardPnl = {
    income: totalIncome,
    costOfSales: totalCogs,
    operatingExpenses: totalOpex,
    grossProfit,
    netProfit,
  };

  const mtdLines = await prisma.platformJournalLine.findMany({
    where: {
      journalEntry: { postedAt: { gte: monthStart } },
      chartOfAccount: {
        category: { in: [ChartAccountCategory.REVENUE, ChartAccountCategory.EXPENSE] },
      },
    },
    include: { chartOfAccount: true },
  });
  let mtdIncome = 0;
  let mtdCogs = 0;
  let mtdOpex = 0;
  for (const line of mtdLines) {
    const cat = line.chartOfAccount.category;
    const dr = Number(line.debitAmount);
    const cr = Number(line.creditAmount);
    if (cat === ChartAccountCategory.REVENUE) {
      mtdIncome += cr - dr;
    } else if (isPlatformCogsAccount(line.chartOfAccount.code)) {
      mtdCogs += dr - cr;
    } else {
      mtdOpex += dr - cr;
    }
  }
  const netProfitMtd = mtdIncome - mtdCogs - mtdOpex;

  const [
    pendingInvoices,
    approvedBills,
    draftBillCount,
    doUnpostedCount,
    journalsLast30,
    recentJournals,
    recentPaid,
    cashFlowTrend,
  ] = await Promise.all([
    prisma.subscriptionInvoice.findMany({
      where: { status: InvoiceStatus.PENDING },
      select: {
        id: true,
        amount: true,
        currency: true,
        dueDate: true,
        business: { select: { name: true } },
        plan: { select: { name: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.platformBill.findMany({
      where: { status: BillStatus.APPROVED },
      select: {
        id: true,
        publicCode: true,
        dueDate: true,
        currency: true,
        supplier: { select: { name: true } },
        lines: { select: { quantity: true, unitAmount: true, taxAmount: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.platformBill.count({ where: { status: BillStatus.DRAFT } }),
    prisma.digitalOceanInvoice.count({
      where: { status: DigitalOceanInvoiceStatus.SYNCED },
    }),
    prisma.platformJournalEntry.findMany({
      where: { postedAt: { gte: thirtyDaysAgo } },
      select: { id: true, postedAt: true },
    }),
    prisma.platformJournalEntry.findMany({
      orderBy: { postedAt: "desc" },
      take: RECENT_JOURNALS_LIMIT,
      select: {
        id: true,
        memo: true,
        reference: true,
        sourceType: true,
        postedAt: true,
      },
    }),
    prisma.subscriptionInvoice.findMany({
      where: { status: InvoiceStatus.PAID, paidAt: { not: null } },
      orderBy: { paidAt: "desc" },
      take: RECENT_PAID_LIMIT,
      select: {
        id: true,
        amount: true,
        currency: true,
        paidAt: true,
        business: { select: { name: true } },
        plan: { select: { name: true } },
      },
    }),
    buildPlatformMonthlyTrend(),
  ]);

  const receivablesSamples: PlatformDashboardDocumentSample[] = [];
  let receivablesTotal = 0;
  let overdueCount = 0;
  let overdueTotal = 0;
  const receivableMeta = pendingInvoices.map((inv) => {
    const amount = Number(inv.amount);
    const overdue = isOverdue(inv.dueDate, todayStart);
    receivablesTotal += amount;
    if (overdue) {
      overdueCount += 1;
      overdueTotal += amount;
    }
    return {
      id: inv.id,
      publicCode: inv.plan.name,
      partyName: inv.business.name,
      dueDate: inv.dueDate.toISOString(),
      amount,
      currency: inv.currency,
      overdue,
    };
  });
  receivablesSamples.push(
    ...[...receivableMeta]
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return 0;
      })
      .slice(0, DOCUMENT_SAMPLE_LIMIT),
  );

  const receivables: PlatformDashboardReceivablesPayables = {
    count: pendingInvoices.length,
    total: receivablesTotal,
    overdueCount,
    overdueTotal,
    samples: receivablesSamples,
  };

  let payablesTotal = 0;
  let payablesOverdueCount = 0;
  let payablesOverdueTotal = 0;
  const payableMeta = approvedBills.map((bill) => {
    const amount = billLinesTotal(bill.lines);
    const overdue = isOverdue(bill.dueDate, todayStart);
    payablesTotal += amount;
    if (overdue) {
      payablesOverdueCount += 1;
      payablesOverdueTotal += amount;
    }
    return {
      id: bill.id,
      publicCode: bill.publicCode,
      partyName: bill.supplier.name,
      dueDate: bill.dueDate?.toISOString() ?? null,
      amount,
      currency: bill.currency,
      overdue,
    };
  });
  const payables: PlatformDashboardReceivablesPayables = {
    count: approvedBills.length,
    total: payablesTotal,
    overdueCount: payablesOverdueCount,
    overdueTotal: payablesOverdueTotal,
    samples: [...payableMeta]
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      })
      .slice(0, DOCUMENT_SAMPLE_LIMIT),
  };

  const postedLast7Days = journalsLast30.filter((j) => j.postedAt >= sevenDaysAgo).length;
  const postedLast30Days = journalsLast30.length;

  const tasks: PlatformDashboardTask[] = [];
  if (input.subscriptionsPastDue > 0) {
    tasks.push({
      id: "past_due_subscriptions",
      label: "Past due subscriptions",
      count: input.subscriptionsPastDue,
      href: "/platform/subscriptions",
    });
  }
  if (input.invoicesPendingPayment > 0) {
    tasks.push({
      id: "pending_invoices",
      label: "Subscription invoices to collect",
      count: input.invoicesPendingPayment,
      href: "/platform/invoices",
    });
  }
  if (input.refundReviewsPending > 0) {
    tasks.push({
      id: "refund_reviews",
      label: "Refund reviews pending",
      count: input.refundReviewsPending,
      href: "/platform/billing-review",
    });
  }
  if (draftBillCount > 0) {
    tasks.push({
      id: "draft_bills",
      label: "Draft platform bills to finalise",
      count: draftBillCount,
      href: "/platform/bills",
    });
  }
  if (payables.overdueCount > 0) {
    tasks.push({
      id: "overdue_bills",
      label: "Overdue supplier bills",
      count: payables.overdueCount,
      href: "/platform/bills",
    });
  }
  if (doUnpostedCount > 0) {
    tasks.push({
      id: "digitalocean_unposted",
      label: "DigitalOcean invoices to review",
      count: doUnpostedCount,
      href: "/platform/digitalocean-billing",
    });
  }

  return {
    cashTotal,
    cashPositions,
    pnl,
    netProfitMtd,
    cashFlowTrend,
    receivables,
    payables,
    expenses: {
      operatingExpenses: totalOpex,
      billsToPayTotal: payables.total,
    },
    journals: {
      postedLast7Days,
      postedLast30Days,
      recent: recentJournals.map((j) => ({
        id: j.id,
        memo: j.memo,
        reference: j.reference,
        sourceType: j.sourceType,
        postedAt: j.postedAt.toISOString(),
      })),
    },
    tasks,
    recentPaidInvoices: recentPaid.map((inv) => ({
      id: inv.id,
      publicCode: inv.plan.name,
      partyName: inv.business.name,
      amount: Number(inv.amount),
      currency: inv.currency,
      paidAt: inv.paidAt!.toISOString(),
    })),
  };
}

/**
 * Aggregated KPIs for the platform operator home screen (one round-trip).
 */
export async function getPlatformDashboardSummary(): Promise<PlatformDashboardSummary> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    businessesTotal,
    businessesCreatedLast7Days,
    subscriptionsActive,
    subscriptionsTrialing,
    subscriptionsPastDue,
    invoicesPendingPayment,
    refundReviewsPending,
    recentBusinessRows,
  ] = await prisma.$transaction([
    prisma.business.count(),
    prisma.business.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } }),
    prisma.subscription.count({ where: { status: SubscriptionStatus.TRIALING } }),
    prisma.subscription.count({ where: { status: SubscriptionStatus.PAST_DUE } }),
    prisma.subscriptionInvoice.count({ where: { status: InvoiceStatus.PENDING } }),
    prisma.subscriptionInvoice.count({
      where: { manualRefundReviewStatus: ManualRefundReviewStatus.PENDING_REVIEW },
    }),
    prisma.business.findMany({
      take: 6,
      /** Newest sign-ups first; stable tie-break. Dashboard table must show ≤ 6 rows. */
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        name: true,
        industry: true,
        ownerEmail: true,
        createdAt: true,
      },
    }),
  ]);

  const finance = await buildPlatformFinanceSection({
    subscriptionsPastDue,
    invoicesPendingPayment,
    refundReviewsPending,
  });

  return {
    businessesTotal,
    businessesCreatedLast7Days,
    subscriptionsActive,
    subscriptionsTrialing,
    subscriptionsPastDue,
    invoicesPendingPayment,
    refundReviewsPending,
    recentBusinesses: recentBusinessRows.map((b) => ({
      id: b.id,
      name: b.name,
      industry: b.industry,
      ownerEmail: b.ownerEmail,
      createdAt: b.createdAt.toISOString(),
    })),
    finance,
  };
}

async function setBusinessOperationalStatus(input: {
  businessId: string;
  status: BusinessOperationalStatus;
  reason?: string | null;
  actorUserId: string;
  allowedFrom: BusinessOperationalStatus[];
  errorIfInvalid: string;
}) {
  const existing = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: {
      id: true,
      name: true,
      operationalStatus: true,
      partnerProvisioningExternalUserId: true,
    },
  });
  if (!existing) {
    throw new HttpError(404, "Business not found.");
  }
  if (!input.allowedFrom.includes(existing.operationalStatus)) {
    throw new HttpError(400, input.errorIfInvalid);
  }

  const updated = await prisma.business.update({
    where: { id: input.businessId },
    data: {
      operationalStatus: input.status,
      statusReason: input.reason?.trim() || null,
      statusChangedAt: new Date(),
      statusChangedByUserId: input.actorUserId,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      operationalStatus: true,
      statusReason: true,
      statusChangedAt: true,
      partnerProvisioningExternalUserId: true,
    },
  });

  return {
    ...updated,
    isInternalPartner: Boolean(updated.partnerProvisioningExternalUserId?.trim()),
    statusChangedAt: updated.statusChangedAt?.toISOString() ?? null,
  };
}

/** Freeze merchant + partner API access; reversible via unblock. */
export async function blockPlatformBusiness(input: {
  businessId: string;
  actorUserId: string;
  reason?: string | null;
}) {
  return setBusinessOperationalStatus({
    businessId: input.businessId,
    status: BusinessOperationalStatus.BLOCKED,
    reason: input.reason,
    actorUserId: input.actorUserId,
    allowedFrom: [BusinessOperationalStatus.ACTIVE],
    errorIfInvalid: "Only an active business can be blocked.",
  });
}

/** Return a blocked business to ACTIVE. */
export async function unblockPlatformBusiness(input: {
  businessId: string;
  actorUserId: string;
  reason?: string | null;
}) {
  return setBusinessOperationalStatus({
    businessId: input.businessId,
    status: BusinessOperationalStatus.ACTIVE,
    reason: input.reason ?? "Unblocked by platform admin",
    actorUserId: input.actorUserId,
    allowedFrom: [BusinessOperationalStatus.BLOCKED],
    errorIfInvalid: "Only a blocked business can be unblocked.",
  });
}

/**
 * Soft-delete the business. Owner user accounts remain; the org disappears from login
 * when they have no other non-terminated businesses.
 */
export async function terminatePlatformBusiness(input: {
  businessId: string;
  actorUserId: string;
  reason?: string | null;
}) {
  return setBusinessOperationalStatus({
    businessId: input.businessId,
    status: BusinessOperationalStatus.TERMINATED,
    reason: input.reason,
    actorUserId: input.actorUserId,
    allowedFrom: [BusinessOperationalStatus.ACTIVE, BusinessOperationalStatus.BLOCKED],
    errorIfInvalid: "This business is already terminated.",
  });
}

/** Restore a soft-deleted business to ACTIVE. */
export async function restorePlatformBusiness(input: {
  businessId: string;
  actorUserId: string;
  reason?: string | null;
}) {
  return setBusinessOperationalStatus({
    businessId: input.businessId,
    status: BusinessOperationalStatus.ACTIVE,
    reason: input.reason ?? "Restored by platform admin",
    actorUserId: input.actorUserId,
    allowedFrom: [BusinessOperationalStatus.TERMINATED],
    errorIfInvalid: "Only a terminated business can be restored.",
  });
}
