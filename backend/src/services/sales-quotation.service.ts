import { Prisma, SalesInvoiceStatus, SalesQuotationStatus } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { newGuestToken } from "../lib/guest-token.js";
import { prisma } from "../lib/prisma.js";
import { queueSalesQuotationSentEmail } from "./sales-quotation-email.service.js";
import { allocateInvoicePublicCode, allocateQuotationPublicCode } from "./sales-document-code.service.js";

export type SalesLineInput = {
  chartOfAccountId: string;
  narration: string;
  quantity: number;
  unitLabel?: string | null;
  unitAmount: number;
  taxAmount: number;
};

function assertLines(lines: SalesLineInput[]) {
  if (!lines.length) {
    throw new HttpError(400, "Add at least one line.");
  }
}

const quotationInclude = {
  contact: { select: { id: true, name: true, email: true } },
  invoiceFromQuote: { select: { id: true, publicCode: true, status: true } },
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
  },
} as const;

export async function getSalesQuotationById(businessId: string, quotationId: string) {
  const row = await prisma.salesQuotation.findFirst({
    where: { id: quotationId, businessId },
    include: quotationInclude,
  });
  if (!row) {
    throw new HttpError(404, "Quotation not found.");
  }
  return row;
}

export async function listSalesQuotations(businessId: string) {
  return prisma.salesQuotation.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    include: quotationInclude,
  });
}

export async function createSalesQuotation(
  businessId: string,
  input: {
    contactId: string;
    reference?: string | null;
    validUntil?: Date | null;
    currency?: string;
    lines: SalesLineInput[];
  },
) {
  assertLines(input.lines);
  return prisma.$transaction(async (tx) => {
    const contact = await tx.businessContact.findFirst({
      where: { id: input.contactId, businessId },
    });
    if (!contact) {
      throw new HttpError(404, "Contact not found.");
    }
    const publicCode = await allocateQuotationPublicCode(tx, businessId);
    return tx.salesQuotation.create({
      data: {
        businessId,
        contactId: input.contactId,
        publicCode,
        reference: input.reference?.trim() || null,
        validUntil: input.validUntil ?? null,
        currency: (input.currency ?? "GMD").trim() || "GMD",
        status: SalesQuotationStatus.DRAFT,
        lines: {
          create: input.lines.map((l, sortOrder) => ({
            chartOfAccountId: l.chartOfAccountId,
            narration: l.narration.trim() || "Line",
            quantity: new Prisma.Decimal(l.quantity),
            unitLabel: l.unitLabel?.trim() || null,
            unitAmount: new Prisma.Decimal(l.unitAmount),
            taxAmount: new Prisma.Decimal(l.taxAmount ?? 0),
            sortOrder,
          })),
        },
      },
      include: {
        contact: { select: { id: true, name: true, email: true } },
        invoiceFromQuote: { select: { id: true, publicCode: true, status: true } },
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
        },
      },
    });
  });
}

export async function updateSalesQuotationDraft(
  businessId: string,
  quotationId: string,
  input: {
    contactId?: string;
    reference?: string | null;
    validUntil?: Date | null;
    currency?: string;
    lines?: SalesLineInput[];
  },
) {
  const existing = await prisma.salesQuotation.findFirst({
    where: { id: quotationId, businessId },
    include: { lines: true },
  });
  if (!existing) {
    throw new HttpError(404, "Quotation not found.");
  }
  if (existing.status !== SalesQuotationStatus.DRAFT) {
    throw new HttpError(400, "Only draft quotations can be edited.");
  }

  if (input.contactId) {
    const contact = await prisma.businessContact.findFirst({
      where: { id: input.contactId, businessId },
    });
    if (!contact) {
      throw new HttpError(404, "Contact not found.");
    }
  }

  return prisma.$transaction(async (tx) => {
    if (input.lines) {
      assertLines(input.lines);
      await tx.salesQuotationLine.deleteMany({ where: { quotationId } });
    }

    return tx.salesQuotation.update({
      where: { id: quotationId },
      data: {
        ...(input.contactId ? { contactId: input.contactId } : {}),
        ...(input.reference !== undefined ? { reference: input.reference?.trim() || null } : {}),
        ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
        ...(input.currency !== undefined
          ? { currency: (input.currency ?? "GMD").trim() || "GMD" }
          : {}),
        ...(input.lines
          ? {
              lines: {
                create: input.lines.map((l, sortOrder) => ({
                  chartOfAccountId: l.chartOfAccountId,
                  narration: l.narration.trim() || "Line",
                  quantity: new Prisma.Decimal(l.quantity),
                  unitLabel: l.unitLabel?.trim() || null,
                  unitAmount: new Prisma.Decimal(l.unitAmount),
                  taxAmount: new Prisma.Decimal(l.taxAmount ?? 0),
                  sortOrder,
                })),
              },
            }
          : {}),
      },
      include: {
        contact: { select: { id: true, name: true, email: true } },
        invoiceFromQuote: { select: { id: true, publicCode: true, status: true } },
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
        },
      },
    });
  });
}

