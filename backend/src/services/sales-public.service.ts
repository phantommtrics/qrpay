import type { Request } from "express";
import { SalesInvoiceStatus, SalesQuotationStatus } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  listOrderCheckoutWallets,
  startGatewayWalletCheckoutForInvoice,
  type GatewayWalletCheckoutResult,
} from "./order-wallet-checkout.service.js";
import { formatSalesInvoiceApi, formatSalesQuotationApi } from "./sales-document-api-format.js";
import { acceptSalesQuotation, rejectSalesQuotation } from "./sales-quotation.service.js";

const quotationGuestInclude = {
  contact: { select: { id: true, name: true, email: true } },
  invoiceFromQuote: { select: { id: true, publicCode: true, status: true } },
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
  },
  business: { select: { name: true } },
} as const;

const invoiceGuestInclude = {
  contact: { select: { id: true, name: true, email: true } },
  sourceQuotation: { select: { id: true, publicCode: true } },
  journalEntry: { select: { id: true, postedAt: true } },
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
  },
  business: { select: { name: true } },
} as const;

export async function getGuestQuotationByToken(guestToken: string) {
  const t = guestToken?.trim();
  if (!t) {
    throw new HttpError(400, "Invalid link.");
  }
  const q = await prisma.salesQuotation.findUnique({
    where: { guestToken: t },
    include: quotationGuestInclude,
  });
  if (!q) {
    throw new HttpError(404, "Quotation not found.");
  }
  const canRespond = q.status === SalesQuotationStatus.SENT;
  return {
    businessName: q.business.name,
    canRespond,
    document: formatSalesQuotationApi(q),
  };
}

export async function guestRespondQuotation(guestToken: string, action: "accept" | "reject") {
  const t = guestToken?.trim();
  if (!t) {
    throw new HttpError(400, "Invalid link.");
  }
  const q = await prisma.salesQuotation.findUnique({
    where: { guestToken: t },
  });
  if (!q) {
    throw new HttpError(404, "Quotation not found.");
  }
  if (q.status !== SalesQuotationStatus.SENT) {
    throw new HttpError(400, "This quotation can no longer be accepted or rejected online.");
  }
  if (action === "reject") {
    await rejectSalesQuotation(q.businessId, q.id);
    const qAfter = await prisma.salesQuotation.findUnique({
      where: { id: q.id },
      include: quotationGuestInclude,
    });
    if (!qAfter) {
      throw new HttpError(500, "Quotation not found after reject.");
    }
    return {
      businessName: qAfter.business.name,
      canRespond: false,
      document: formatSalesQuotationApi(qAfter),
    };
  }

  const invoice = await acceptSalesQuotation(q.businessId, q.id);
  const qAfter = await prisma.salesQuotation.findUnique({
    where: { id: q.id },
    include: quotationGuestInclude,
  });
  if (!qAfter) {
    throw new HttpError(500, "Quotation not found after accept.");
  }
  return {
    businessName: qAfter.business.name,
    canRespond: false,
    document: formatSalesQuotationApi(qAfter),
    createdInvoice: formatSalesInvoiceApi(invoice),
  };
}

export async function getGuestInvoiceByToken(guestToken: string) {
  const t = guestToken?.trim();
  if (!t) {
    throw new HttpError(400, "Invalid link.");
  }
  const inv = await prisma.salesInvoice.findUnique({
    where: { guestToken: t },
    include: invoiceGuestInclude,
  });
  if (!inv) {
    throw new HttpError(404, "Invoice not found.");
  }
  const canPay = inv.status === SalesInvoiceStatus.APPROVED && !inv.journalEntryId;
  return {
    businessName: inv.business.name,
    canPay,
    document: formatSalesInvoiceApi(inv),
  };
}

export async function listGuestInvoiceWallets(guestToken: string) {
  const t = guestToken?.trim();
  if (!t) {
    throw new HttpError(400, "Invalid link.");
  }
  const inv = await prisma.salesInvoice.findUnique({
    where: { guestToken: t },
    select: {
      id: true,
      businessId: true,
      status: true,
      journalEntryId: true,
    },
  });
  if (!inv) {
    throw new HttpError(404, "Invoice not found.");
  }
  if (inv.status !== SalesInvoiceStatus.APPROVED || inv.journalEntryId) {
    throw new HttpError(400, "This invoice cannot be paid online.");
  }
  return listOrderCheckoutWallets(inv.businessId);
}

export type GuestInvoiceWalletCheckoutResult = GatewayWalletCheckoutResult & {
  invoicePublicCode: string;
};

export async function startGuestInvoiceWalletCheckout(
  guestToken: string,
  input: { gatewayCode: string; payerPhone?: string },
  req: Request,
): Promise<GuestInvoiceWalletCheckoutResult> {
  const t = guestToken?.trim();
  if (!t) {
    throw new HttpError(400, "Invalid link.");
  }
  const inv = await prisma.salesInvoice.findUnique({
    where: { guestToken: t },
    select: {
      id: true,
      businessId: true,
      status: true,
      journalEntryId: true,
      publicCode: true,
    },
  });
  if (!inv) {
    throw new HttpError(404, "Invoice not found.");
  }
  if (inv.status !== SalesInvoiceStatus.APPROVED || inv.journalEntryId) {
    throw new HttpError(400, "This invoice cannot be paid online.");
  }
  const code = input.gatewayCode?.trim();
  if (!code) {
    throw new HttpError(400, "gatewayCode is required.");
  }
  const result = await startGatewayWalletCheckoutForInvoice({
    invoiceId: inv.id,
    businessId: inv.businessId,
    gatewayCode: code,
    payerPhone: input.payerPhone,
    req,
  });
  return { ...result, invoicePublicCode: inv.publicCode };
}
