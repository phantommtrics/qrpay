import { Prisma } from "@prisma/client";

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
  const d = parseYmdUtc(raw, "to");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

export type CategorySalesSummaryRow = {
  /** UTC calendar date (YYYY-MM-DD) of payment completion. */
  saleDate: string;
  paymentProvider: string;
  paymentMethod: string;
  gatewayCode: string | null;
  recordedByUserId: string | null;
  recordedByName: string | null;
  menuCategoryId: string | null;
  amount: number;
};

/** Full payment-level totals from {@link SalesLedgerEntryType}, grouped like UI payment channels. */
export type SalesLedgerChannelTotalsRow = {
  paymentProvider: string;
  paymentMethod: string;
  gatewayCode: string | null;
  /** Sum of succeeded CUSTOMER_SALE ledger amounts (gross sale recognised). */
  customerSaleLedgerTotal: number;
  /** Sum of succeeded WALLET_FEE ledger amounts (processing fee). */
  walletFeeLedgerTotal: number;
};

export type CategorySalesSummaryReport = {
  from: string;
  to: string;
  currency: string;
  rows: CategorySalesSummaryRow[];
  /** Order payments only; same date window as category rows (ledger `succeededAt`). */
  ledgerTotalsByChannel: SalesLedgerChannelTotalsRow[];
};

type RawAggRow = {
  saleDate: Date | string;
  paymentProvider: string;
  paymentMethod: string;
  gatewayCode: string | null;
  recordedByUserId: string | null;
  recordedByName: string | null;
  menuCategoryId: string | null;
  amount: Prisma.Decimal | null;
  currency: string | null;
};

