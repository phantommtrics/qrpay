import { BillStatus, Prisma } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { allocateBillPublicCode } from "./sales-document-code.service.js";
import { queueBillApprovedEmail } from "./bill-email.service.js";
import {
  type ManualJournalLineInput,
  postMoneyOutJournalForBill,
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

const billInclude = {
  contact: { select: { id: true, name: true, email: true, phone: true } },
  journalEntry: { select: { id: true, postedAt: true } },
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
  },
} as const;

export async function getBillById(businessId: string, billId: string) {
  const row = await prisma.bill.findFirst({
    where: { id: billId, businessId },
    include: billInclude,
  });
  if (!row) {
    throw new HttpError(404, "Bill not found.");
  }
  return row;
}

export async function listBills(businessId: string) {
  return prisma.bill.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    include: billInclude,
  });
}

export async function createBill(
  businessId: string,
  input: {
    contactId: string;
    issueDate: Date;
    dueDate?: Date | null;
    reference?: string | null;
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
    const publicCode = await allocateBillPublicCode(tx, businessId);
    return tx.bill.create({
      data: {
        businessId,
        contactId: input.contactId,
        publicCode,
        status: BillStatus.DRAFT,
        issueDate: input.issueDate,
        dueDate: input.dueDate ?? null,
        reference: input.reference?.trim() || null,
        currency: (input.currency ?? "GMD").trim() || "GMD",
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
        contact: { select: { id: true, name: true, email: true, phone: true } },
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
        },
      },
    });
  });
}

export async function updateBillDraft(
  businessId: string,
  billId: string,
  input: {
    contactId?: string;
    issueDate?: Date;
    dueDate?: Date | null;
    reference?: string | null;
    currency?: string;
    lines?: SalesLineInput[];
  },
) {
  const existing = await prisma.bill.findFirst({
    where: { id: billId, businessId },
    include: { lines: true },
  });
  if (!existing) {
    throw new HttpError(404, "Bill not found.");
  }
  if (existing.status !== BillStatus.DRAFT) {
    throw new HttpError(400, "Only draft bills can be edited.");
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
      await tx.billLine.deleteMany({ where: { billId } });
    }

    return tx.bill.update({
      where: { id: billId },
      data: {
        ...(input.contactId ? { contactId: input.contactId } : {}),
        ...(input.issueDate ? { issueDate: input.issueDate } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.reference !== undefined ? { reference: input.reference?.trim() || null } : {}),
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
        contact: { select: { id: true, name: true, email: true, phone: true } },
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
        },
      },
    });
  });
}

/** Approve / issue bill — emails the supplier contact when they have an email. GL posts when marked paid. */
export async function approveBill(businessId: string, billId: string) {
  const bill = await prisma.bill.findFirst({
    where: { id: billId, businessId },
    include: { contact: true, lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!bill) {
    throw new HttpError(404, "Bill not found.");
  }
  if (bill.status !== BillStatus.DRAFT) {
    throw new HttpError(400, "Only draft bills can be approved.");
  }
  if (!bill.lines.length) {
    throw new HttpError(400, "Bill has no lines.");
  }
  const email = bill.contact.email?.trim();
  if (!email) {
    throw new HttpError(
      400,
      "The supplier contact must have an email address before you can approve and notify them.",
    );
  }

  const updated = await prisma.bill.update({
    where: { id: billId },
    data: {
      status: BillStatus.APPROVED,
      approvedAt: new Date(),
    },
    include: {
      contact: { select: { id: true, name: true, email: true, phone: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
      },
    },
  });

  queueBillApprovedEmail(billId);
  return updated;
}

/** Cash-basis: posts GL (money-out shape) when payment is recorded. */
export async function markBillPaid(
  businessId: string,
  billId: string,
  input: {
    settlementChartAccountId: string;
    postedAt: Date;
    paymentGatewayCode?: string | null;
    paymentProviderRef?: string | null;
  },
) {
  const bill = await prisma.bill.findFirst({
    where: { id: billId, businessId },
    include: {
      contact: true,
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!bill) {
    throw new HttpError(404, "Bill not found.");
  }
  if (bill.status !== BillStatus.APPROVED) {
    throw new HttpError(400, "Only approved bills can be marked as paid.");
  }
  if (bill.journalEntryId) {
    throw new HttpError(400, "This bill is already posted to the ledger.");
  }
  if (!bill.lines.length) {
    throw new HttpError(400, "Bill has no lines.");
  }

  const journalLines = linesToJournalInput(bill.lines);
  const memo = [
    `Purchase bill ${bill.publicCode} — payment sent`,
    bill.reference?.trim() ? `Ref: ${bill.reference.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return prisma.$transaction(async (tx) => {
    const entry = await postMoneyOutJournalForBill(
      businessId,
      {
        billId: bill.id,
        contactId: bill.contactId,
        postedAt: input.postedAt,
        reference: bill.publicCode,
        settlementChartAccountId: input.settlementChartAccountId,
        lines: journalLines,
        memo,
      },
      tx,
    );

    await tx.bill.update({
      where: { id: bill.id },
      data: {
        status: BillStatus.PAID,
        paidAt: new Date(),
        journalEntryId: entry.id,
        settlementChartAccountId: input.settlementChartAccountId,
        paymentGatewayCode: input.paymentGatewayCode?.trim() || null,
        paymentProviderRef: input.paymentProviderRef?.trim() || null,
      },
    });

    return tx.bill.findFirstOrThrow({
      where: { id: bill.id },
      include: {
        contact: { select: { id: true, name: true, email: true, phone: true } },
        journalEntry: { select: { id: true, postedAt: true } },
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
        },
      },
    });
  });
}

export async function voidBill(businessId: string, billId: string) {
  const bill = await prisma.bill.findFirst({ where: { id: billId, businessId } });
  if (!bill) {
    throw new HttpError(404, "Bill not found.");
  }
  if (bill.status === BillStatus.PAID) {
    throw new HttpError(400, "Paid bills cannot be voided in-app (ledger already posted).");
  }
  if (bill.status === BillStatus.VOID) {
    throw new HttpError(400, "Bill is already void.");
  }
  return prisma.bill.update({
    where: { id: billId },
    data: { status: BillStatus.VOID },
    include: {
      contact: { select: { id: true, name: true, email: true, phone: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
      },
    },
  });
}
