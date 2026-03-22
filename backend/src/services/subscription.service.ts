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
  industry?: string;
  ownerName: string;
  ownerEmail: string;
};

type StartSubscriptionInput = {
  businessId: string;
  planCode: PlanCode;
};

export const SUBSCRIPTION_TRIAL_DAYS = 7;

type SubscriptionWithPlanAndInvoices = Prisma.SubscriptionGetPayload<{
  include: {
    plan: true;
    invoices: {
      orderBy: {
        createdAt: "desc";
      };
      take: 6;
    };
  };
}>;

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
      industry: input.industry?.trim() || null,
      ownerName: input.ownerName.trim(),
      ownerEmail: input.ownerEmail.trim().toLowerCase(),
    },
  });
}

async function expireTrialIfNeeded(subscription: SubscriptionWithPlanAndInvoices) {
  const latestInvoice = subscription.invoices[0];

  if (
    subscription.status !== SubscriptionStatus.TRIALING ||
    !latestInvoice ||
    latestInvoice.status === InvoiceStatus.PAID ||
    latestInvoice.dueDate.getTime() >= Date.now()
  ) {
    return subscription;
  }

  return prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: SubscriptionStatus.EXPIRED,
      endedAt: latestInvoice.dueDate,
      currentPeriodEnd: latestInvoice.dueDate,
    },
    include: {
      plan: true,
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 6,
      },
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

  const currentSubscription = business.subscriptions[0]
    ? await expireTrialIfNeeded(business.subscriptions[0])
    : null;

  return {
    business,
    currentSubscription,
  };
}

export async function createSubscriptionForBusinessTx(
  tx: Prisma.TransactionClient,
  input: StartSubscriptionInput,
) {
  const business = await tx.business.findUnique({
    where: { id: input.businessId },
  });

  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

  const plan = await tx.plan.findUnique({
    where: { code: input.planCode },
  });

  if (!plan || !plan.isActive) {
    throw new HttpError(404, "Plan not found.");
  }

  const activeSubscription = await tx.subscription.findFirst({
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
  const trialEndsAt = dueInDays(currentPeriodStart, SUBSCRIPTION_TRIAL_DAYS);
  const billingPeriodEnd = addMonths(currentPeriodStart, 1);

  const subscription = await tx.subscription.create({
    data: {
      businessId: input.businessId,
      planId: plan.id,
      status: SubscriptionStatus.TRIALING,
      startDate: currentPeriodStart,
      currentPeriodStart,
      currentPeriodEnd: trialEndsAt,
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
      billingPeriodEnd,
      dueDate: trialEndsAt,
      externalReference: createInvoiceReference(),
    },
  });

  return {
    subscription,
    invoice,
  };
}

export async function startSubscription(input: StartSubscriptionInput) {
  return prisma.$transaction((tx) => createSubscriptionForBusinessTx(tx, input));
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
    include: {
      subscription: true,
    },
  });

  if (!invoice) {
    throw new HttpError(404, "Invoice not found.");
  }

  if (invoice.status === InvoiceStatus.PAID) {
    throw new HttpError(400, "Invoice is already paid.");
  }

  return prisma.$transaction(async (tx) => {
    const paidInvoice = await tx.subscriptionInvoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
      },
    });

    if (
      invoice.subscription.status === SubscriptionStatus.TRIALING ||
      invoice.subscription.status === SubscriptionStatus.EXPIRED ||
      invoice.subscription.status === SubscriptionStatus.PAST_DUE
    ) {
      await tx.subscription.update({
        where: { id: invoice.subscriptionId },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: paidInvoice.billingPeriodStart,
          currentPeriodEnd: paidInvoice.billingPeriodEnd,
          endedAt: null,
        },
      });
    }

    return paidInvoice;
  });
}

export function formatMoney(value: Prisma.Decimal) {
  return Number(value).toFixed(2);
}
