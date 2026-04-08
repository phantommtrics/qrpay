import { InvoiceStatus } from "@prisma/client";
import type { Request } from "express";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { createSubscriptionInvoiceGuestCheckout } from "./subscription-invoice-checkout.service.js";
import { listOrderCheckoutWallets } from "./order-wallet-checkout.service.js";

export async function getGuestSubscriptionInvoiceByToken(guestToken: string) {
  const t = guestToken?.trim();
  if (!t) {
    throw new HttpError(400, "Invalid link.");
  }
  const inv = await prisma.subscriptionInvoice.findFirst({
    where: { guestToken: t },
    include: {
      business: { select: { id: true, name: true, ownerName: true, ownerEmail: true } },
      plan: { select: { id: true, name: true, code: true } },
    },
  });
  if (!inv) {
    throw new HttpError(404, "Invoice not found.");
  }
  const canPay = inv.status === InvoiceStatus.PENDING;
  return {
    businessName: inv.business.name,
    canPay,
    invoice: {
      id: inv.id,
      amount: Number(inv.amount),
      currency: inv.currency,
      status: inv.status,
      dueDate: inv.dueDate.toISOString(),
      billingPeriodStart: inv.billingPeriodStart.toISOString(),
      billingPeriodEnd: inv.billingPeriodEnd.toISOString(),
      externalReference: inv.externalReference,
      planName: inv.plan.name,
      planCode: inv.plan.code,
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
  return listOrderCheckoutWallets(inv.businessId);
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
