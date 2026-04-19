import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { OrderStatus, PaymentStatus } from "../lib/prisma-sales-enums.js";
import {
  isPetrolStationIndustry,
  isRestaurantIndustry,
  isRetailOrWholesaleIndustry,
} from "./product.service.js";

const LOW_STOCK_THRESHOLD = 20;
const RECENT_ORDERS_LIMIT = 5;

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
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabelUtc(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return DAY_LABELS[dt.getUTCDay()] ?? isoDate;
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
      where: { businessId },
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
  };
}
