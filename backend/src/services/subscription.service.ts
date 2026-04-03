import {
  BillingInterval,
  InvoiceStatus,
  PlanCode,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import {
  addMonths,
  addYears,
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
  billingInterval?: BillingInterval;
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

function assertPriceField(
  label: string,
  value: number | undefined,
): asserts value is number {
  if (value === undefined) {
    return;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new HttpError(400, `${label} must be a positive number.`);
  }
  if (value > 99_999_999.99) {
    throw new HttpError(400, `${label} is too large.`);
  }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export async function updatePlanPricing(
  planCode: PlanCode,
  input: { monthlyPrice?: number; yearlyPrice?: number },
) {
  if (input.monthlyPrice === undefined && input.yearlyPrice === undefined) {
    throw new HttpError(400, "Provide at least one of monthlyPrice or yearlyPrice.");
  }

  assertPriceField("Monthly price", input.monthlyPrice);
  assertPriceField("Yearly price", input.yearlyPrice);

  const data: Prisma.PlanUpdateInput = {};
  if (input.monthlyPrice !== undefined) {
    data.monthlyPrice = new Prisma.Decimal(roundMoney(input.monthlyPrice).toFixed(2));
  }
  if (input.yearlyPrice !== undefined) {
    data.yearlyPrice = new Prisma.Decimal(roundMoney(input.yearlyPrice).toFixed(2));
  }

  return prisma.plan.update({
    where: { code: planCode },
    data,
  });
}

function planAmountForInterval(
  plan: { monthlyPrice: Prisma.Decimal; yearlyPrice: Prisma.Decimal },
  interval: BillingInterval,
) {
  return interval === BillingInterval.YEARLY ? plan.yearlyPrice : plan.monthlyPrice;
}

function billingPeriodEndFromStart(start: Date, interval: BillingInterval) {
  return interval === BillingInterval.YEARLY ? addYears(start, 1) : addMonths(start, 1);
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

  const billingInterval = input.billingInterval ?? BillingInterval.MONTHLY;

  const blockingSubscription = await tx.subscription.findFirst({
    where: {
      businessId: input.businessId,
      status: {
        in: [
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.TRIALING,
          SubscriptionStatus.PAST_DUE,
        ],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (blockingSubscription) {
    throw new HttpError(
      409,
      "Business already has an active or past-due subscription. Pay open invoices or cancel before starting a new one.",
    );
  }

  const currentPeriodStart = new Date();
  const trialEndsAt = dueInDays(currentPeriodStart, SUBSCRIPTION_TRIAL_DAYS);
  const billingPeriodEnd = billingPeriodEndFromStart(currentPeriodStart, billingInterval);
  const invoiceAmount = planAmountForInterval(plan, billingInterval);

  const subscription = await tx.subscription.create({
    data: {
      businessId: input.businessId,
      planId: plan.id,
      billingInterval,
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
      amount: invoiceAmount,
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

export async function changeSubscriptionPlan(input: {
  businessId: string;
  planCode: PlanCode;
  billingInterval?: BillingInterval;
}) {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.findFirst({
      where: {
        businessId: input.businessId,
        status: {
          in: [
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PAST_DUE,
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        plan: true,
        invoices: {
          where: { status: InvoiceStatus.PENDING },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!sub) {
      throw new HttpError(404, "No subscription to change.");
    }

    const newPlan = await tx.plan.findUnique({
      where: { code: input.planCode },
    });
    if (!newPlan || !newPlan.isActive) {
      throw new HttpError(404, "Plan not found.");
    }

    const samePlan = sub.planId === newPlan.id;
    const intervalRequested =
      input.billingInterval !== undefined &&
      input.billingInterval !== sub.billingInterval;

    if (samePlan && !intervalRequested) {
      throw new HttpError(400, "Already on this plan and billing cycle.");
    }

    if (intervalRequested && sub.status !== SubscriptionStatus.TRIALING) {
      throw new HttpError(
        400,
        "Billing interval can only be changed while the subscription is in trial.",
      );
    }

    const nextBillingInterval =
      sub.status === SubscriptionStatus.TRIALING && input.billingInterval !== undefined
        ? input.billingInterval
        : (sub.billingInterval ?? BillingInterval.MONTHLY);

    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        planId: newPlan.id,
        ...(sub.status === SubscriptionStatus.TRIALING && input.billingInterval !== undefined
          ? { billingInterval: input.billingInterval }
          : {}),
      },
    });

    const refreshed = await tx.subscription.findUniqueOrThrow({
      where: { id: sub.id },
    });
    const effectiveInterval =
      refreshed.billingInterval ?? BillingInterval.MONTHLY;
    const amount = planAmountForInterval(newPlan, effectiveInterval);

    const pendingInvoice = sub.invoices[0];
    if (pendingInvoice) {
      const invData: Prisma.SubscriptionInvoiceUpdateInput = {
        planId: newPlan.id,
        amount,
        currency: newPlan.currency,
      };
      if (sub.status === SubscriptionStatus.TRIALING && intervalRequested) {
        invData.billingPeriodEnd = billingPeriodEndFromStart(
          pendingInvoice.billingPeriodStart,
          input.billingInterval!,
        );
      }
      await tx.subscriptionInvoice.update({
        where: { id: pendingInvoice.id },
        data: invData,
      });
    }

    return tx.subscription.findUniqueOrThrow({
      where: { id: sub.id },
      include: {
        plan: true,
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 6,
        },
      },
    });
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
  const interval = subscription.billingInterval ?? BillingInterval.MONTHLY;
  const nextEnd = billingPeriodEndFromStart(nextStart, interval);
  const renewalAmount = planAmountForInterval(subscription.plan, interval);

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
        amount: renewalAmount,
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