function toYmd(v: Date | string): string {
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function combineAggRows(parts: RawAggRow[]): RawAggRow[] {
  const keyOf = (r: RawAggRow) =>
    [
      toYmd(r.saleDate),
      r.paymentProvider,
      r.paymentMethod,
      r.gatewayCode ?? "",
      r.recordedByUserId ?? "",
      r.recordedByName ?? "",
      r.menuCategoryId ?? "",
    ].join("\0");

  const map = new Map<string, RawAggRow>();

  for (const r of parts) {
    const k = keyOf(r);
    const delta = Number(r.amount ?? 0);
    const prev = map.get(k);
    if (prev) {
      prev.amount = new Prisma.Decimal(Number(prev.amount) + delta);
      if (r.currency?.trim()) {
        prev.currency = r.currency.trim();
      }
    } else {
      map.set(k, {
        ...r,
        amount: new Prisma.Decimal(delta),
        currency: r.currency?.trim() || null,
      });
    }
  }

  return [...map.values()].filter((r) => Math.abs(Number(r.amount)) > 1e-9);
}

/**
 * Allocates each completed order payment to order lines by line share of order total,
 * and estimated QR wallet processing fees ({@link SalesLedgerEntryType.WALLET_FEE}) by the same ratio
 * as deductions (negative amounts), grouped by date (UTC day), channel, recorder, and menu category.
 */
export async function getCategorySalesSummaryReport(
  businessId: string,
  fromRaw: string,
  toRaw: string,
): Promise<CategorySalesSummaryReport> {
  const from = parseYmdUtc(fromRaw, "from");
  const to = endOfUtcDayFromYmd(toRaw);
  if (from.getTime() > to.getTime()) {
    throw new HttpError(400, "From date must be on or before to date.");
  }

  const grossRows = await prisma.$queryRaw<RawAggRow[]>(Prisma.sql`
    SELECT
      (date_trunc('day', p."completedAt" AT TIME ZONE 'UTC'))::date AS "saleDate",
      p."provider"::text AS "paymentProvider",
      p."method"::text AS "paymentMethod",
      NULLIF(TRIM(COALESCE(p."gatewayCode", '')), '') AS "gatewayCode",
      p."recordedByUserId" AS "recordedByUserId",
      u."name" AS "recordedByName",
      pr."menuCategoryId" AS "menuCategoryId",
      COALESCE(
        SUM((ol."lineTotal"::numeric) * (p."amount"::numeric / NULLIF(o."total"::numeric, 0))),
        0
      )::numeric AS "amount",
      MAX(p."currency") AS "currency"
    FROM "Payment" p
    INNER JOIN "Order" o ON o."id" = p."orderId"
    INNER JOIN "OrderLine" ol ON ol."orderId" = o."id"
    INNER JOIN "Product" pr ON pr."id" = ol."productId" AND pr."businessId" = p."businessId"
    LEFT JOIN "User" u ON u."id" = p."recordedByUserId"
    WHERE p."businessId" = ${businessId}
      AND p."status" = 'COMPLETED'::"PaymentStatus"
      AND p."completedAt" IS NOT NULL
      AND p."completedAt" >= ${from}
      AND p."completedAt" <= ${to}
      AND p."orderId" IS NOT NULL
    GROUP BY
      (date_trunc('day', p."completedAt" AT TIME ZONE 'UTC'))::date,
      p."provider",
      p."method",
      NULLIF(TRIM(COALESCE(p."gatewayCode", '')), ''),
      p."recordedByUserId",
      u."name",
      pr."menuCategoryId"
  `);

  /** Wallet fee ledger rows: allocate fee to categories by same line share as gross (negative = deduction). */
  const feeRows = await prisma.$queryRaw<RawAggRow[]>(Prisma.sql`
    SELECT
      (date_trunc('day', sle."succeededAt" AT TIME ZONE 'UTC'))::date AS "saleDate",
      p."provider"::text AS "paymentProvider",
      p."method"::text AS "paymentMethod",
      NULLIF(TRIM(COALESCE(p."gatewayCode", '')), '') AS "gatewayCode",
      p."recordedByUserId" AS "recordedByUserId",
      u."name" AS "recordedByName",
      pr."menuCategoryId" AS "menuCategoryId",
      COALESCE(
        SUM(
          -(sle."amount"::numeric) * (ol."lineTotal"::numeric / NULLIF(o."total"::numeric, 0))
        ),
        0
      )::numeric AS "amount",
      MAX(sle."currency") AS "currency"
    FROM "SalesLedgerEntry" sle
    INNER JOIN "Payment" p ON p."id" = sle."paymentId"
    INNER JOIN "Order" o ON o."id" = p."orderId"
    INNER JOIN "OrderLine" ol ON ol."orderId" = o."id"
    INNER JOIN "Product" pr ON pr."id" = ol."productId" AND pr."businessId" = sle."businessId"
    LEFT JOIN "User" u ON u."id" = p."recordedByUserId"
    WHERE sle."businessId" = ${businessId}
      AND sle."type" = 'WALLET_FEE'::"SalesLedgerEntryType"
      AND sle."status" = 'SUCCEEDED'::"SalesLedgerStatus"
      AND sle."paymentId" IS NOT NULL
      AND sle."succeededAt" IS NOT NULL
      AND sle."succeededAt" >= ${from}
      AND sle."succeededAt" <= ${to}
      AND p."orderId" IS NOT NULL
      AND p."status" = 'COMPLETED'::"PaymentStatus"
    GROUP BY
      (date_trunc('day', sle."succeededAt" AT TIME ZONE 'UTC'))::date,
      p."provider",
      p."method",
      NULLIF(TRIM(COALESCE(p."gatewayCode", '')), ''),
      p."recordedByUserId",
      u."name",
      pr."menuCategoryId"
  `);

  const merged = combineAggRows([...grossRows, ...feeRows]);

  /** Payment-channel totals from sales ledger (CUSTOMER_SALE gross vs WALLET_FEE), order checkouts only. */
  const ledgerAgg = await prisma.$queryRaw<
    {
      paymentProvider: string;
      paymentMethod: string;
      gatewayCode: string | null;
      customerSaleTotal: Prisma.Decimal | null;
      walletFeeTotal: Prisma.Decimal | null;
    }[]
  >(Prisma.sql`
    SELECT
      p."provider"::text AS "paymentProvider",
      p."method"::text AS "paymentMethod",
      NULLIF(TRIM(COALESCE(p."gatewayCode", '')), '') AS "gatewayCode",
      COALESCE(
        SUM(
          CASE
            WHEN sle."type" = 'CUSTOMER_SALE'::"SalesLedgerEntryType" THEN sle."amount"::numeric
            ELSE 0::numeric
          END
        ),
        0
      )::numeric AS "customerSaleTotal",
      COALESCE(
        SUM(
          CASE
            WHEN sle."type" = 'WALLET_FEE'::"SalesLedgerEntryType" THEN sle."amount"::numeric
            ELSE 0::numeric
          END
        ),
        0
      )::numeric AS "walletFeeTotal"
    FROM "SalesLedgerEntry" sle
    INNER JOIN "Payment" p ON p."id" = sle."paymentId"
    WHERE sle."businessId" = ${businessId}
      AND sle."status" = 'SUCCEEDED'::"SalesLedgerStatus"
      AND sle."paymentId" IS NOT NULL
      AND sle."type" IN (
        'CUSTOMER_SALE'::"SalesLedgerEntryType",
        'WALLET_FEE'::"SalesLedgerEntryType"
      )
      AND p."businessId" = ${businessId}
      AND p."status" = 'COMPLETED'::"PaymentStatus"
      AND p."orderId" IS NOT NULL
      AND sle."succeededAt" IS NOT NULL
      AND sle."succeededAt" >= ${from}
      AND sle."succeededAt" <= ${to}
    GROUP BY
      p."provider",
      p."method",
      NULLIF(TRIM(COALESCE(p."gatewayCode", '')), '')
  `);

  const ledgerTotalsByChannel: SalesLedgerChannelTotalsRow[] = ledgerAgg
    .map((r) => ({
      paymentProvider: r.paymentProvider,
      paymentMethod: r.paymentMethod,
      gatewayCode: r.gatewayCode ? String(r.gatewayCode) : null,
      customerSaleLedgerTotal: Number(r.customerSaleTotal ?? 0),
      walletFeeLedgerTotal: Number(r.walletFeeTotal ?? 0),
    }))
    .filter(
      (r) =>
        Math.abs(r.customerSaleLedgerTotal) > 1e-9 || Math.abs(r.walletFeeLedgerTotal) > 1e-9,
    );

  const rows: CategorySalesSummaryRow[] = merged.map((r) => ({
    saleDate: toYmd(r.saleDate),
    paymentProvider: r.paymentProvider,
    paymentMethod: r.paymentMethod,
    gatewayCode: r.gatewayCode ? String(r.gatewayCode) : null,
    recordedByUserId: r.recordedByUserId,
    recordedByName: r.recordedByName?.trim() ? r.recordedByName.trim() : null,
    menuCategoryId: r.menuCategoryId,
    amount: Number(r.amount ?? 0),
  }));

  const currency =
    merged.find((r) => r.currency && String(r.currency).trim())?.currency?.trim() ||
    grossRows.find((r) => r.currency && String(r.currency).trim())?.currency?.trim() ||
    "GMD";

  return {
    from: fromRaw.trim(),
    to: toRaw.trim(),
    currency,
    rows,
    ledgerTotalsByChannel,
  };
}
