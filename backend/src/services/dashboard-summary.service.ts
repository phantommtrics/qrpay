import { BillStatus, Prisma, SalesInvoiceStatus } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { OrderStatus, PaymentStatus } from "../lib/prisma-sales-enums.js";
import { NOT_INTERNAL_PARTNER_CHECKOUT_PRODUCT } from "../lib/internal-partner-checkout.js";
import {
  getAccountingSummaryForBusiness,
  type AccountingPnl,
  type AccountingTrendPoint,
} from "./accounting-summary.service.js";
import {
  isPetrolStationIndustry,
  isRestaurantIndustry,
  isRetailOrWholesaleIndustry,
} from "./product.service.js";

const LOW_STOCK_THRESHOLD = 20;
const RECENT_ORDERS_LIMIT = 5;
const DOCUMENT_SAMPLE_LIMIT = 5;
const RECENT_JOURNALS_LIMIT = 5;
const RECENT_PAID_LIMIT = 5;

function utcStartOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function catalogEnabledForIndustry(industry: string | null): boolean {
  return (
    isRetailOrWholesaleIndustry(industry) ||
    isRestaurantIndustry(industry) ||
    isPetrolStationIndustry(industry)
  );
}

function lineAmount(line: {
  quantity: Prisma.Decimal;
  unitAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
}): number {
  const q = line.quantity;
  const u = line.unitAmount;
  const t = line.taxAmount ?? new Prisma.Decimal(0);
  return Number(q.mul(u).add(t).toFixed(2));
}

function linesTotal(
  lines: Array<{
    quantity: Prisma.Decimal;
    unitAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
  }>,
): number {
  return lines.reduce((sum, line) => sum + lineAmount(line), 0);
}

export type DashboardRecentOrder = {
  id: string;
  publicCode: string;
  total: number;
  currency: string;
  status: "pending_payment" | "paid" | "cancelled";
  createdAt: string;
  lineCount: number;
  tableLabel: string | null;
};

export type DashboardRevenueDay = {
  /** ISO date `YYYY-MM-DD` (UTC) */
  date: string;
  /** Label for charts, e.g. `Mon` */
  label: string;
  revenue: number;
};

export type DashboardCashPosition = {
  id: string;
  code: string;
  name: string;
  balance: number;
};

export type DashboardDocumentSample = {
  id: string;
  publicCode: string;
  contactName: string;
  dueDate: string | null;
  amount: number;
  currency: string;
  overdue: boolean;
};

export type DashboardReceivablesPayables = {
  count: number;
  total: number;
  overdueCount: number;
  overdueTotal: number;
  samples: DashboardDocumentSample[];
};

export type DashboardExpenses = {
  operatingExpenses: number;
  billsToPayTotal: number;
};

export type DashboardJournalRow = {
  id: string;
  memo: string | null;
  reference: string | null;
  sourceType: string | null;
  postedAt: string;
};

export type DashboardJournals = {
  postedLast7Days: number;
  postedLast30Days: number;
  recent: DashboardJournalRow[];
};

export type DashboardTask = {
  id: string;
  label: string;
  count: number;
  href: string;
};

export type DashboardPaidInvoice = {
  id: string;
  publicCode: string;
  contactName: string;
  amount: number;
  currency: string;
  paidAt: string;
};

export type DashboardFinance = {
  cashTotal: number;
  cashPositions: DashboardCashPosition[];
  pnl: AccountingPnl;
  cashFlowTrend: AccountingTrendPoint[];
  receivables: DashboardReceivablesPayables;
  payables: DashboardReceivablesPayables;
  expenses: DashboardExpenses;
  journals: DashboardJournals;
  tasks: DashboardTask[];
  recentPaidInvoices: DashboardPaidInvoice[];
};

