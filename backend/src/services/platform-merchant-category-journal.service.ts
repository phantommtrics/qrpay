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

export type PlatformMerchantCategoryJournalRow = {
  businessId: string;
  businessName: string;
  saleDate: string;
  paymentProvider: string;
  paymentMethod: string;
  gatewayCode: string | null;
  recordedByUserId: string | null;
  recordedByName: string | null;
  menuCategoryId: string | null;
  amount: number;
};

export type PlatformMerchantCategoryJournalCategory = {
  id: string;
  businessId: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};

export type PlatformMerchantLedgerTotalsRow = {
  businessId: string;
  businessName: string;
  paymentProvider: string;
  paymentMethod: string;
  gatewayCode: string | null;
  customerSaleLedgerTotal: number;
  walletFeeLedgerTotal: number;
};

export type PlatformMerchantOption = {
  id: string;
  name: string;
};

/** Succeeded Wave self-settlement payout sent on behalf of a merchant. */
export type PlatformMerchantPayoutJournalRow = {
  payoutId: string;
  businessId: string;
  businessName: string;
  payoutDate: string;
  paymentProvider: string;
  paymentMethod: string;
  gatewayCode: string | null;
  recordedByUserId: string | null;
  recordedByName: string | null;
  recipientMobile: string;
  recipientName: string;
  wavePayoutId: string | null;
  grossAmount: number;
  withholdAmount: number;
  receiveAmount: number;
  fee: string | null;
  currency: string;
};

export type PlatformMerchantPaymentJournalRow = {
  paymentId: string;
  paymentPublicCode: string;
  orderPublicCode: string | null;
  businessId: string;
  businessName: string;
  completedAt: string;
  paymentProvider: string;
  paymentMethod: string;
  gatewayCode: string | null;
  recordedByUserId: string | null;
  recordedByName: string | null;
  providerRef: string;
  paymentAmount: number;
  customerSaleLedgerTotal: number;
  walletFeeLedgerTotal: number;
  currency: string;
};

export type PlatformMerchantJournalSection = "journal" | "fee" | "settlement" | "360";

export type PlatformMerchantCategoryJournal = {
  from: string;
  to: string;
  currency: string;
  rows: PlatformMerchantCategoryJournalRow[];
  categories: PlatformMerchantCategoryJournalCategory[];
  ledgerTotals: PlatformMerchantLedgerTotalsRow[];
  payoutRows: PlatformMerchantPayoutJournalRow[];
  paymentRows: PlatformMerchantPaymentJournalRow[];
  merchants: PlatformMerchantOption[];
};

type RawAggRow = {
  businessId: string;
  businessName: string | null;
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
      r.businessId,
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
      if (r.businessName?.trim()) {
        prev.businessName = r.businessName.trim();
      }
    } else {
      map.set(k, {
        ...r,
        amount: new Prisma.Decimal(delta),
        currency: r.currency?.trim() || null,
        businessName: r.businessName?.trim() || null,
      });
    }
  }

  return [...map.values()].filter((r) => Math.abs(Number(r.amount)) > 1e-9);
}

/**
 * Platform-wide category sales journal: same allocation as merchant
 * {@link getCategorySalesSummaryReport}, grouped by business so categories never merge across tenants.
 */
