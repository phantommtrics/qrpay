import {
  BillingLedgerDirection,
  BillingLedgerEntryType,
  BillingLedgerStatus,
  Prisma,
  type BillingLedgerEntry,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { formatMoney } from "./subscription.service.js";

export type BillingLedgerReportRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  type: BillingLedgerEntryType;
  direction: BillingLedgerDirection;
  status: BillingLedgerStatus;
  amount: string;
  currency: string;
  provider: string;
  providerCheckoutSessionId: string | null;
  providerPaymentRef: string | null;
  idempotencyKey: string | null;
  metadata: Prisma.JsonValue | null;
  succeededAt: string | null;
  failedAt: string | null;
  subscriptionId: string | null;
  subscriptionInvoiceId: string | null;
  invoice: null | {
    id: string;
    status: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    dueDate: string;
    paidAt: string | null;
  };
  /** Present on platform-wide reports. */
  business?: { id: string; name: string } | null;
};

export type BillingLedgerProviderSummary = {
  provider: string;
  entryCount: number;
  succeededIn: string;
  succeededOut: string;
  pendingCount: number;
  failedCount: number;
};

export type BillingLedgerReportResult = {
  entries: BillingLedgerReportRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Net settled (succeeded in − out) when a single currency dominates; otherwise "—". */
  netSucceeded: string;
  /** Primary display currency when unambiguous. */
  currency: string | null;
  /** One row per currency when totals differ by currency (platform-wide). */
  netByCurrency: Array<{ currency: string; net: string }>;
  byProvider: BillingLedgerProviderSummary[];
  byStatus: Record<string, number>;
  byType: Record<string, number>;
};

type LedgerRowForSerialize = BillingLedgerEntry & {
  subscriptionInvoice: {
    id: string;
    status: string;
    billingPeriodStart: Date;
    billingPeriodEnd: Date;
    dueDate: Date;
    paidAt: Date | null;
  } | null;
  business?: { id: string; name: string } | null;
};

function addDecimal(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return a.add(b);
}

/** Prisma `groupBy` `_count` is typed as a wide union; normalize to a numeric row count. */
function groupByRowCount(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (
    raw &&
    typeof raw === "object" &&
    "_all" in raw &&
    typeof (raw as { _all: unknown })._all === "number"
  ) {
    return (raw as { _all: number })._all;
  }
  return 0;
}

function serializeEntry(row: LedgerRowForSerialize, opts: { includeBusiness: boolean }): BillingLedgerReportRow {
  const base: BillingLedgerReportRow = {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    type: row.type,
    direction: row.direction,
    status: row.status,
    amount: formatMoney(row.amount),
    currency: row.currency,
    provider: row.provider,
    providerCheckoutSessionId: row.providerCheckoutSessionId,
    providerPaymentRef: row.providerPaymentRef,
    idempotencyKey: row.idempotencyKey,
    metadata: row.metadata,
    succeededAt: row.succeededAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    subscriptionId: row.subscriptionId,
    subscriptionInvoiceId: row.subscriptionInvoiceId,
    invoice: row.subscriptionInvoice
      ? {
          id: row.subscriptionInvoice.id,
          status: row.subscriptionInvoice.status,
          billingPeriodStart: row.subscriptionInvoice.billingPeriodStart.toISOString(),
          billingPeriodEnd: row.subscriptionInvoice.billingPeriodEnd.toISOString(),
          dueDate: row.subscriptionInvoice.dueDate.toISOString(),
          paidAt: row.subscriptionInvoice.paidAt?.toISOString() ?? null,
        }
      : null,
  };
  if (opts.includeBusiness && row.business) {
    return { ...base, business: { id: row.business.id, name: row.business.name } };
  }
  return base;
}

