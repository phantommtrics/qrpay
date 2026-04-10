import { BillStatus } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { buildPlatformBillPdfBuffer, loadPlatformBillForPdf } from "./platform-bill-document-pdf.service.js";

const include = {
  supplier: { select: { id: true, name: true, email: true } },
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
  },
} as const;

export async function getGuestPlatformBillPayload(guestToken: string) {
  const t = guestToken?.trim();
  if (!t) {
    throw new HttpError(400, "Invalid link.");
  }

  const row = await prisma.platformBill.findFirst({
    where: { guestToken: t },
    include,
  });

  if (!row) {
    throw new HttpError(404, "Bill not found.");
  }

  if (row.status !== BillStatus.APPROVED && row.status !== BillStatus.PAID) {
    throw new HttpError(404, "Bill not available.");
  }

  let total = 0;
  const lines = row.lines.map((l) => {
    const q = Number(l.quantity);
    const u = Number(l.unitAmount);
    const tax = Number(l.taxAmount);
    const lineTotal = q * u + tax;
    total += lineTotal;
    return {
      id: l.id,
      narration: l.narration,
      quantity: q,
      unitLabel: l.unitLabel,
      unitAmount: u,
      taxAmount: tax,
      lineTotal,
      chartOfAccount: {
        code: l.chartOfAccount.code,
        name: l.chartOfAccount.name,
      },
    };
  });

  return {
    publicCode: row.publicCode,
    status: row.status,
    currency: row.currency,
    issueDate: row.issueDate.toISOString(),
    dueDate: row.dueDate?.toISOString() ?? null,
    reference: row.reference,
    total,
    supplierName: row.supplier.name,
    paidAt: row.paidAt?.toISOString() ?? null,
    lines,
  };
}

export async function renderGuestPlatformBillPdf(guestToken: string): Promise<{ buffer: Buffer; filename: string }> {
  const t = guestToken?.trim();
  if (!t) {
    throw new HttpError(400, "Invalid link.");
  }

  const row = await prisma.platformBill.findFirst({
    where: { guestToken: t },
    select: { id: true },
  });
  if (!row) {
    throw new HttpError(404, "Bill not found.");
  }

  const full = await loadPlatformBillForPdf(row.id);
  if (full.status !== BillStatus.APPROVED && full.status !== BillStatus.PAID) {
    throw new HttpError(404, "Bill not available.");
  }

  const buffer = await buildPlatformBillPdfBuffer(full);
  const safe = full.publicCode.replace(/[^a-zA-Z0-9-_]/g, "_");
  return { buffer, filename: `bill-${safe}.pdf` };
}
