import { ChartAccountCategory, PaymentStatus, Prisma, SalesInvoiceStatus } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { newGuestToken } from "../lib/guest-token.js";
import { prisma } from "../lib/prisma.js";
import { allocateInvoicePublicCode } from "./sales-document-code.service.js";
import { queueSalesInvoiceApprovedEmail } from "./sales-invoice-email.service.js";
import {
  type ManualJournalLineInput,
  postMoneyInJournalForSalesInvoice,
  postMoneyInJournalForSalesInvoiceWalletClearing,
} from "./manual-journal.service.js";
import type { SalesLineInput } from "./sales-quotation.service.js";

function assertLines(lines: SalesLineInput[]) {
  if (!lines.length) {
    throw new HttpError(400, "Add at least one line.");
  }
}

function linesToJournalInput(
  lines: {
    narration: string;
    quantity: Prisma.Decimal;
    unitLabel: string | null;
    unitAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    chartOfAccountId: string;
  }[],
): ManualJournalLineInput[] {
  return lines.map((l) => ({
    chartOfAccountId: l.chartOfAccountId,
    narration: l.narration,
    quantity: Number(l.quantity),
    unitLabel: l.unitLabel,
    unitAmount: Number(l.unitAmount),
    taxAmount: Number(l.taxAmount),
  }));
}

const invoiceInclude = {
  contact: { select: { id: true, name: true, email: true } },
  sourceQuotation: { select: { id: true, publicCode: true } },
  journalEntry: { select: { id: true, postedAt: true } },
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
  },
} as const;

export async function getSalesInvoiceById(businessId: string, invoiceId: string) {
  const row = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, businessId },
    include: invoiceInclude,
  });
  if (!row) {
    throw new HttpError(404, "Invoice not found.");
  }
  return row;
}

export async function listSalesInvoices(businessId: string) {
  return prisma.salesInvoice.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    include: invoiceInclude,
  });
}

export async function createSalesInvoice(
  businessId: string,
  input: {
    contactId: string;
    issueDate: Date;
    dueDate?: Date | null;
    reference?: string | null;
    currency?: string;
    /** Bank/cash asset where online wallet proceeds should be recorded when the invoice is paid. */
    settlementChartAccountId?: string | null;
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
    let settlementId: string | null = null;
    const rawSettle = input.settlementChartAccountId?.trim();
    if (rawSettle) {
      const acct = await tx.chartOfAccount.findFirst({
        where: { id: rawSettle, businessId },
      });
      if (!acct) {
        throw new HttpError(404, "Settlement chart account not found.");
      }
      if (acct.category !== ChartAccountCategory.ASSET) {
        throw new HttpError(400, "Settlement account for invoice proceeds must be an asset (bank or cash).");
      }
      settlementId = acct.id;
    }
    const publicCode = await allocateInvoicePublicCode(tx, businessId);
    return tx.salesInvoice.create({
      data: {
        businessId,
        contactId: input.contactId,
        publicCode,
        status: SalesInvoiceStatus.DRAFT,
        issueDate: input.issueDate,
        dueDate: input.dueDate ?? null,
        reference: input.reference?.trim() || null,
        currency: (input.currency ?? "GMD").trim() || "GMD",
        settlementChartAccountId: settlementId,
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
        sourceQuotation: { select: { id: true, publicCode: true } },
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
        },
      },
    });
  });
}

export async function updateSalesInvoiceDraft(
  businessId: string,
  invoiceId: string,
  input: {
    contactId?: string;
    issueDate?: Date;
    dueDate?: Date | null;
    reference?: string | null;
    currency?: string;
    settlementChartAccountId?: string | null;
    lines?: SalesLineInput[];
  },
) {
  const existing = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, businessId },
    include: { lines: true },
  });
  if (!existing) {
    throw new HttpError(404, "Invoice not found.");
  }
  if (existing.status !== SalesInvoiceStatus.DRAFT) {
    throw new HttpError(400, "Only draft invoices can be edited.");
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
      await tx.salesInvoiceLine.deleteMany({ where: { invoiceId } });
    }

    let settlementPatch: { settlementChartAccountId: string | null } | undefined;
    if (input.settlementChartAccountId !== undefined) {
      const raw = input.settlementChartAccountId?.trim();
      if (!raw) {
        settlementPatch = { settlementChartAccountId: null };
      } else {
        const acct = await tx.chartOfAccount.findFirst({
          where: { id: raw, businessId },
        });
        if (!acct) {
          throw new HttpError(404, "Settlement chart account not found.");
        }
        if (acct.category !== ChartAccountCategory.ASSET) {
          throw new HttpError(400, "Settlement account for invoice proceeds must be an asset (bank or cash).");
        }
        settlementPatch = { settlementChartAccountId: acct.id };
      }
    }

    return tx.salesInvoice.update({
      where: { id: invoiceId },
      data: {
        ...(input.contactId ? { contactId: input.contactId } : {}),
        ...(input.issueDate ? { issueDate: input.issueDate } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.reference !== undefined ? { reference: input.reference?.trim() || null } : {}),
        ...(input.currency !== undefined
          ? { currency: (input.currency ?? "GMD").trim() || "GMD" }
          : {}),
        ...settlementPatch,
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
        sourceQuotation: { select: { id: true, publicCode: true } },
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
        },
      },
    });
  });
}