export type DashboardSummary = {
  industry: string | null;
  catalogEnabled: boolean;
  /** Completed payment totals (GMD / business currency — uses payment rows). */
  revenueCompletedLast7Days: number;
  revenueCompletedPrior7Days: number;
  ordersCreatedToday: number;
  openOrdersCount: number;
  revenueByDayLast7: DashboardRevenueDay[];
  recentOrders: DashboardRecentOrder[];
  productCount: number | null;
  lowStockCount: number | null;
  finance: DashboardFinance;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabelUtc(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return DAY_LABELS[dt.getUTCDay()] ?? isoDate;
}

function isOverdue(dueDate: Date | null, todayStart: Date): boolean {
  if (!dueDate) return false;
  return dueDate < todayStart;
}

async function buildFinanceSection(
  businessId: string,
  openOrdersCount: number,
): Promise<DashboardFinance> {
  const todayStart = utcStartOfDay(new Date());
  const sevenDaysAgo = addUtcDays(todayStart, -7);
  const thirtyDaysAgo = addUtcDays(todayStart, -30);

  const accounting = await getAccountingSummaryForBusiness(businessId);

  const [approvedInvoices, approvedBills, draftInvoiceCount, draftBillCount, journalsLast30, recentJournals, recentPaid] =
    await Promise.all([
      prisma.salesInvoice.findMany({
        where: { businessId, status: SalesInvoiceStatus.APPROVED },
        select: {
          id: true,
          publicCode: true,
          dueDate: true,
          currency: true,
          contact: { select: { name: true } },
          lines: { select: { quantity: true, unitAmount: true, taxAmount: true } },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      }),
      prisma.bill.findMany({
        where: { businessId, status: BillStatus.APPROVED },
        select: {
          id: true,
          publicCode: true,
          dueDate: true,
          currency: true,
          contact: { select: { name: true } },
          lines: { select: { quantity: true, unitAmount: true, taxAmount: true } },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      }),
      prisma.salesInvoice.count({
        where: { businessId, status: SalesInvoiceStatus.DRAFT },
      }),
      prisma.bill.count({
        where: { businessId, status: BillStatus.DRAFT },
      }),
      prisma.journalEntry.findMany({
        where: {
          businessId,
          postedAt: { gte: thirtyDaysAgo },
          cancelledAt: null,
        },
        select: { id: true, postedAt: true },
      }),
      prisma.journalEntry.findMany({
        where: { businessId, cancelledAt: null },
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
      prisma.salesInvoice.findMany({
        where: {
          businessId,
          status: SalesInvoiceStatus.PAID,
          paidAt: { not: null },
        },
        orderBy: { paidAt: "desc" },
        take: RECENT_PAID_LIMIT,
        select: {
          id: true,
          publicCode: true,
          currency: true,
          paidAt: true,
          contact: { select: { name: true } },
          lines: { select: { quantity: true, unitAmount: true, taxAmount: true } },
        },
      }),
    ]);

  const mapBucket = (
    rows: Array<{
      id: string;
      publicCode: string;
      dueDate: Date | null;
      currency: string;
      contact: { name: string };
      lines: Array<{
        quantity: Prisma.Decimal;
        unitAmount: Prisma.Decimal;
        taxAmount: Prisma.Decimal;
      }>;
    }>,
  ): DashboardReceivablesPayables => {
    let total = 0;
    let overdueCount = 0;
    let overdueTotal = 0;
    const withMeta = rows.map((row) => {
      const amount = linesTotal(row.lines);
      const overdue = isOverdue(row.dueDate, todayStart);
      total += amount;
      if (overdue) {
        overdueCount += 1;
        overdueTotal += amount;
      }
      return {
        id: row.id,
        publicCode: row.publicCode,
        contactName: row.contact.name,
        dueDate: row.dueDate?.toISOString() ?? null,
        amount,
        currency: row.currency,
        overdue,
      };
    });
    const samples = [...withMeta]
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      })
      .slice(0, DOCUMENT_SAMPLE_LIMIT);

    return {
      count: rows.length,
      total,
      overdueCount,
      overdueTotal,
      samples,
    };
  };

  const receivables = mapBucket(approvedInvoices);
  const payables = mapBucket(approvedBills);

  const postedLast7Days = journalsLast30.filter((j) => j.postedAt >= sevenDaysAgo).length;
  const postedLast30Days = journalsLast30.length;

  const tasks: DashboardTask[] = [];
  if (draftInvoiceCount > 0) {
    tasks.push({
      id: "draft_invoices",
      label: "Draft invoices to finalise",
      count: draftInvoiceCount,
      href: "/sales/invoices",
    });
  }
  if (draftBillCount > 0) {
    tasks.push({
      id: "draft_bills",
      label: "Draft bills to finalise",
      count: draftBillCount,
      href: "/sales/bills",
    });
  }
  if (receivables.overdueCount > 0) {
    tasks.push({
      id: "overdue_invoices",
      label: "Overdue invoices to chase",
      count: receivables.overdueCount,
      href: "/sales/invoices",
    });
  }
  if (payables.overdueCount > 0) {
    tasks.push({
      id: "overdue_bills",
      label: "Overdue bills to pay",
      count: payables.overdueCount,
      href: "/sales/bills",
    });
  }
  if (openOrdersCount > 0) {
    tasks.push({
      id: "awaiting_payment_orders",
      label: "Orders awaiting payment",
      count: openOrdersCount,
      href: "/orders",
    });
  }

  return {
    cashTotal: accounting.cashTotal,
    cashPositions: accounting.cashPositions.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      balance: p.balance,
    })),
    pnl: accounting.pnl,
    cashFlowTrend: accounting.trend,
    receivables,
    payables,
    expenses: {
      operatingExpenses: accounting.pnl.operatingExpenses,
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
      publicCode: inv.publicCode,
      contactName: inv.contact.name,
      amount: linesTotal(inv.lines),
      currency: inv.currency,
      paidAt: inv.paidAt!.toISOString(),
    })),
  };
}