export async function sendSalesQuotation(businessId: string, quotationId: string) {
  const q = await prisma.salesQuotation.findFirst({
    where: { id: quotationId, businessId },
    include: { contact: { select: { id: true, email: true } } },
  });
  if (!q) {
    throw new HttpError(404, "Quotation not found.");
  }
  if (q.status !== SalesQuotationStatus.DRAFT) {
    throw new HttpError(400, "Only draft quotations can be marked as sent.");
  }
  const email = q.contact.email?.trim();
  if (!email) {
    throw new HttpError(
      400,
      "The quotation contact must have an email address before you can send it to the customer.",
    );
  }
  const guestToken = q.guestToken ?? newGuestToken();
  const row = await prisma.salesQuotation.update({
    where: { id: quotationId },
    data: { status: SalesQuotationStatus.SENT, guestToken },
    include: {
      contact: { select: { id: true, name: true, email: true } },
      invoiceFromQuote: { select: { id: true, publicCode: true, status: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
      },
    },
  });
  queueSalesQuotationSentEmail(quotationId);
  return row;
}

export async function rejectSalesQuotation(businessId: string, quotationId: string) {
  const q = await prisma.salesQuotation.findFirst({ where: { id: quotationId, businessId } });
  if (!q) {
    throw new HttpError(404, "Quotation not found.");
  }
  if (q.status === SalesQuotationStatus.ACCEPTED || q.status === SalesQuotationStatus.REJECTED) {
    throw new HttpError(400, "Quotation is already final.");
  }
  return prisma.salesQuotation.update({
    where: { id: quotationId },
    data: { status: SalesQuotationStatus.REJECTED },
    include: {
      contact: { select: { id: true, name: true, email: true } },
      invoiceFromQuote: { select: { id: true, publicCode: true, status: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
      },
    },
  });
}

/** Accept quote → creates a draft sales invoice with the same lines (Xero-style convert to invoice). */
export async function acceptSalesQuotation(businessId: string, quotationId: string) {
  return prisma.$transaction(async (tx) => {
    const q = await tx.salesQuotation.findFirst({
      where: { id: quotationId, businessId },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!q) {
      throw new HttpError(404, "Quotation not found.");
    }
    if (q.status === SalesQuotationStatus.REJECTED || q.status === SalesQuotationStatus.ACCEPTED) {
      throw new HttpError(400, "Quotation is already final.");
    }
    const dup = await tx.salesInvoice.findFirst({ where: { sourceQuotationId: q.id } });
    if (dup) {
      throw new HttpError(400, "Quotation already converted to an invoice.");
    }

    const publicCode = await allocateInvoicePublicCode(tx, businessId);
    const invoice = await tx.salesInvoice.create({
      data: {
        businessId,
        contactId: q.contactId,
        sourceQuotationId: q.id,
        publicCode,
        status: SalesInvoiceStatus.DRAFT,
        issueDate: new Date(),
        reference: q.reference,
        currency: q.currency,
        lines: {
          create: q.lines.map((l, sortOrder) => ({
            chartOfAccountId: l.chartOfAccountId,
            narration: l.narration,
            quantity: l.quantity,
            unitLabel: l.unitLabel,
            unitAmount: l.unitAmount,
            taxAmount: l.taxAmount,
            sortOrder,
          })),
        },
      },
      include: {
        contact: { select: { id: true, name: true, email: true } },
        sourceQuotation: { select: { id: true, publicCode: true } },
        journalEntry: { select: { id: true, postedAt: true } },
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
        },
      },
    });

    await tx.salesQuotation.update({
      where: { id: q.id },
      data: { status: SalesQuotationStatus.ACCEPTED },
    });

    return invoice;
  });
}
