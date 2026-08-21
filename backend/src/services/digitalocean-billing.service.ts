import {
  BillStatus,
  ChartAccountCategory,
  DigitalOceanInvoiceStatus,
  Prisma,
  type DigitalOceanInvoice,
} from "@prisma/client";

import { isDigitalOceanBillingConfigured } from "../config/digitalocean-env.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  fetchDigitalOceanBalance,
  fetchDigitalOceanBillingHistory,
  fetchDigitalOceanInvoiceItems,
  fetchDigitalOceanInvoiceList,
  fetchDigitalOceanInvoicePdf,
  fetchDigitalOceanInvoiceSummary,
  type DigitalOceanInvoiceItem,
  type DigitalOceanInvoiceListItem,
  type DigitalOceanInvoiceSummary,
} from "./digitalocean-client.service.js";
import { PLATFORM_CHART_HOSTING } from "./platform-chart-of-accounts.service.js";
import { postPlatformMoneyOutJournalForPurchaseBill } from "./platform-purchase-bill-journal.service.js";
import { allocatePlatformBillPublicCode } from "./sales-document-code.service.js";

type Tx = Prisma.TransactionClient;

export const DIGITALOCEAN_SUPPLIER_NAME = "DigitalOcean";
export const DIGITALOCEAN_SUPPLIER_EMAIL = "billing@digitalocean.com";
export const DIGITALOCEAN_PREVIEW_UUID = "preview";

const PREVIEW_UUIDS = new Set(["preview", "invoice_preview"]);

function dec(v: number | string): Prisma.Decimal {
  return new Prisma.Decimal(typeof v === "number" && !Number.isFinite(v) ? 0 : v);
}

function roundMoney(v: Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(v.toFixed(2));
}

function moneyString(v: Prisma.Decimal | null | undefined): string | null {
  if (v == null) return null;
  return v.toFixed(2);
}

function parseUsd(raw: string | number | null | undefined): Prisma.Decimal {
  if (raw == null || raw === "") return dec(0);
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return dec(0);
  return roundMoney(dec(n));
}

function parseRate(raw: number | string): Prisma.Decimal {
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) {
    return dec(0);
  }
  return new Prisma.Decimal(n.toFixed(6));
}

function isPreviewUuid(uuid: string): boolean {
  const u = uuid.trim().toLowerCase();
  return !u || PREVIEW_UUIDS.has(u);
}

function periodIssueDate(billingPeriod: string): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(billingPeriod.trim());
  if (!m) {
    return new Date();
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  return new Date(Date.UTC(year, month, 0, 12, 0, 0));
}

type SnapshotProductItem = { key: string; name: string; amountUsd: string; count?: string };

type SummarySnapshot = {
  amount: string;
  invoiceId: string;
  invoiceUuid: string;
  billingPeriod: string;
  productCharges: SnapshotProductItem[];
  taxesUsd: string;
  overagesUsd: string;
  creditsUsd: string;
};

function snapshotFromSummary(summary: DigitalOceanInvoiceSummary): SummarySnapshot {
  const items = (summary.product_charges?.items ?? []).map((item, i) => ({
    key: `product:${item.name || i}`,
    name: item.name?.trim() || `Product ${i + 1}`,
    amountUsd: parseUsd(item.amount).toFixed(2),
    count: item.count,
  }));
  return {
    amount: parseUsd(summary.amount).toFixed(2),
    invoiceId: String(summary.invoice_id ?? ""),
    invoiceUuid: String(summary.invoice_uuid ?? ""),
    billingPeriod: String(summary.billing_period ?? ""),
    productCharges: items,
    taxesUsd: parseUsd(summary.taxes?.amount).toFixed(2),
    overagesUsd: parseUsd(summary.overages?.amount).toFixed(2),
    creditsUsd: parseUsd(summary.credits_and_adjustments?.amount).toFixed(2),
  };
}

function snapshotFromListItem(item: DigitalOceanInvoiceListItem): SummarySnapshot {
  return {
    amount: parseUsd(item.amount).toFixed(2),
    invoiceId: String(item.invoice_id ?? ""),
    invoiceUuid: String(item.invoice_uuid ?? ""),
    billingPeriod: String(item.invoice_period ?? ""),
    productCharges: [],
    taxesUsd: "0.00",
    overagesUsd: "0.00",
    creditsUsd: "0.00",
  };
}

