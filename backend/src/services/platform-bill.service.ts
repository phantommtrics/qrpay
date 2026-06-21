import { BillStatus, Prisma } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { queuePlatformBillApprovedEmail } from "./platform-bill-email.service.js";
import { allocatePlatformBillPublicCode } from "./sales-document-code.service.js";
import { postPlatformMoneyOutJournalForPurchaseBill } from "./platform-purchase-bill-journal.service.js";
import type { SalesLineInput } from "./sales-quotation.service.js";

function assertLines(lines: SalesLineInput[]) {
  if (!lines.length) {
    throw new HttpError(400, "Add at least one line.");
  }
}

const billInclude = {
  supplier: { select: { id: true, name: true, email: true, phone: true } },
  journalEntry: { select: { id: true, postedAt: true } },
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
  },
} as const;

export async function listPlatformSuppliers() {
  return prisma.platformSupplier.findMany({
    orderBy: { name: "asc" },
  });
}

export async function createPlatformSupplier(input: { name: string; email?: string | null; phone?: string | null }) {
  const name = input.name.trim();
  if (!name) {
    throw new HttpError(400, "Supplier name is required.");
  }
  return prisma.platformSupplier.create({
    data: {
      name,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
    },
  });
}

export async function updatePlatformSupplier(
  supplierId: string,
  input: { name?: string; email?: string | null; phone?: string | null },
) {
  const existing = await prisma.platformSupplier.findFirst({ where: { id: supplierId } });
  if (!existing) {
    throw new HttpError(404, "Supplier not found.");
  }
  const name = input.name !== undefined ? input.name.trim() : undefined;
  if (name !== undefined && !name) {
    throw new HttpError(400, "Supplier name is required.");
  }
  return prisma.platformSupplier.update({
    where: { id: supplierId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
    },
  });
}

export async function getPlatformBillById(billId: string) {
  const row = await prisma.platformBill.findFirst({
    where: { id: billId },
    include: billInclude,
  });
  if (!row) {
    throw new HttpError(404, "Bill not found.");
  }
  return row;
}

export async function listPlatformBills() {
  return prisma.platformBill.findMany({
    orderBy: { createdAt: "desc" },
    include: billInclude,
  });
}

export async function createPlatformBill(input: {
  supplierId: string;
  issueDate: Date;
  dueDate?: Date | null;
  reference?: string | null;
  currency?: string;
  lines: SalesLineInput[];
}) {
  assertLines(input.lines);
  return prisma.$transaction(async (tx) => {
    const supplier = await tx.platformSupplier.findFirst({
      where: { id: input.supplierId },
    });
    if (!supplier) {
      throw new HttpError(404, "Supplier not found.");
    }
    const publicCode = await allocatePlatformBillPublicCode(tx);
    return tx.platformBill.create({
      data: {
        supplierId: input.supplierId,
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
        supplier: { select: { id: true, name: true, email: true, phone: true } },
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
        },
      },
    });
  });
}

export async function updatePlatformBillDraft(
  billId: string,
  input: {
    supplierId?: string;
    issueDate?: Date;
    dueDate?: Date | null;
    reference?: string | null;
    currency?: string;
    lines?: SalesLineInput[];
  },
) {
  const existing = await prisma.platformBill.findFirst({
    where: { id: billId },
    include: { lines: true },
  });
  if (!existing) {
    throw new HttpError(404, "Bill not found.");
  }
  if (existing.status !== BillStatus.DRAFT) {
    throw new HttpError(400, "Only draft bills can be edited.");
  }

  if (input.supplierId) {
    const supplier = await prisma.platformSupplier.findFirst({
      where: { id: input.supplierId },
    });
    if (!supplier) {
      throw new HttpError(404, "Supplier not found.");
    }
  }

  return prisma.$transaction(async (tx) => {
    if (input.lines) {
      assertLines(input.lines);
      await tx.platformBillLine.deleteMany({ where: { billId } });
    }

    return tx.platformBill.update({
      where: { id: billId },
      data: {
        ...(input.supplierId ? { supplierId: input.supplierId } : {}),
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
        supplier: { select: { id: true, name: true, email: true, phone: true } },
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
        },
      },
    });
  });
}

export async function approvePlatformBill(billId: string) {
  const bill = await prisma.platformBill.findFirst({
    where: { id: billId },
    include: { supplier: true, lines: { orderBy: { sortOrder: "asc" } } },
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
  const email = bill.supplier.email?.trim();
  if (!email) {
    throw new HttpError(
      400,
      "The supplier must have an email address before you can approve and notify them.",
    );
  }

  const updated = await prisma.platformBill.update({
    where: { id: billId },
    data: {
      status: BillStatus.APPROVED,
      approvedAt: new Date(),
    },
    include: {
      supplier: { select: { id: true, name: true, email: true, phone: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
      },
    },
  });
  queuePlatformBillApprovedEmail(billId);
  return updated;
}

export async function markPlatformBillPaid(
  billId: string,
  input: {
    settlementChartAccountId: string;
    postedAt: Date;
    paymentGatewayCode?: string | null;
    paymentProviderRef?: string | null;
  },
) {
  const bill = await prisma.platformBill.findFirst({
    where: { id: billId },
    include: {
      supplier: true,
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!bill) {
    throw new HttpError(404, "Bill not found.");
  }
  if (bill.status !== BillStatus.APPROVED) {
    throw new HttpError(400, "Only approved bills can be marked as paid.");
  }
  if (bill.platformJournalEntryId) {
    throw new HttpError(400, "This bill is already posted to the ledger.");
  }
  if (!bill.lines.length) {
    throw new HttpError(400, "Bill has no lines.");
  }

  const memo = [
    `Platform purchase bill ${bill.publicCode} — payment sent`,
    bill.reference?.trim() ? `Ref: ${bill.reference.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return prisma.$transaction(async (tx) => {
    const entry = await postPlatformMoneyOutJournalForPurchaseBill(tx, {
      billId: bill.id,
      postedAt: input.postedAt,
      reference: bill.publicCode,
      settlementChartAccountId: input.settlementChartAccountId,
      memo,
      lines: bill.lines,
    });

    await tx.platformBill.update({
      where: { id: bill.id },
      data: {
        status: BillStatus.PAID,
        paidAt: new Date(),
        platformJournalEntryId: entry.id,
        settlementChartAccountId: input.settlementChartAccountId,
        paymentGatewayCode: input.paymentGatewayCode?.trim() || null,
        paymentProviderRef: input.paymentProviderRef?.trim() || null,
      },
    });

    return tx.platformBill.findFirstOrThrow({
      where: { id: bill.id },
      include: {
        supplier: { select: { id: true, name: true, email: true, phone: true } },
        journalEntry: { select: { id: true, postedAt: true } },
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
        },
      },
    });
  });
}

export async function voidPlatformBill(billId: string) {
  const bill = await prisma.platformBill.findFirst({ where: { id: billId } });
  if (!bill) {
    throw new HttpError(404, "Bill not found.");
  }
  if (bill.status === BillStatus.PAID) {
    throw new HttpError(400, "Paid bills cannot be voided in-app (ledger already posted).");
  }
  if (bill.status === BillStatus.VOID) {
    throw new HttpError(400, "Bill is already void.");
  }
  return prisma.platformBill.update({
    where: { id: billId },
    data: { status: BillStatus.VOID },
    include: {
      supplier: { select: { id: true, name: true, email: true, phone: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
      },
    },
  });
}