export async function getDashboardSummaryForBusiness(businessId: string): Promise<DashboardSummary> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { industry: true },
  });

  const industry = business?.industry?.trim() || null;
  const catalogEnabled = catalogEnabledForIndustry(industry);

  const now = new Date();
  const todayStart = utcStartOfDay(now);
  const tomorrowStart = addUtcDays(todayStart, 1);
  const sevenDaysAgo = addUtcDays(todayStart, -7);
  const fourteenDaysAgo = addUtcDays(todayStart, -14);

  const [ordersCreatedToday, openOrdersCount, recentOrderRows, revenueLast7Rows, revenuePrior7] =
    await prisma.$transaction([
      prisma.order.count({
        where: {
          businessId,
          createdAt: { gte: todayStart, lt: tomorrowStart },
        },
      }),
      prisma.order.count({
        where: { businessId, status: OrderStatus.PENDING_PAYMENT },
      }),
      prisma.order.findMany({
        where: { businessId },
        orderBy: { createdAt: "desc" },
        take: RECENT_ORDERS_LIMIT,
        select: {
          id: true,
          publicCode: true,
          total: true,
          currency: true,
          status: true,
          createdAt: true,
          tableLabelSnapshot: true,
          diningTable: { select: { label: true } },
          lines: { select: { id: true } },
        },
      }),
      prisma.$queryRaw<Array<{ day: Date; revenue: Prisma.Decimal }>>(
        Prisma.sql`
        SELECT date_trunc('day', p."completedAt" AT TIME ZONE 'UTC')::date AS day,
               COALESCE(SUM(p.amount), 0)::decimal AS revenue
        FROM "Payment" p
        WHERE p."businessId" = ${businessId}
          AND p.status = 'COMPLETED'::"PaymentStatus"
          AND p."completedAt" IS NOT NULL
          AND p."completedAt" >= ${sevenDaysAgo}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      ),
      prisma.payment.aggregate({
        where: {
          businessId,
          status: PaymentStatus.COMPLETED,
          completedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
        },
        _sum: { amount: true },
      }),
    ]);

  let productCount: number | null = null;
  let lowStockCount: number | null = null;
  if (catalogEnabled) {
    const products = await prisma.product.findMany({
      where: { businessId, ...NOT_INTERNAL_PARTNER_CHECKOUT_PRODUCT },
      select: { stock: true, reservedStock: true },
    });
    productCount = products.length;
    if (isPetrolStationIndustry(industry)) {
      lowStockCount = null;
    } else {
      lowStockCount = products.filter(
        (p) => p.stock - p.reservedStock < LOW_STOCK_THRESHOLD,
      ).length;
    }
  }

  const recentOrders: DashboardRecentOrder[] = recentOrderRows.map((o) => {
    const status =
      o.status === OrderStatus.PAID
        ? ("paid" as const)
        : o.status === OrderStatus.CANCELLED
          ? ("cancelled" as const)
          : ("pending_payment" as const);
    const tableLabel =
      o.tableLabelSnapshot?.trim() || o.diningTable?.label?.trim() || null;
    return {
      id: o.id,
      publicCode: o.publicCode,
      total: Number(o.total),
      currency: o.currency,
      status,
      createdAt: o.createdAt.toISOString(),
      lineCount: o.lines.length,
      tableLabel,
    };
  });

  const byDayMap = new Map<string, number>();
  for (const row of revenueLast7Rows) {
    const key =
      row.day instanceof Date
        ? row.day.toISOString().slice(0, 10)
        : String(row.day).slice(0, 10);
    byDayMap.set(key, Number(row.revenue));
  }

  const revenueByDayLast7: DashboardRevenueDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = addUtcDays(todayStart, -i);
    const iso = d.toISOString().slice(0, 10);
    revenueByDayLast7.push({
      date: iso,
      label: dayLabelUtc(iso),
      revenue: byDayMap.get(iso) ?? 0,
    });
  }

  const revenueCompletedLast7Days = revenueByDayLast7.reduce((s, x) => s + x.revenue, 0);
  const revenueCompletedPrior7Days = Number(revenuePrior7._sum.amount ?? 0);

  const finance = await buildFinanceSection(businessId, openOrdersCount);

  return {
    industry,
    catalogEnabled,
    revenueCompletedLast7Days,
    revenueCompletedPrior7Days,
    ordersCreatedToday,
    openOrdersCount,
    revenueByDayLast7,
    recentOrders,
    productCount,
    lowStockCount,
    finance,
  };
}
