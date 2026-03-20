import {
  InvoiceStatus,
  PlanCode,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import {
  addMonths,
  createInvoiceReference,
  dueInDays,
} from "../utils/billing.js";

type CreateBusinessInput = {
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
};

type StartSubscriptionInput = {
  businessId: string;
  planCode: PlanCode;
};

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function listPlans() {
  return prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { monthlyPrice: "asc" },
  });
}

export async function createBusiness(input: CreateBusinessInput) {
  const slug = normalizeSlug(input.slug || input.name);

  return prisma.business.create({
    data: {
      name: input.name.trim(),
      slug,
      ownerName: input.ownerName.trim(),
      ownerEmail: input.ownerEmail.trim().toLowerCase(),
    },
  });
}

export async function getBusinessSubscription(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          plan: true,
          invoices: {
            orderBy: { createdAt: "desc" },
            take: 6,
          },
        },
      },
    },
  });

  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

  return {
    business,
    currentSubscription: business.subscriptions[0] ?? null,
  };
}

export async function startSubscription(input: StartSubscriptionInput) {
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
  });

  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

  const plan = await prisma.plan.findUnique({
    where: { code: input.planCode },
  });

  if (!plan || !plan.isActive) {
    throw new HttpError(404, "Plan not found.");
  }

  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      businessId: input.businessId,
      status: {
        in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (activeSubscription) {
    throw new HttpError(
      409,
      "Business already has an active subscription. Update or cancel it first.",
    );
  }

  const currentPeriodStart = new Date();
  const currentPeriodEnd = addMonths(currentPeriodStart, 1);

  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.create({
      data: {
        businessId: input.businessId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startDate: currentPeriodStart,
        currentPeriodStart,
        currentPeriodEnd,
      },
      include: {
        plan: true,
      },
    });

    const invoice = await tx.subscriptionInvoice.create({
      data: {
        businessId: input.businessId,
        subscriptionId: subscription.id,
        planId: plan.id,
        amount: plan.monthlyPrice,
        currency: plan.currency,
        status: InvoiceStatus.PENDING,
        billingPeriodStart: currentPeriodStart,
        billingPeriodEnd: currentPeriodEnd,
        dueDate: dueInDays(currentPeriodStart, 7),
        externalReference: createInvoiceReference(),
      },
    });

    return {
      subscription,
      invoice,
    };
  });
}

export async function renewSubscription(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      plan: true,
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!subscription) {
    throw new HttpError(404, "Subscription not found.");
  }

  if (
    subscription.status !== SubscriptionStatus.ACTIVE &&
    subscription.status !== SubscriptionStatus.PAST_DUE
  ) {
    throw new HttpError(400, "Only active or past-due subscriptions can renew.");
  }

  const latestInvoice = subscription.invoices[0];
  if (latestInvoice && latestInvoice.status !== InvoiceStatus.PAID) {
    throw new HttpError(400, "Latest invoice must be paid before renewal.");
  }

  const nextStart = subscription.currentPeriodEnd;
  const nextEnd = addMonths(nextStart, 1);

  return prisma.$transaction(async (tx) => {
    const updatedSubscription = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: nextStart,
        currentPeriodEnd: nextEnd,
      },
      include: {
        plan: true,
      },
    });

    const invoice = await tx.subscriptionInvoice.create({
      data: {
        businessId: subscription.businessId,
        subscriptionId: subscription.id,
        planId: subscription.planId,
        amount: subscription.plan.monthlyPrice,
        currency: subscription.plan.currency,
        status: InvoiceStatus.PENDING,
        billingPeriodStart: nextStart,
        billingPeriodEnd: nextEnd,
        dueDate: dueInDays(nextStart, 7),
        externalReference: createInvoiceReference(),
      },
    });

    return {
      subscription: updatedSubscription,
      invoice,
    };
  });
}

export async function payInvoice(invoiceId: string) {
  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) {
    throw new HttpError(404, "Invoice not found.");
  }

  if (invoice.status === InvoiceStatus.PAID) {
    throw new HttpError(400, "Invoice is already paid.");
  }

  return prisma.subscriptionInvoice.update({
    where: { id: invoiceId },
    data: {
      status: InvoiceStatus.PAID,
      paidAt: new Date(),
    },
  });
}

export function formatMoney(value: Prisma.Decimal) {
  return Number(value).toFixed(2);
}