function readSnapshot(raw: Prisma.JsonValue | null | undefined): SummarySnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const productCharges = Array.isArray(o.productCharges)
    ? (o.productCharges as SnapshotProductItem[])
    : [];
  return {
    amount: String(o.amount ?? "0"),
    invoiceId: String(o.invoiceId ?? ""),
    invoiceUuid: String(o.invoiceUuid ?? ""),
    billingPeriod: String(o.billingPeriod ?? ""),
    productCharges,
    taxesUsd: String(o.taxesUsd ?? "0"),
    overagesUsd: String(o.overagesUsd ?? "0"),
    creditsUsd: String(o.creditsUsd ?? "0"),
  };
}

export type ProposedBillLine = {
  key: string;
  name: string;
  amountUsd: string;
  amountGmd: string;
  chartOfAccountId: string;
  chartCode: string;
  chartName: string;
};

function buildUsdLines(snapshot: SummarySnapshot, invoiceTotalUsd: Prisma.Decimal): Array<{
  key: string;
  name: string;
  amountUsd: Prisma.Decimal;
}> {
  const lines: Array<{ key: string; name: string; amountUsd: Prisma.Decimal }> = [];
  for (const item of snapshot.productCharges) {
    const amt = parseUsd(item.amountUsd);
    if (amt.gt(0)) {
      lines.push({ key: item.key, name: item.name, amountUsd: amt });
    }
  }
  const overages = parseUsd(snapshot.overagesUsd);
  if (overages.gt(0)) {
    lines.push({ key: "overages", name: "Overages", amountUsd: overages });
  }
  const taxes = parseUsd(snapshot.taxesUsd);
  if (taxes.gt(0)) {
    lines.push({ key: "taxes", name: "Taxes", amountUsd: taxes });
  }

  if (!lines.length) {
    if (invoiceTotalUsd.gt(0)) {
      lines.push({
        key: "total",
        name: `DigitalOcean invoice ${snapshot.billingPeriod || snapshot.invoiceId}`.trim(),
        amountUsd: invoiceTotalUsd,
      });
    }
    return lines;
  }

  const sum = lines.reduce((acc, l) => acc.add(l.amountUsd), dec(0));
  const target = invoiceTotalUsd.gt(0) ? invoiceTotalUsd : roundMoney(sum);
  const diff = roundMoney(target.sub(sum));
  if (diff.gt(0)) {
    lines.push({ key: "other", name: "Other charges", amountUsd: diff });
  } else if (diff.lt(0) && sum.gt(0)) {
    const scale = target.div(sum);
    for (const line of lines) {
      line.amountUsd = roundMoney(line.amountUsd.mul(scale));
    }
    const after = lines.reduce((acc, l) => acc.add(l.amountUsd), dec(0));
    const penny = roundMoney(target.sub(after));
    if (!penny.eq(0) && lines.length) {
      const last = lines[lines.length - 1]!;
      last.amountUsd = roundMoney(last.amountUsd.add(penny));
      if (last.amountUsd.lte(0)) {
        last.amountUsd = roundMoney(dec("0.01"));
      }
    }
  }

  return lines.filter((l) => l.amountUsd.gt(0));
}

function convertLinesToGmd(
  usdLines: Array<{ key: string; name: string; amountUsd: Prisma.Decimal }>,
  rate: Prisma.Decimal,
  targetGmd: Prisma.Decimal,
): Array<{ key: string; name: string; amountUsd: Prisma.Decimal; amountGmd: Prisma.Decimal }> {
  const converted = usdLines.map((l) => ({
    ...l,
    amountGmd: roundMoney(l.amountUsd.mul(rate)),
  }));
  if (!converted.length) {
    return converted;
  }
  const sum = converted.reduce((acc, l) => acc.add(l.amountGmd), dec(0));
  const penny = roundMoney(targetGmd.sub(sum));
  if (!penny.eq(0)) {
    const last = converted[converted.length - 1]!;
    last.amountGmd = roundMoney(last.amountGmd.add(penny));
    if (last.amountGmd.lte(0)) {
      last.amountGmd = roundMoney(dec("0.01"));
    }
  }
  return converted.filter((l) => l.amountGmd.gt(0));
}

async function hostingAccount(db: Tx | typeof prisma) {
  const a = await db.platformChartOfAccount.findUnique({ where: { code: PLATFORM_CHART_HOSTING } });
  if (!a) {
    throw new HttpError(500, "Hosting account P-5100 is missing from the platform chart.");
  }
  return a;
}

