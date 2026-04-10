import { InvoiceStatus } from "@prisma/client";
import type { Request } from "express";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  createSubscriptionInvoiceGuestCheckout,
  listSubscriptionInvoiceCheckoutWallets,
} from "./subscription-invoice-checkout.service.js";
import { generateSubscriptionInvoicePdf } from "./subscription-invoice-pdf.service.js";

function safeGuestInvoicePdfFilename(ref: string) {
  const cleaned = ref.replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 80);
  return cleaned.length > 0 ? `invoice-${cleaned}.pdf` : "subscription-invoice.pdf";
}

export async function getGuestSubscriptionInvoiceByToken(guestToken: string) {
  const t = guestToken?.trim();
  if (!t) {
    throw new HttpError(400, "Invalid link.");
  }
  const inv = await prisma.subscriptionInvoice.findFirst({
    where: { guestToken: t },
    include: {
      business: {
        select: {
          name: true,
          ownerName: true,
          ownerEmail: true,
          slug: true,
          industry: true,
        },
      },
      plan: { select: { name: true, code: true, description: true } },
      subscription: { select: { status: true } },
    },
  });
  if (!inv) {
    throw new HttpError(404, "Invoice not found.");
  }
  const canPay = inv.status === InvoiceStatus.PENDING;
  return {
    businessName: inv.business.name,
    business: {
      ownerName: inv.business.ownerName,
      ownerEmail: inv.business.ownerEmail,
      slug: inv.business.slug,
      industry: inv.business.industry,
    },
    canPay,
    invoice: {
      id: inv.id,
      amount: Number(inv.amount),
      currency: inv.currency,
      status: inv.status,
      createdAt: inv.createdAt.toISOString(),
      dueDate: inv.dueDate.toISOString(),
      billingPeriodStart: inv.billingPeriodStart.toISOString(),
      billingPeriodEnd: inv.billingPeriodEnd.toISOString(),
      externalReference: inv.externalReference,
      paidAt: inv.paidAt?.toISOString() ?? null,
      planName: inv.plan.name,
      planCode: inv.plan.code,
      planDescription: inv.plan.description,
      subscriptionStatus: inv.subscription.status,
    },
  };
}

export async function listGuestSubscriptionInvoiceWallets(guestToken: string) {
  const t = guestToken?.trim();
  if (!t) {
    throw new HttpError(400, "Invalid link.");
  }
  const inv = await prisma.subscriptionInvoice.findFirst({
    where: { guestToken: t },
    select: { id: true, businessId: true, status: true },
  });
  if (!inv) {
    throw new HttpError(404, "Invoice not found.");
  }
  if (inv.status !== InvoiceStatus.PENDING) {
    throw new HttpError(400, "This invoice cannot be paid online.");
  }
  return listSubscriptionInvoiceCheckoutWallets();
}

export async function startGuestSubscriptionInvoiceWalletCheckout(
  guestToken: string,
  input: { gatewayCode: string; payerPhone?: string },
  req: Request,
) {
  return createSubscriptionInvoiceGuestCheckout({
    guestToken,
    gatewayCode: input.gatewayCode,
    payerPhone: input.payerPhone,
    req,
  });
}

export async function renderGuestSubscriptionInvoicePdf(guestToken: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const t = guestToken?.trim();
  if (!t) {
    throw new HttpError(400, "Invalid link.");
  }
  const row = await prisma.subscriptionInvoice.findFirst({
    where: { guestToken: t },
    include: { business: true, plan: true, subscription: true },
  });
  if (!row) {
    throw new HttpError(404, "Invoice not found.");
  }
  const buffer = await generateSubscriptionInvoicePdf(row);
  const ref = row.externalReference?.trim() || row.id;
  const filename = safeGuestInvoicePdfFilename(ref);
  return { buffer, filename };
}