export async function getPlatformMerchantCategoryJournal(
  fromRaw: string,
  toRaw: string,
  businessId?: string,
  section: PlatformMerchantJournalSection = "journal",
): Promise<PlatformMerchantCategoryJournal> {
  const from = parseYmdUtc(fromRaw, "from");
  const to = endOfUtcDayFromYmd(toRaw);
  if (from.getTime() > to.getTime()) {
    throw new HttpError(400, "From date must be on or before to date.");
  }

  const scopedBusinessId = businessId?.trim() || null;
  if (scopedBusinessId) {
    const exists = await prisma.business.findUnique({
      where: { id: scopedBusinessId },
      select: { id: true },
    });
    if (!exists) {
      throw new HttpError(404, "Merchant not found.");
    }
  }

  const businessFilter = scopedBusinessId
    ? Prisma.sql`AND p."businessId" = ${scopedBusinessId}`
    : Prisma.empty;
  const sleBusinessFilter = scopedBusinessId
    ? Prisma.sql`AND sle."businessId" = ${scopedBusinessId}`
    : Prisma.empty;
  const wspBusinessFilter = scopedBusinessId
    ? Prisma.sql`AND wsp."businessId" = ${scopedBusinessId}`
    : Prisma.empty;

  const wantJournal = section === "journal";
  const wantFee = section === "fee";
  const wantSettlement = section === "settlement";
  const want360 = section === "360";

  const [grossRows, feeRows, ledgerAgg, payoutRaw, paymentRaw, merchants] = await Promise.all([
    wantJournal
      ? prisma.$queryRaw<RawAggRow[]>(Prisma.sql`
      SELECT
        p."businessId" AS "businessId",
        b."name" AS "businessName",
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
      INNER JOIN "Business" b ON b."id" = p."businessId"
      INNER JOIN "Order" o ON o."id" = p."orderId"
      INNER JOIN "OrderLine" ol ON ol."orderId" = o."id"
      INNER JOIN "Product" pr ON pr."id" = ol."productId" AND pr."businessId" = p."businessId"
      LEFT JOIN "User" u ON u."id" = p."recordedByUserId"
      WHERE p."status" = 'COMPLETED'::"PaymentStatus"
        AND p."completedAt" IS NOT NULL
        AND p."completedAt" >= ${from}
        AND p."completedAt" <= ${to}
        AND p."orderId" IS NOT NULL
        ${businessFilter}
      GROUP BY
        p."businessId",
        b."name",
        (date_trunc('day', p."completedAt" AT TIME ZONE 'UTC'))::date,
        p."provider",
        p."method",
        NULLIF(TRIM(COALESCE(p."gatewayCode", '')), ''),
        p."recordedByUserId",
        u."name",
        pr."menuCategoryId"
    `)
      : Promise.resolve([]),
    wantJournal
      ? prisma.$queryRaw<RawAggRow[]>(Prisma.sql`
      SELECT
        sle."businessId" AS "businessId",
        b."name" AS "businessName",
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
      INNER JOIN "Business" b ON b."id" = sle."businessId"
      INNER JOIN "Payment" p ON p."id" = sle."paymentId"
      INNER JOIN "Order" o ON o."id" = p."orderId"
      INNER JOIN "OrderLine" ol ON ol."orderId" = o."id"
      INNER JOIN "Product" pr ON pr."id" = ol."productId" AND pr."businessId" = sle."businessId"
      LEFT JOIN "User" u ON u."id" = p."recordedByUserId"
      WHERE sle."type" = 'WALLET_FEE'::"SalesLedgerEntryType"
        AND sle."status" = 'SUCCEEDED'::"SalesLedgerStatus"
        AND sle."paymentId" IS NOT NULL
        AND sle."succeededAt" IS NOT NULL
        AND sle."succeededAt" >= ${from}
        AND sle."succeededAt" <= ${to}
        AND p."orderId" IS NOT NULL
        AND p."status" = 'COMPLETED'::"PaymentStatus"
        ${sleBusinessFilter}
      GROUP BY
        sle."businessId",
        b."name",
        (date_trunc('day', sle."succeededAt" AT TIME ZONE 'UTC'))::date,
        p."provider",
        p."method",
        NULLIF(TRIM(COALESCE(p."gatewayCode", '')), ''),
        p."recordedByUserId",
        u."name",
        pr."menuCategoryId"
    `)
      : Promise.resolve([]),
    wantFee
      ? prisma.$queryRaw<
      {
        businessId: string;
        businessName: string | null;
        paymentProvider: string;
        paymentMethod: string;
        gatewayCode: string | null;
        customerSaleTotal: Prisma.Decimal | null;
        walletFeeTotal: Prisma.Decimal | null;
      }[]
    >(Prisma.sql`
      SELECT
        sle."businessId" AS "businessId",
        b."name" AS "businessName",
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
      INNER JOIN "Business" b ON b."id" = sle."businessId"
      INNER JOIN "Payment" p ON p."id" = sle."paymentId"
      WHERE sle."status" = 'SUCCEEDED'::"SalesLedgerStatus"
        AND sle."paymentId" IS NOT NULL
        AND sle."type" IN (
          'CUSTOMER_SALE'::"SalesLedgerEntryType",
          'WALLET_FEE'::"SalesLedgerEntryType"
        )
        AND p."businessId" = sle."businessId"
        AND p."status" = 'COMPLETED'::"PaymentStatus"
        AND p."orderId" IS NOT NULL
        AND sle."succeededAt" IS NOT NULL
        AND sle."succeededAt" >= ${from}
        AND sle."succeededAt" <= ${to}
        ${sleBusinessFilter}
      GROUP BY
        sle."businessId",
        b."name",
        p."provider",
        p."method",
        NULLIF(TRIM(COALESCE(p."gatewayCode", '')), '')
    `)
      : Promise.resolve([]),
    wantSettlement
      ? prisma.$queryRaw<
      {
        payoutId: string;
        businessId: string;
        businessName: string | null;
        payoutDate: Date | string;
        paymentProvider: string;
        paymentMethod: string;
        gatewayCode: string | null;
        recordedByUserId: string | null;
        recordedByName: string | null;
        recipientMobile: string;
        recipientName: string;
        wavePayoutId: string | null;
        grossAmount: Prisma.Decimal | null;
        withholdAmount: Prisma.Decimal | null;
        receiveAmount: Prisma.Decimal | null;
        fee: string | null;
        currency: string | null;
      }[]
    >(Prisma.sql`
      SELECT
        wsp."id" AS "payoutId",
        wsp."businessId" AS "businessId",
        b."name" AS "businessName",
        (date_trunc('day', COALESCE(wsp."waveTimestamp", wsp."updatedAt") AT TIME ZONE 'UTC'))::date
          AS "payoutDate",
        p."provider"::text AS "paymentProvider",
        p."method"::text AS "paymentMethod",
        NULLIF(TRIM(COALESCE(p."gatewayCode", '')), '') AS "gatewayCode",
        p."recordedByUserId" AS "recordedByUserId",
        u."name" AS "recordedByName",
        wsp."mobile" AS "recipientMobile",
        wsp."name" AS "recipientName",
        wsp."wavePayoutId" AS "wavePayoutId",
        wsp."grossAmount" AS "grossAmount",
        wsp."withholdAmount" AS "withholdAmount",
        wsp."receiveAmount" AS "receiveAmount",
        wsp."fee" AS "fee",
        wsp."currency" AS "currency"
      FROM "WaveSelfSettlementPayout" wsp
      INNER JOIN "Business" b ON b."id" = wsp."businessId"
      INNER JOIN "Payment" p ON p."id" = wsp."paymentId"
      LEFT JOIN "User" u ON u."id" = p."recordedByUserId"
      WHERE wsp."status" = 'SUCCEEDED'::"WaveSelfSettlementPayoutStatus"
        AND COALESCE(wsp."waveTimestamp", wsp."updatedAt") >= ${from}
        AND COALESCE(wsp."waveTimestamp", wsp."updatedAt") <= ${to}
        ${wspBusinessFilter}
      ORDER BY
        (date_trunc('day', COALESCE(wsp."waveTimestamp", wsp."updatedAt") AT TIME ZONE 'UTC'))::date,
        b."name",
        wsp."id"
    `)
      : Promise.resolve([]),
    want360
      ? prisma.$queryRaw<
      {
        paymentId: string;
        paymentPublicCode: string;
        orderPublicCode: string | null;
        businessId: string;
        businessName: string | null;
        completedAt: Date | string;
        paymentProvider: string;
        paymentMethod: string;
        gatewayCode: string | null;
        recordedByUserId: string | null;
        recordedByName: string | null;
        providerRef: string;
        paymentAmount: Prisma.Decimal | null;
        customerSaleTotal: Prisma.Decimal | null;
        walletFeeTotal: Prisma.Decimal | null;
        currency: string | null;
      }[]
    >(Prisma.sql`
      SELECT
        p."id" AS "paymentId",
        p."publicCode" AS "paymentPublicCode",
        o."publicCode" AS "orderPublicCode",
        p."businessId" AS "businessId",
        b."name" AS "businessName",
        p."completedAt" AS "completedAt",
        p."provider"::text AS "paymentProvider",
        p."method"::text AS "paymentMethod",
        NULLIF(TRIM(COALESCE(p."gatewayCode", '')), '') AS "gatewayCode",
        p."recordedByUserId" AS "recordedByUserId",
        u."name" AS "recordedByName",
        p."providerRef" AS "providerRef",
        p."amount" AS "paymentAmount",
        COALESCE(
          MAX(
            CASE
              WHEN sle."type" = 'CUSTOMER_SALE'::"SalesLedgerEntryType" THEN sle."amount"::numeric
              ELSE NULL
            END
          ),
          0
        )::numeric AS "customerSaleTotal",
        COALESCE(
          MAX(
            CASE
              WHEN sle."type" = 'WALLET_FEE'::"SalesLedgerEntryType" THEN sle."amount"::numeric
              ELSE NULL
            END
          ),
          0
        )::numeric AS "walletFeeTotal",
        p."currency" AS "currency"
      FROM "Payment" p
      INNER JOIN "Business" b ON b."id" = p."businessId"
      LEFT JOIN "Order" o ON o."id" = p."orderId"
      LEFT JOIN "User" u ON u."id" = p."recordedByUserId"
      LEFT JOIN "SalesLedgerEntry" sle
        ON sle."paymentId" = p."id"
       AND sle."status" = 'SUCCEEDED'::"SalesLedgerStatus"
       AND sle."type" IN (
         'CUSTOMER_SALE'::"SalesLedgerEntryType",
         'WALLET_FEE'::"SalesLedgerEntryType"
       )
      WHERE p."status" = 'COMPLETED'::"PaymentStatus"
        AND p."completedAt" IS NOT NULL
        AND p."orderId" IS NOT NULL
        AND p."completedAt" >= ${from}
        AND p."completedAt" <= ${to}
        ${businessFilter}
      GROUP BY
        p."id",
        p."publicCode",
        o."publicCode",
        p."businessId",
        b."name",
        p."completedAt",
        p."provider",
        p."method",
        p."gatewayCode",
        p."recordedByUserId",
        u."name",
        p."providerRef",
        p."amount",
        p."currency"
      ORDER BY
        p."completedAt" DESC,
        b."name",
        p."id"
    `)
      : Promise.resolve([]),
    prisma.business.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const merged = combineAggRows([...grossRows, ...feeRows]);

  const businessIds = [...new Set(merged.map((r) => r.businessId))];
  const categories =
    businessIds.length === 0
      ? []
      : await prisma.menuCategory.findMany({
          where: { businessId: { in: businessIds } },
          select: {
            id: true,
            businessId: true,
            name: true,
            parentId: true,
            sortOrder: true,
          },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        });

  const ledgerTotals: PlatformMerchantLedgerTotalsRow[] = ledgerAgg
    .map((r) => ({
      businessId: r.businessId,
      businessName: r.businessName?.trim() || "Unknown merchant",
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

  const rows: PlatformMerchantCategoryJournalRow[] = merged.map((r) => ({
    businessId: r.businessId,
    businessName: r.businessName?.trim() || "Unknown merchant",
    saleDate: toYmd(r.saleDate),
    paymentProvider: r.paymentProvider,
    paymentMethod: r.paymentMethod,
    gatewayCode: r.gatewayCode ? String(r.gatewayCode) : null,
    recordedByUserId: r.recordedByUserId,
    recordedByName: r.recordedByName?.trim() ? r.recordedByName.trim() : null,
    menuCategoryId: r.menuCategoryId,
    amount: Number(r.amount ?? 0),
  }));

  const paymentRows: PlatformMerchantPaymentJournalRow[] = paymentRaw.map((r) => ({
    paymentId: r.paymentId,
    paymentPublicCode: r.paymentPublicCode,
    orderPublicCode: r.orderPublicCode?.trim() ? r.orderPublicCode.trim() : null,
    businessId: r.businessId,
    businessName: r.businessName?.trim() || "Unknown merchant",
    completedAt:
      r.completedAt instanceof Date ? r.completedAt.toISOString() : String(r.completedAt),
    paymentProvider: r.paymentProvider,
    paymentMethod: r.paymentMethod,
    gatewayCode: r.gatewayCode ? String(r.gatewayCode) : null,
    recordedByUserId: r.recordedByUserId,
    recordedByName: r.recordedByName?.trim() ? r.recordedByName.trim() : null,
    providerRef: r.providerRef,
    paymentAmount: Number(r.paymentAmount ?? 0),
    customerSaleLedgerTotal: Number(r.customerSaleTotal ?? 0),
    walletFeeLedgerTotal: Number(r.walletFeeTotal ?? 0),
    currency: r.currency?.trim() || "GMD",
  }));

  const payoutRows: PlatformMerchantPayoutJournalRow[] = payoutRaw.map((r) => ({
    payoutId: r.payoutId,
    businessId: r.businessId,
    businessName: r.businessName?.trim() || "Unknown merchant",
    payoutDate: toYmd(r.payoutDate),
    paymentProvider: r.paymentProvider,
    paymentMethod: r.paymentMethod,
    gatewayCode: r.gatewayCode ? String(r.gatewayCode) : null,
    recordedByUserId: r.recordedByUserId,
    recordedByName: r.recordedByName?.trim() ? r.recordedByName.trim() : null,
    recipientMobile: r.recipientMobile?.trim() || "",
    recipientName: r.recipientName?.trim() || "",
    wavePayoutId: r.wavePayoutId?.trim() ? r.wavePayoutId.trim() : null,
    grossAmount: Number(r.grossAmount ?? 0),
    withholdAmount: Number(r.withholdAmount ?? 0),
    receiveAmount: Number(r.receiveAmount ?? 0),
    fee: r.fee?.trim() ? r.fee.trim() : null,
    currency: r.currency?.trim() || "GMD",
  }));

  const currency =
    merged.find((r) => r.currency && String(r.currency).trim())?.currency?.trim() ||
    grossRows.find((r) => r.currency && String(r.currency).trim())?.currency?.trim() ||
    paymentRows.find((r) => r.currency.trim())?.currency.trim() ||
    payoutRows.find((r) => r.currency.trim())?.currency.trim() ||
    "GMD";

  return {
    from: fromRaw.trim(),
    to: toRaw.trim(),
    currency,
    rows,
    categories,
    ledgerTotals,
    payoutRows,
    paymentRows,
    merchants,
  };
}
