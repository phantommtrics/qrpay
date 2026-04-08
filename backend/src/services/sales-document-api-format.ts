import type { Prisma } from "@prisma/client";

function decNum(v: Prisma.Decimal | number): number {
  return typeof v === "number" ? v : Number(v.toString());
}

export function formatSalesLineRow(l: {
  id: string;
  chartOfAccountId: string;
  narration: string;
  quantity: Prisma.Decimal;
  unitLabel: string | null;
  unitAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  sortOrder: number;
  chartOfAccount?: { id: string; code: string; name: string };
}) {
  return {
    id: l.id,
    chartOfAccountId: l.chartOfAccountId,
    narration: l.narration,
    quantity: decNum(l.quantity),
    unitLabel: l.unitLabel,
    unitAmount: decNum(l.unitAmount),
    taxAmount: decNum(l.taxAmount),
    sortOrder: l.sortOrder,
    chartOfAccount: l.chartOfAccount,
  };
}

export function formatSalesQuotationApi(q: {
  id: string;
  businessId: string;
  contactId: string;
  publicCode: string;
  status: string;
  validUntil: Date | null;
  reference: string | null;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  contact: { id: string; name: string; email: string | null };
  invoiceFromQuote: { id: string; publicCode: string; status: string } | null;
  lines: Array<{
    id: string;
    chartOfAccountId: string;
    narration: string;
    quantity: Prisma.Decimal;
    unitLabel: string | null;
    unitAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    sortOrder: number;
    chartOfAccount: { id: string; code: string; name: string };
  }>;
}) {
  return {
    id: q.id,
    businessId: q.businessId,
    contactId: q.contactId,
    publicCode: q.publicCode,
    status: q.status,
    validUntil: q.validUntil?.toISOString() ?? null,
    reference: q.reference,
    currency: q.currency,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
    contact: q.contact,
    invoiceFromQuote: q.invoiceFromQuote,
    lines: q.lines.map(formatSalesLineRow),
  };
}

export function formatSalesInvoiceApi(inv: {
  id: string;
  businessId: string;
  contactId: string;
  sourceQuotationId: string | null;
  publicCode: string;
  status: string;
  issueDate: Date;
  dueDate: Date | null;
  reference: string | null;
  currency: string;
  settlementChartAccountId: string | null;
  journalEntryId: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  contact: { id: string; name: string; email: string | null };
  sourceQuotation: { id: string; publicCode: string } | null;
  journalEntry?: { id: string; postedAt: Date } | null;
  lines: Array<{
    id: string;
    chartOfAccountId: string;
    narration: string;
    quantity: Prisma.Decimal;
    unitLabel: string | null;
    unitAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    sortOrder: number;
    chartOfAccount: { id: string; code: string; name: string };
  }>;
}) {
  return {
    id: inv.id,
    businessId: inv.businessId,
    contactId: inv.contactId,
    sourceQuotationId: inv.sourceQuotationId,
    publicCode: inv.publicCode,
    status: inv.status,
    issueDate: inv.issueDate.toISOString(),
    dueDate: inv.dueDate?.toISOString() ?? null,
    reference: inv.reference,
    currency: inv.currency,
    settlementChartAccountId: inv.settlementChartAccountId,
    journalEntryId: inv.journalEntryId,
    approvedAt: inv.approvedAt?.toISOString() ?? null,
    paidAt: inv.paidAt?.toISOString() ?? null,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
    contact: inv.contact,
    sourceQuotation: inv.sourceQuotation,
    journalEntry: inv.journalEntry
      ? { id: inv.journalEntry.id, postedAt: inv.journalEntry.postedAt.toISOString() }
      : null,
    lines: inv.lines.map(formatSalesLineRow),
  };
}

export function formatBillApi(bill: {
  id: string;
  businessId: string;
  contactId: string;
  publicCode: string;
  status: string;
  issueDate: Date;
  dueDate: Date | null;
  reference: string | null;
  currency: string;
  settlementChartAccountId: string | null;
  journalEntryId: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  contact: { id: string; name: string; email: string | null };
  journalEntry?: { id: string; postedAt: Date } | null;
  lines: Array<{
    id: string;
    chartOfAccountId: string;
    narration: string;
    quantity: Prisma.Decimal;
    unitLabel: string | null;
    unitAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    sortOrder: number;
    chartOfAccount: { id: string; code: string; name: string };
  }>;
}) {
  return {
    id: bill.id,
    businessId: bill.businessId,
    contactId: bill.contactId,
    publicCode: bill.publicCode,
    status: bill.status,
    issueDate: bill.issueDate.toISOString(),
    dueDate: bill.dueDate?.toISOString() ?? null,
    reference: bill.reference,
    currency: bill.currency,
    settlementChartAccountId: bill.settlementChartAccountId,
    journalEntryId: bill.journalEntryId,
    approvedAt: bill.approvedAt?.toISOString() ?? null,
    paidAt: bill.paidAt?.toISOString() ?? null,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
    contact: bill.contact,
    journalEntry: bill.journalEntry
      ? { id: bill.journalEntry.id, postedAt: bill.journalEntry.postedAt.toISOString() }
      : null,
    lines: bill.lines.map(formatSalesLineRow),
  };
}

export function formatPlatformBillApi(bill: {
  id: string;
  supplierId: string;
  publicCode: string;
  status: string;
  issueDate: Date;
  dueDate: Date | null;
  reference: string | null;
  currency: string;
  settlementChartAccountId: string | null;
  platformJournalEntryId: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  supplier: { id: string; name: string; email: string | null };
  journalEntry?: { id: string; postedAt: Date } | null;
  lines: Array<{
    id: string;
    chartOfAccountId: string;
    narration: string;
    quantity: Prisma.Decimal;
    unitLabel: string | null;
    unitAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    sortOrder: number;
    chartOfAccount: { id: string; code: string; name: string };
  }>;
}) {
  return {
    id: bill.id,
    supplierId: bill.supplierId,
    publicCode: bill.publicCode,
    status: bill.status,
    issueDate: bill.issueDate.toISOString(),
    dueDate: bill.dueDate?.toISOString() ?? null,
    reference: bill.reference,
    currency: bill.currency,
    settlementChartAccountId: bill.settlementChartAccountId,
    platformJournalEntryId: bill.platformJournalEntryId,
    approvedAt: bill.approvedAt?.toISOString() ?? null,
    paidAt: bill.paidAt?.toISOString() ?? null,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
    supplier: bill.supplier,
    journalEntry: bill.journalEntry
      ? { id: bill.journalEntry.id, postedAt: bill.journalEntry.postedAt.toISOString() }
      : null,
    lines: bill.lines.map(formatSalesLineRow),
  };
}