export async function ensureDigitalOceanSupplier(db: Tx | typeof prisma) {
  const existing = await db.platformSupplier.findFirst({
    where: {
      OR: [{ name: DIGITALOCEAN_SUPPLIER_NAME }, { email: DIGITALOCEAN_SUPPLIER_EMAIL }],
    },
  });
  if (existing) {
    if (!existing.email) {
      return db.platformSupplier.update({
        where: { id: existing.id },
        data: { email: DIGITALOCEAN_SUPPLIER_EMAIL },
      });
    }
    return existing;
  }
  return db.platformSupplier.create({
    data: {
      name: DIGITALOCEAN_SUPPLIER_NAME,
      email: DIGITALOCEAN_SUPPLIER_EMAIL,
      notes: "System vendor for DigitalOcean cloud invoices.",
    },
  });
}

function formatInvoiceRow(
  row: DigitalOceanInvoice & {
    platformBill?: { id: string; publicCode: string } | null;
    platformJournalEntry?: { id: string; postedAt: Date } | null;
    settlementAccount?: { id: string; code: string; name: string } | null;
  },
) {
  return {
    id: row.id,
    invoiceUuid: row.invoiceUuid,
    invoiceId: row.invoiceId,
    billingPeriod: row.billingPeriod,
    amountUsd: moneyString(row.amountUsd) ?? "0.00",
    isPreview: row.isPreview,
    status: row.status,
    summary: readSnapshot(row.summarySnapshot),
    fxRateGmdPerUsd: row.fxRateGmdPerUsd?.toFixed(6) ?? null,
    amountGmd: moneyString(row.amountGmd),
    settlementChartAccountId: row.settlementChartAccountId,
    settlementAccount: row.settlementAccount
      ? {
          id: row.settlementAccount.id,
          code: row.settlementAccount.code,
          name: row.settlementAccount.name,
        }
      : null,
    platformBillId: row.platformBillId,
    platformBill: row.platformBill
      ? { id: row.platformBill.id, publicCode: row.platformBill.publicCode }
      : null,
    platformJournalEntryId: row.platformJournalEntryId,
    platformJournalEntry: row.platformJournalEntry
      ? {
          id: row.platformJournalEntry.id,
          postedAt: row.platformJournalEntry.postedAt.toISOString(),
        }
      : null,
    postedAt: row.postedAt?.toISOString() ?? null,
    syncedAt: row.syncedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getDigitalOceanBillingConfigured() {
  return { configured: isDigitalOceanBillingConfigured() };
}

export async function getDigitalOceanBalance() {
  const balance = await fetchDigitalOceanBalance();
  return {
    configured: true,
    accountBalance: balance.account_balance,
    monthToDateBalance: balance.month_to_date_balance,
    monthToDateUsage: balance.month_to_date_usage,
    generatedAt: balance.generated_at,
    currency: "USD",
  };
}

export async function listDigitalOceanBillingHistory() {
  const items = await fetchDigitalOceanBillingHistory();
  return {
    configured: true,
    items: items.map((h) => ({
      amount: h.amount,
      date: h.date,
      description: h.description,
      invoiceId: h.invoice_id ?? null,
      invoiceUuid: h.invoice_uuid ?? null,
      type: h.type,
    })),
  };
}

export async function listSyncedDigitalOceanInvoices() {
  const rows = await prisma.digitalOceanInvoice.findMany({
    where: { isPreview: false },
    orderBy: [{ billingPeriod: "desc" }, { invoiceId: "desc" }],
    include: {
      platformBill: { select: { id: true, publicCode: true } },
      platformJournalEntry: { select: { id: true, postedAt: true } },
      settlementAccount: { select: { id: true, code: true, name: true } },
    },
  });
  const lastPosted = await prisma.digitalOceanInvoice.findFirst({
    where: { status: DigitalOceanInvoiceStatus.POSTED, fxRateGmdPerUsd: { not: null } },
    orderBy: { postedAt: "desc" },
    select: { fxRateGmdPerUsd: true },
  });
  const lastSynced = rows.reduce<Date | null>((acc, r) => {
    if (!acc || r.syncedAt > acc) return r.syncedAt;
    return acc;
  }, null);

  let invoicePreview: {
    invoiceUuid: string;
    invoiceId: string;
    amountUsd: string;
    billingPeriod: string;
  } | null = null;
  if (isDigitalOceanBillingConfigured()) {
    try {
      const list = await fetchDigitalOceanInvoiceList();
      const p = list.invoice_preview;
      if (p?.invoice_uuid) {
        invoicePreview = {
          invoiceUuid: p.invoice_uuid,
          invoiceId: p.invoice_id,
          amountUsd: parseUsd(p.amount).toFixed(2),
          billingPeriod: p.invoice_period,
        };
      }
    } catch {
      invoicePreview = null;
    }
  }

  return {
    configured: isDigitalOceanBillingConfigured(),
    lastSyncedAt: lastSynced?.toISOString() ?? null,
    lastFxRateGmdPerUsd: lastPosted?.fxRateGmdPerUsd?.toFixed(6) ?? null,
    invoicePreview,
    invoices: rows.map(formatInvoiceRow),
  };
}

export async function syncDigitalOceanInvoices() {
  const list = await fetchDigitalOceanInvoiceList();
  let upserted = 0;
  for (const item of list.invoices ?? []) {
    const uuid = String(item.invoice_uuid ?? "").trim();
    if (!uuid || isPreviewUuid(uuid)) {
      continue;
    }
    const amountUsd = parseUsd(item.amount);
    const billingPeriod = String(item.invoice_period ?? "").trim();
    const invoiceId = String(item.invoice_id ?? uuid);
    const existing = await prisma.digitalOceanInvoice.findUnique({ where: { invoiceUuid: uuid } });
    if (existing?.status === DigitalOceanInvoiceStatus.POSTED) {
      await prisma.digitalOceanInvoice.update({
        where: { id: existing.id },
        data: { syncedAt: new Date() },
      });
      continue;
    }

    let snapshot: SummarySnapshot = snapshotFromListItem(item);
    const needsSummary =
      !existing?.summarySnapshot ||
      !existing.amountUsd.eq(amountUsd) ||
      !(readSnapshot(existing.summarySnapshot)?.productCharges.length);
    if (needsSummary) {
      try {
        const summary = await fetchDigitalOceanInvoiceSummary(uuid);
        snapshot = snapshotFromSummary(summary);
      } catch {
        snapshot = snapshotFromListItem(item);
      }
    } else {
      snapshot = readSnapshot(existing.summarySnapshot) ?? snapshot;
    }

    await prisma.digitalOceanInvoice.upsert({
      where: { invoiceUuid: uuid },
      create: {
        invoiceUuid: uuid,
        invoiceId,
        billingPeriod,
        amountUsd,
        isPreview: false,
        status: DigitalOceanInvoiceStatus.SYNCED,
        summarySnapshot: snapshot as unknown as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
      update: {
        invoiceId,
        billingPeriod,
        amountUsd,
        summarySnapshot: snapshot as unknown as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
    });
    upserted += 1;
  }

  await ensureDigitalOceanSupplier(prisma);
  return listSyncedDigitalOceanInvoices().then((payload) => ({
    ...payload,
    upserted,
  }));
}

async function loadInvoiceOrThrow(invoiceUuid: string) {
  const uuid = invoiceUuid.trim();
  if (!uuid || isPreviewUuid(uuid)) {
    throw new HttpError(400, "The month-to-date preview invoice cannot be posted to the journal.");
  }
  const row = await prisma.digitalOceanInvoice.findUnique({
    where: { invoiceUuid: uuid },
    include: {
      platformBill: { select: { id: true, publicCode: true } },
      platformJournalEntry: { select: { id: true, postedAt: true } },
      settlementAccount: { select: { id: true, code: true, name: true } },
    },
  });
  if (!row) {
    throw new HttpError(404, "DigitalOcean invoice is not synced yet. Sync invoices first.");
  }
  return row;
}

export async function getDigitalOceanInvoiceDetail(invoiceUuid: string) {
  const uuid = invoiceUuid.trim();
  if (isPreviewUuid(uuid)) {
    const summary = await fetchDigitalOceanInvoiceSummary(uuid);
    let items: DigitalOceanInvoiceItem[] = [];
    try {
      items = await fetchDigitalOceanInvoiceItems(uuid);
    } catch {
      items = [];
    }
    return {
      configured: true,
      isPreview: true,
      canPost: false,
      invoice: {
        invoiceUuid: summary.invoice_uuid || uuid,
        invoiceId: summary.invoice_id,
        billingPeriod: summary.billing_period,
        amountUsd: parseUsd(summary.amount).toFixed(2),
        status: "PREVIEW",
        summary: snapshotFromSummary(summary),
      },
      items,
      proposedLines: [],
    };
  }

  const row = await loadInvoiceOrThrow(uuid);
  let items: DigitalOceanInvoiceItem[] = [];
  let summary = readSnapshot(row.summarySnapshot);
  if (isDigitalOceanBillingConfigured()) {
    try {
      items = await fetchDigitalOceanInvoiceItems(uuid);
    } catch {
      items = [];
    }
    if (!summary?.productCharges.length) {
      try {
        const live = await fetchDigitalOceanInvoiceSummary(uuid);
        summary = snapshotFromSummary(live);
        if (row.status !== DigitalOceanInvoiceStatus.POSTED) {
          await prisma.digitalOceanInvoice.update({
            where: { id: row.id },
            data: { summarySnapshot: summary as unknown as Prisma.InputJsonValue },
          });
        }
      } catch {
        /* keep stored snapshot */
      }
    }
  }

  const hosting = await hostingAccount(prisma);
  const snap = summary ?? snapshotFromListItem({
    invoice_uuid: row.invoiceUuid,
    invoice_id: row.invoiceId,
    amount: row.amountUsd.toFixed(2),
    invoice_period: row.billingPeriod,
  });
  const usdLines = buildUsdLines(snap, row.amountUsd);
  const proposedLines: ProposedBillLine[] = usdLines.map((l) => ({
    key: l.key,
    name: l.name,
    amountUsd: l.amountUsd.toFixed(2),
    amountGmd: l.amountUsd.toFixed(2),
    chartOfAccountId: hosting.id,
    chartCode: hosting.code,
    chartName: hosting.name,
  }));

  return {
    configured: isDigitalOceanBillingConfigured(),
    isPreview: false,
    canPost: row.status !== DigitalOceanInvoiceStatus.POSTED,
    invoice: formatInvoiceRow({ ...row, summarySnapshot: (summary ?? row.summarySnapshot) as Prisma.JsonValue }),
    items,
    proposedLines,
    defaultChart: { id: hosting.id, code: hosting.code, name: hosting.name },
  };
}

export async function previewDigitalOceanJournalLines(input: {
  invoiceUuid: string;
  fxRateGmdPerUsd: number | string;
  lineAccounts?: Array<{ key: string; chartOfAccountId: string }>;
}) {
  const row = await loadInvoiceOrThrow(input.invoiceUuid);
  if (row.status === DigitalOceanInvoiceStatus.POSTED) {
    throw new HttpError(400, "This invoice is already posted to the journal.");
  }
  const rate = parseRate(input.fxRateGmdPerUsd);
  if (rate.lte(0)) {
    throw new HttpError(400, "FX rate must be greater than zero (GMD per 1 USD).");
  }
  const snap =
    readSnapshot(row.summarySnapshot) ??
    snapshotFromListItem({
      invoice_uuid: row.invoiceUuid,
      invoice_id: row.invoiceId,
      amount: row.amountUsd.toFixed(2),
      invoice_period: row.billingPeriod,
    });
  const usdLines = buildUsdLines(snap, row.amountUsd);
  if (!usdLines.length) {
    throw new HttpError(400, "Invoice has no billable amount to post.");
  }
  const targetGmd = roundMoney(row.amountUsd.mul(rate));
  const gmdLines = convertLinesToGmd(usdLines, rate, targetGmd);
  const overrideMap = new Map(
    (input.lineAccounts ?? []).map((l) => [l.key, l.chartOfAccountId]),
  );
  const hosting = await hostingAccount(prisma);
  const resolved: ProposedBillLine[] = [];
  for (const line of gmdLines) {
    const accountId = overrideMap.get(line.key) || hosting.id;
    const account = await prisma.platformChartOfAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new HttpError(400, `Chart account not found for line ${line.name}.`);
    }
    if (account.category !== ChartAccountCategory.EXPENSE) {
      throw new HttpError(400, `Line "${line.name}" must post to an expense account.`);
    }
    resolved.push({
      key: line.key,
      name: line.name,
      amountUsd: line.amountUsd.toFixed(2),
      amountGmd: line.amountGmd.toFixed(2),
      chartOfAccountId: account.id,
      chartCode: account.code,
      chartName: account.name,
    });
  }
  return {
    fxRateGmdPerUsd: rate.toFixed(6),
    amountUsd: row.amountUsd.toFixed(2),
    amountGmd: targetGmd.toFixed(2),
    lines: resolved,
  };
}

export async function postDigitalOceanInvoiceToJournal(input: {
  invoiceUuid: string;
  fxRateGmdPerUsd: number | string;
  settlementChartAccountId: string;
  postedAt: Date;
  postedByUserId: string;
  lineAccounts?: Array<{ key: string; chartOfAccountId: string }>;
}) {
  const preview = await previewDigitalOceanJournalLines({
    invoiceUuid: input.invoiceUuid,
    fxRateGmdPerUsd: input.fxRateGmdPerUsd,
    lineAccounts: input.lineAccounts,
  });
  const row = await loadInvoiceOrThrow(input.invoiceUuid);

  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.digitalOceanInvoice.findUnique({ where: { id: row.id } });
    if (!locked) {
      throw new HttpError(404, "DigitalOcean invoice is not synced yet. Sync invoices first.");
    }
    if (locked.status === DigitalOceanInvoiceStatus.POSTED || locked.platformJournalEntryId) {
      throw new HttpError(400, "This invoice is already posted to the journal.");
    }

    const settlement = await tx.platformChartOfAccount.findUnique({
      where: { id: input.settlementChartAccountId },
    });
    if (!settlement) {
      throw new HttpError(400, "Settlement account not found.");
    }
    if (settlement.category !== ChartAccountCategory.ASSET) {
      throw new HttpError(400, `Settlement account must be an asset (bank/cash). Selected: ${settlement.name}.`);
    }

    const supplier = await ensureDigitalOceanSupplier(tx);
    const publicCode = await allocatePlatformBillPublicCode(tx);
    const issueDate = periodIssueDate(locked.billingPeriod);
    const rate = dec(preview.fxRateGmdPerUsd);
    const amountGmd = dec(preview.amountGmd);

    const bill = await tx.platformBill.create({
      data: {
        supplierId: supplier.id,
        publicCode,
        status: BillStatus.APPROVED,
        issueDate,
        dueDate: issueDate,
        reference: `DO ${locked.invoiceId} / ${locked.invoiceUuid}`,
        currency: "GMD",
        approvedAt: new Date(),
        paymentGatewayCode: "DIGITALOCEAN",
        paymentProviderRef: locked.invoiceUuid,
        lines: {
          create: preview.lines.map((l, sortOrder) => ({
            chartOfAccountId: l.chartOfAccountId,
            narration: l.name,
            quantity: dec(1),
            unitLabel: "invoice",
            unitAmount: dec(l.amountGmd),
            taxAmount: dec(0),
            sortOrder,
          })),
        },
      },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
      },
    });

    const memo = [
      `DigitalOcean invoice ${locked.invoiceId}`,
      locked.billingPeriod ? `period ${locked.billingPeriod}` : null,
      `USD ${locked.amountUsd.toFixed(2)} @ ${rate.toFixed(4)} GMD/USD`,
    ]
      .filter(Boolean)
      .join(" · ");

    const entry = await postPlatformMoneyOutJournalForPurchaseBill(tx, {
      billId: bill.id,
      postedAt: input.postedAt,
      reference: publicCode,
      settlementChartAccountId: settlement.id,
      memo,
      lines: bill.lines,
    });

    await tx.platformBill.update({
      where: { id: bill.id },
      data: {
        status: BillStatus.PAID,
        paidAt: new Date(),
        platformJournalEntryId: entry.id,
        settlementChartAccountId: settlement.id,
      },
    });

    const updated = await tx.digitalOceanInvoice.update({
      where: { id: locked.id },
      data: {
        status: DigitalOceanInvoiceStatus.POSTED,
        fxRateGmdPerUsd: rate,
        amountGmd,
        settlementChartAccountId: settlement.id,
        platformBillId: bill.id,
        platformJournalEntryId: entry.id,
        postedAt: input.postedAt,
        postedByUserId: input.postedByUserId,
      },
      include: {
        platformBill: { select: { id: true, publicCode: true } },
        platformJournalEntry: { select: { id: true, postedAt: true } },
        settlementAccount: { select: { id: true, code: true, name: true } },
      },
    });

    return updated;
  });

  return formatInvoiceRow(result);
}

export async function getDigitalOceanInvoicePdfBuffer(invoiceUuid: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const uuid = invoiceUuid.trim();
  if (!uuid) {
    throw new HttpError(400, "Invoice UUID is required.");
  }
  const buffer = await fetchDigitalOceanInvoicePdf(uuid);
  const safe = uuid.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80) || "invoice";
  return { buffer, filename: `digitalocean-invoice-${safe}.pdf` };
}