async function runBillingLedgerReport(
  where: Prisma.BillingLedgerEntryWhereInput,
  options: {
    page: number;
    pageSize: number;
    includeBusiness: boolean;
  },
): Promise<BillingLedgerReportResult> {
  const include = {
    subscriptionInvoice: {
      select: {
        id: true,
        status: true,
        billingPeriodStart: true,
        billingPeriodEnd: true,
        dueDate: true,
        paidAt: true,
      },
    },
    ...(options.includeBusiness
      ? { business: { select: { id: true, name: true } } as const }
      : {}),
  };

  const [
    total,
    rows,
    statusGroups,
    typeGroups,
    providerGroups,
    currencyFlowGroups,
    currencySample,
  ] = await prisma.$transaction([
    prisma.billingLedgerEntry.count({ where }),
    prisma.billingLedgerEntry.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    prisma.billingLedgerEntry.groupBy({
      by: ["status"],
      where,
      orderBy: { status: "asc" },
      _count: true,
    }),
    prisma.billingLedgerEntry.groupBy({
      by: ["type"],
      where,
      orderBy: { type: "asc" },
      _count: true,
    }),
    prisma.billingLedgerEntry.groupBy({
      by: ["provider", "status", "direction"],
      where,
      orderBy: [{ provider: "asc" }, { status: "asc" }, { direction: "asc" }],
      _count: true,
      _sum: { amount: true },
    }),
    prisma.billingLedgerEntry.groupBy({
      by: ["currency", "status", "direction"],
      where,
      orderBy: [{ currency: "asc" }, { status: "asc" }, { direction: "asc" }],
      _sum: { amount: true },
      _count: true,
    }),
    prisma.billingLedgerEntry.findFirst({
      where,
      select: { currency: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const entries = rows.map((row) =>
    serializeEntry(row as LedgerRowForSerialize, {
      includeBusiness: options.includeBusiness,
    }),
  );

  const byStatus: Record<string, number> = {};
  for (const g of statusGroups) {
    byStatus[g.status] = groupByRowCount(g._count);
  }

  const byType: Record<string, number> = {};
  for (const g of typeGroups) {
    byType[g.type] = groupByRowCount(g._count);
  }

  const providerMap = new Map<
    string,
    {
      entryCount: number;
      succeededIn: Prisma.Decimal;
      succeededOut: Prisma.Decimal;
      pendingCount: number;
      failedCount: number;
    }
  >();

  for (const g of providerGroups) {
    const count = groupByRowCount(g._count);
    const sumAmt = g._sum?.amount ?? new Prisma.Decimal(0);
    let agg = providerMap.get(g.provider);
    if (!agg) {
      agg = {
        entryCount: 0,
        succeededIn: new Prisma.Decimal(0),
        succeededOut: new Prisma.Decimal(0),
        pendingCount: 0,
        failedCount: 0,
      };
      providerMap.set(g.provider, agg);
    }
    agg.entryCount += count;
    if (g.status === BillingLedgerStatus.PENDING) {
      agg.pendingCount += count;
    }
    if (g.status === BillingLedgerStatus.FAILED) {
      agg.failedCount += count;
    }
    if (g.status === BillingLedgerStatus.SUCCEEDED) {
      if (g.direction === BillingLedgerDirection.MONEY_IN) {
        agg.succeededIn = addDecimal(agg.succeededIn, sumAmt);
      } else if (g.direction === BillingLedgerDirection.MONEY_OUT) {
        agg.succeededOut = addDecimal(agg.succeededOut, sumAmt);
      }
    }
  }

  const currencyNet = new Map<string, { in: Prisma.Decimal; out: Prisma.Decimal }>();
  for (const g of currencyFlowGroups) {
    if (g.status !== BillingLedgerStatus.SUCCEEDED) {
      continue;
    }
    let bucket = currencyNet.get(g.currency);
    if (!bucket) {
      bucket = { in: new Prisma.Decimal(0), out: new Prisma.Decimal(0) };
      currencyNet.set(g.currency, bucket);
    }
    const sumAmt = g._sum?.amount ?? new Prisma.Decimal(0);
    if (g.direction === BillingLedgerDirection.MONEY_IN) {
      bucket.in = addDecimal(bucket.in, sumAmt);
    } else if (g.direction === BillingLedgerDirection.MONEY_OUT) {
      bucket.out = addDecimal(bucket.out, sumAmt);
    }
  }

  const netByCurrency = Array.from(currencyNet.entries())
    .map(([currency, v]) => ({
      currency,
      net: formatMoney(v.in.sub(v.out)),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  let netSucceeded: string;
  let primaryCurrency: string | null;
  if (netByCurrency.length === 0) {
    netSucceeded = formatMoney(new Prisma.Decimal(0));
    primaryCurrency = currencySample?.currency ?? null;
  } else if (netByCurrency.length === 1) {
    netSucceeded = netByCurrency[0].net;
    primaryCurrency = netByCurrency[0].currency;
  } else {
    netSucceeded = "—";
    primaryCurrency = null;
  }

  const byProvider: BillingLedgerProviderSummary[] = Array.from(providerMap.entries())
    .map(([provider, v]) => ({
      provider,
      entryCount: v.entryCount,
      succeededIn: formatMoney(v.succeededIn),
      succeededOut: formatMoney(v.succeededOut),
      pendingCount: v.pendingCount,
      failedCount: v.failedCount,
    }))
    .sort((a, b) => b.entryCount - a.entryCount || a.provider.localeCompare(b.provider));

  return {
    entries,
    total,
    page: options.page,
    pageSize: options.pageSize,
    netSucceeded,
    currency: primaryCurrency,
    netByCurrency,
    byProvider,
    byStatus,
    byType,
  };
}

export async function listBusinessBillingLedgerReport(
  businessId: string,
  options: {
    createdFrom: Date | null;
    createdTo: Date | null;
    page: number;
    pageSize: number;
  },
): Promise<BillingLedgerReportResult> {
  const where: Prisma.BillingLedgerEntryWhereInput = { businessId };
  if (options.createdFrom || options.createdTo) {
    where.createdAt = {};
    if (options.createdFrom) {
      where.createdAt.gte = options.createdFrom;
    }
    if (options.createdTo) {
      where.createdAt.lte = options.createdTo;
    }
  }
  return runBillingLedgerReport(where, {
    page: options.page,
    pageSize: options.pageSize,
    includeBusiness: false,
  });
}

/** All businesses — platform operators only. */
export async function listAllBillingLedgerReport(options: {
  createdFrom: Date | null;
  createdTo: Date | null;
  page: number;
  pageSize: number;
}): Promise<BillingLedgerReportResult> {
  const where: Prisma.BillingLedgerEntryWhereInput = {};
  if (options.createdFrom || options.createdTo) {
    where.createdAt = {};
    if (options.createdFrom) {
      where.createdAt.gte = options.createdFrom;
    }
    if (options.createdTo) {
      where.createdAt.lte = options.createdTo;
    }
  }
  return runBillingLedgerReport(where, {
    page: options.page,
    pageSize: options.pageSize,
    includeBusiness: true,
  });
}

const PLATFORM_LEDGER_CSV_MAX_ROWS = 50_000;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const s = typeof value === "string" ? value : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export type BillingLedgerCsvExportResult = {
  csv: string;
  rowCount: number;
  truncated: boolean;
};

/** All matching rows (cap {@link PLATFORM_LEDGER_CSV_MAX_ROWS}), newest first — for platform CSV export. */
export async function buildAllBillingLedgerCsv(options: {
  createdFrom: Date | null;
  createdTo: Date | null;
}): Promise<BillingLedgerCsvExportResult> {
  const where: Prisma.BillingLedgerEntryWhereInput = {};
  if (options.createdFrom || options.createdTo) {
    where.createdAt = {};
    if (options.createdFrom) {
      where.createdAt.gte = options.createdFrom;
    }
    if (options.createdTo) {
      where.createdAt.lte = options.createdTo;
    }
  }

  const total = await prisma.billingLedgerEntry.count({ where });
  const rows = await prisma.billingLedgerEntry.findMany({
    where,
    include: {
      business: { select: { id: true, name: true } },
      subscriptionInvoice: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: PLATFORM_LEDGER_CSV_MAX_ROWS,
  });

  const header = [
    "business_id",
    "business_name",
    "ledger_entry_id",
    "created_at",
    "updated_at",
    "type",
    "direction",
    "status",
    "amount",
    "currency",
    "provider",
    "subscription_id",
    "subscription_invoice_id",
    "provider_checkout_session_id",
    "provider_payment_ref",
    "idempotency_key",
    "succeeded_at",
    "failed_at",
    "metadata_json",
  ];

  const lines: string[] = [header.map(csvEscape).join(",")];
  for (const r of rows) {
    const metadataStr =
      r.metadata === null || r.metadata === undefined ? "" : JSON.stringify(r.metadata);
    lines.push(
      [
        csvEscape(r.businessId),
        csvEscape(r.business?.name ?? ""),
        csvEscape(r.id),
        csvEscape(r.createdAt.toISOString()),
        csvEscape(r.updatedAt.toISOString()),
        csvEscape(r.type),
        csvEscape(r.direction),
        csvEscape(r.status),
        csvEscape(formatMoney(r.amount)),
        csvEscape(r.currency),
        csvEscape(r.provider),
        csvEscape(r.subscriptionId ?? ""),
        csvEscape(r.subscriptionInvoiceId ?? ""),
        csvEscape(r.providerCheckoutSessionId ?? ""),
        csvEscape(r.providerPaymentRef ?? ""),
        csvEscape(r.idempotencyKey ?? ""),
        csvEscape(r.succeededAt?.toISOString() ?? ""),
        csvEscape(r.failedAt?.toISOString() ?? ""),
        csvEscape(metadataStr),
      ].join(","),
    );
  }

  return {
    csv: `\ufeff${lines.join("\n")}`,
    rowCount: rows.length,
    truncated: total > PLATFORM_LEDGER_CSV_MAX_ROWS,
  };
}