/** Approve / issue invoice — emails the business contact (requires contact email). GL is not posted until paid. */
export async function approveSalesInvoice(businessId: string, invoiceId: string) {
  const inv = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, businessId },
    include: { contact: true, lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!inv) {
    throw new HttpError(404, "Invoice not found.");
  }
  if (inv.status !== SalesInvoiceStatus.DRAFT) {
    throw new HttpError(400, "Only draft invoices can be approved.");
  }
  if (!inv.lines.length) {
    throw new HttpError(400, "Invoice has no lines.");
  }
  const email = inv.contact.email?.trim();
  if (!email) {
    throw new HttpError(
      400,
      "The invoice contact must have an email address before you can approve and notify them.",
    );
  }

  const updated = await prisma.salesInvoice.update({
    where: { id: invoiceId },
    data: {
      status: SalesInvoiceStatus.APPROVED,
      approvedAt: new Date(),
      guestToken: inv.guestToken ?? newGuestToken(),
    },
    include: {
      contact: { select: { id: true, name: true, email: true } },
      sourceQuotation: { select: { id: true, publicCode: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
      },
    },
  });

  queueSalesInvoiceApprovedEmail(invoiceId);
  return updated;
}

/** Cash-basis: posts GL (money-in shape) when payment is recorded. */
export async function markSalesInvoicePaid(
  businessId: string,
  invoiceId: string,
  input: { settlementChartAccountId: string; postedAt: Date },
) {
  const inv = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, businessId },
    include: {
      contact: true,
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!inv) {
    throw new HttpError(404, "Invoice not found.");
  }
  if (inv.status !== SalesInvoiceStatus.APPROVED) {
    throw new HttpError(400, "Only approved invoices can be marked as paid.");
  }
  if (inv.journalEntryId) {
    throw new HttpError(400, "This invoice is already posted to the ledger.");
  }
  if (!inv.lines.length) {
    throw new HttpError(400, "Invoice has no lines.");
  }

  const journalLines = linesToJournalInput(inv.lines);
  const memo = [
    `Sales invoice ${inv.publicCode} — payment received`,
    inv.reference?.trim() ? `Ref: ${inv.reference.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return prisma.$transaction(async (tx) => {
    const entry = await postMoneyInJournalForSalesInvoice(
      businessId,
      {
        invoiceId: inv.id,
        contactId: inv.contactId,
        postedAt: input.postedAt,
        reference: inv.publicCode,
        settlementChartAccountId: input.settlementChartAccountId,
        lines: journalLines,
        memo,
      },
      tx,
    );

    await tx.salesInvoice.update({
      where: { id: inv.id },
      data: {
        status: SalesInvoiceStatus.PAID,
        paidAt: new Date(),
        journalEntryId: entry.id,
        settlementChartAccountId: input.settlementChartAccountId,
      },
    });

    return tx.salesInvoice.findFirstOrThrow({
      where: { id: inv.id },
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
  });
}

/** Used when a guest completes QR wallet pay for an approved sales invoice (wallet clearing + settlement asset). */
export async function markSalesInvoicePaidWithWalletPayment(
  tx: Prisma.TransactionClient,
  businessId: string,
  invoiceId: string,
  paymentId: string,
  input: { settlementChartAccountId: string; postedAt: Date },
) {
  const inv = await tx.salesInvoice.findFirst({
    where: { id: invoiceId, businessId },
    include: {
      contact: true,
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!inv) {
    throw new HttpError(404, "Invoice not found.");
  }
  if (inv.status !== SalesInvoiceStatus.APPROVED) {
    throw new HttpError(400, "Only approved invoices awaiting payment can be settled.");
  }
  if (inv.journalEntryId) {
    throw new HttpError(400, "This invoice is already posted to the ledger.");
  }
  if (!inv.lines.length) {
    throw new HttpError(400, "Invoice has no lines.");
  }

  const journalLines = linesToJournalInput(inv.lines);
  const memo = [
    `Sales invoice ${inv.publicCode} — wallet payment received`,
    inv.reference?.trim() ? `Ref: ${inv.reference.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const entry = await postMoneyInJournalForSalesInvoiceWalletClearing(
    businessId,
    {
      invoiceId: inv.id,
      contactId: inv.contactId,
      postedAt: input.postedAt,
      reference: inv.publicCode,
      settlementChartAccountId: input.settlementChartAccountId,
      lines: journalLines,
      memo,
    },
    tx,
  );

  await tx.salesInvoice.update({
    where: { id: inv.id },
    data: {
      status: SalesInvoiceStatus.PAID,
      paidAt: new Date(),
      journalEntryId: entry.id,
      settlementChartAccountId: input.settlementChartAccountId,
    },
  });

  await tx.payment.update({
    where: { id: paymentId },
    data: {
      status: PaymentStatus.COMPLETED,
      completedAt: new Date(),
    },
  });
}

export async function voidSalesInvoice(businessId: string, invoiceId: string) {
  const inv = await prisma.salesInvoice.findFirst({ where: { id: invoiceId, businessId } });
  if (!inv) {
    throw new HttpError(404, "Invoice not found.");
  }
  if (inv.status === SalesInvoiceStatus.PAID) {
    throw new HttpError(400, "Paid invoices cannot be voided in-app (ledger already posted).");
  }
  if (inv.status === SalesInvoiceStatus.VOID) {
    throw new HttpError(400, "Invoice is already void.");
  }
  return prisma.salesInvoice.update({
    where: { id: invoiceId },
    data: { status: SalesInvoiceStatus.VOID },
    include: {
      contact: { select: { id: true, name: true, email: true } },
      sourceQuotation: { select: { id: true, publicCode: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
      },
    },
  });
}
