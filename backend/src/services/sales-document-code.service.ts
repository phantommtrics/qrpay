import { randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";

const ATTEMPTS = 12;

export async function allocateQuotationPublicCode(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<string> {
  for (let i = 0; i < ATTEMPTS; i++) {
    const publicCode = `QT-${randomBytes(4).toString("hex").toUpperCase()}`;
    const clash = await tx.salesQuotation.findFirst({
      where: { businessId, publicCode },
      select: { id: true },
    });
    if (!clash) {
      return publicCode;
    }
  }
  throw new HttpError(500, "Could not allocate a quotation reference.");
}

export async function allocateInvoicePublicCode(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<string> {
  for (let i = 0; i < ATTEMPTS; i++) {
    const publicCode = `INV-${randomBytes(4).toString("hex").toUpperCase()}`;
    const clash = await tx.salesInvoice.findFirst({
      where: { businessId, publicCode },
      select: { id: true },
    });
    if (!clash) {
      return publicCode;
    }
  }
  throw new HttpError(500, "Could not allocate an invoice reference.");
}
