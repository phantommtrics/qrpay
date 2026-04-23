import {
  BillingLedgerDirection,
  BillingLedgerEntryType,
  BillingLedgerStatus,
  BillingInterval,
  InvoiceStatus,
  PlanCode,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { cancelPendingInvoicePaymentLedgers } from "./billing-ledger.service.js";
import {
  postPlatformJournalForPaidSubscriptionInvoice,
  recordSubscriptionCheckoutWalletFeeTx,
} from "./platform-subscription-journal.service.js";
import {
  billingPeriodEndFromStart,
  createInvoiceReference,
  dueInDays,
} from "../utils/billing.js";
import { queueSubscriptionInvoiceOwnerEmail } from "./subscription-invoice-email.service.js";
import {
  ensureSubscriptionRenewalInvoiceForSubscription,
  listBusinessIdsForSubscriptionRenewalSweep,
} from "./subscription-renewal-invoice.service.js";
import { ensureDefaultChartOfAccountsForBusiness } from "./chart-of-accounts.service.js";
import { newGuestToken } from "../lib/guest-token.js";
import { resolveSubscriptionInvoiceAmount } from "./corporate-billing.service.js";
import { isCorporateIndustry } from "../utils/corporate-industry.js";

/**
 * True when the user owns at least one business whose latest subscription is expired or past due.
 * Prevents creating additional organizations until the existing subscription is brought current.
 */
export async function userOwnsBusinessBlockingNewOrganization(userId: string): Promise<boolean> {
  const owned = await prisma.businessMembership.findMany({
    where: { userId, isOwner: true },
    select: { businessId: true },
  });
  const now = new Date();
  for (const { businessId } of owned) {
    const sub = await prisma.subscription.findFirst({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    });
    if (
      sub &&
      (sub.status === SubscriptionStatus.EXPIRED || sub.status === SubscriptionStatus.PAST_DUE)
    ) {
      return true;
    }
    const overduePending = await prisma.subscriptionInvoice.findFirst({
      where: {
        businessId,
        status: InvoiceStatus.PENDING,
        dueDate: { lt: now },
      },
    });
    if (overduePending) {
      return true;
    }
  }
  return false;
}

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
    where: { isActive: true, code: { not: PlanCode.CORPORATE } },
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


export async function createBusiness(input: CreateBusinessInput) {
  const slug = normalizeSlug(input.slug || input.name);

  const business = await prisma.business.create({
    data: {
      name: input.name.trim(),
      slug,
      industry: input.industry?.trim() || null,
      ownerName: input.ownerName.trim(),
      ownerEmail: input.ownerEmail.trim().toLowerCase(),
    },
  });
  await ensureDefaultChartOfAccountsForBusiness(prisma, business.id);
  return business;
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
      corporateBillingPlan: true,
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

  let currentSubscription = business.subscriptions[0]
    ? await expireTrialIfNeeded(business.subscriptions[0])
    : null;

  if (currentSubscription) {
    const issued = await ensureSubscriptionRenewalInvoiceForSubscription(currentSubscription);
    if (issued) {
      const reloaded = await prisma.subscription.findUnique({
        where: { id: currentSubscription.id },
        include: {
          plan: true,
          invoices: {
            orderBy: { createdAt: "desc" },
            take: 6,
          },
        },
      });
      if (reloaded) {
        currentSubscription = reloaded;
      }
    }
  }

  return {
    business,
    currentSubscription,
  };
}

/**
 * Expire trial if needed, then ensure a renewal / reactivation invoice exists when in the reminder window.
 * Used by the background sweep so owners get emailed even if they never open Billing.
 */
export async function runSubscriptionRenewalMaintenanceForBusiness(businessId: string): Promise<void> {
  const sub = await prisma.subscription.findFirst({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    include: {
      plan: true,
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 12,
      },
    },
  });
  if (!sub) {
    return;
  }
  const afterTrial = await expireTrialIfNeeded(sub);
  await ensureSubscriptionRenewalInvoiceForSubscription(afterTrial);
}

export async function runSubscriptionRenewalInvoiceSweepOnce(): Promise<{ scanned: number }> {
  const ids = await listBusinessIdsForSubscriptionRenewalSweep(400);
  for (const id of ids) {
    await runSubscriptionRenewalMaintenanceForBusiness(id);
  }
  return { scanned: ids.length };
}

export async function createSubscriptionForBusinessTx(
  tx: Prisma.TransactionClient,
  input: StartSubscriptionInput,
) {
  const business = await tx.business.findUnique({
    where: { id: input.businessId },
    include: { corporateBillingPlan: true },
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
      OR: [
        {
          status: {
            in: [
              SubscriptionStatus.ACTIVE,
              SubscriptionStatus.TRIALING,
              SubscriptionStatus.PAST_DUE,
            ],
          },
        },
        {
          status: { in: [SubscriptionStatus.EXPIRED, SubscriptionStatus.CANCELLED] },
          invoices: { some: { status: InvoiceStatus.PENDING } },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (blockingSubscription) {
    throw new HttpError(
      409,
      "Business already has a subscription in progress. Pay open invoices or cancel before starting a new one.",
    );
  }

  const currentPeriodStart = new Date();
  const trialEndsAt = dueInDays(currentPeriodStart, SUBSCRIPTION_TRIAL_DAYS);
  const billingPeriodEnd = billingPeriodEndFromStart(currentPeriodStart, billingInterval);
  const { amount: invoiceAmount, currency: invoiceCurrency } = await resolveSubscriptionInvoiceAmount(
    tx,
    business.id,
    plan,
    billingInterval,
  );

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
      currency: invoiceCurrency,
      status: InvoiceStatus.PENDING,
      billingPeriodStart: currentPeriodStart,
      billingPeriodEnd,
      dueDate: trialEndsAt,
      externalReference: createInvoiceReference(),
      guestToken: newGuestToken(),
    },
  });

  return {
    subscription,
    invoice,
  };
}

/**
 * Active BASIC subscription with no invoices and no renewal window — comped “forever” for internal partner businesses
 * (`CONTRACT_INFINITE` + `contractPerpetual`; entitlements follow the BASIC plan row).
 */
export async function createInternalPartnerForeverBasicSubscriptionForBusinessTx(
  tx: Prisma.TransactionClient,
  input: { businessId: string; planCode?: PlanCode },
) {
  const planCode = input.planCode ?? PlanCode.BASIC;
  const plan = await tx.plan.findUnique({
    where: { code: planCode },
  });
  if (!plan || !plan.isActive) {
    throw new HttpError(404, "Plan not found.");
  }

  const blockingSubscription = await tx.subscription.findFirst({
    where: {
      businessId: input.businessId,
      OR: [
        {
          status: {
            in: [
              SubscriptionStatus.ACTIVE,
              SubscriptionStatus.TRIALING,
              SubscriptionStatus.PAST_DUE,
            ],
          },
        },
        {
          status: { in: [SubscriptionStatus.EXPIRED, SubscriptionStatus.CANCELLED] },
          invoices: { some: { status: InvoiceStatus.PENDING } },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (blockingSubscription) {
    throw new HttpError(
      409,
      "Business already has a subscription in progress. Use a fresh business or resolve billing first.",
    );
  }

  const currentPeriodStart = new Date();

  return tx.subscription.create({
    data: {
      businessId: input.businessId,
      planId: plan.id,
      billingInterval: BillingInterval.CONTRACT_INFINITE,
      status: SubscriptionStatus.ACTIVE,
      startDate: currentPeriodStart,
      currentPeriodStart,
      currentPeriodEnd: null,
      contractPerpetual: true,
    },
    include: { plan: true },
  });
}

export async function startSubscription(input: StartSubscriptionInput) {
  const out = await prisma.$transaction((tx) => createSubscriptionForBusinessTx(tx, input));
  queueSubscriptionInvoiceOwnerEmail(out.invoice.id);
  return out;
}

export async function changeSubscriptionPlan(input: {
  businessId: string;
  planCode: PlanCode;
  billingInterval?: BillingInterval;
}) {
  const { subscription, issuedInvoice } = await prisma.$transaction(async (tx) => {
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

    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        planId: newPlan.id,
        ...(input.billingInterval !== undefined
          ? {
              billingInterval: input.billingInterval,
              contractPerpetual: input.billingInterval === BillingInterval.CONTRACT_INFINITE,
            }
          : {}),
      },
    });

    const refreshed = await tx.subscription.findUniqueOrThrow({
      where: { id: sub.id },
    });
    const effectiveInterval = refreshed.billingInterval ?? BillingInterval.MONTHLY;

    const bizRow = await tx.business.findUnique({
      where: { id: refreshed.businessId },
      select: { industry: true, corporateBillingPlanId: true },
    });
    if (
      bizRow &&
      isCorporateIndustry(bizRow.industry) &&
      bizRow.corporateBillingPlanId
    ) {
      await tx.business.update({
        where: { id: refreshed.businessId },
        data: { corporateBillingInterval: effectiveInterval },
      });
    }
    const { amount, currency: invoiceCurrency } = await resolveSubscriptionInvoiceAmount(
      tx,
      refreshed.businessId,
      newPlan,
      effectiveInterval,
    );

    /** Prior period payments are not credited toward the new plan; void pending rows and issue a fresh invoice. */
    const pendingToVoid = await tx.subscriptionInvoice.findMany({
      where: { subscriptionId: sub.id, status: InvoiceStatus.PENDING },
      select: { id: true },
    });
    for (const row of pendingToVoid) {
      await cancelPendingInvoicePaymentLedgers(tx, row.id);
    }
    await tx.subscriptionInvoice.updateMany({
      where: {
        subscriptionId: sub.id,
        status: InvoiceStatus.PENDING,
      },
      data: {
        status: InvoiceStatus.VOID,
        checkoutSessionId: null,
        checkoutProvider: null,
      },
    });

    const periodEndForInvoice =
      refreshed.currentPeriodEnd ??
      billingPeriodEndFromStart(refreshed.currentPeriodStart, effectiveInterval);

    const issuedInvoice = await tx.subscriptionInvoice.create({
      data: {
        businessId: refreshed.businessId,
        subscriptionId: refreshed.id,
        planId: newPlan.id,
        amount,
        currency: invoiceCurrency,
        status: InvoiceStatus.PENDING,
        billingPeriodStart: refreshed.currentPeriodStart,
        billingPeriodEnd: periodEndForInvoice,
        dueDate: dueInDays(new Date(), 7),
        externalReference: createInvoiceReference(),
        guestToken: newGuestToken(),
      },
    });

    const updated = await tx.subscription.findUniqueOrThrow({
      where: { id: sub.id },
      include: {
        plan: true,
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 6,
        },
      },
    });
    return { subscription: updated, issuedInvoice };
  });
  queueSubscriptionInvoiceOwnerEmail(issuedInvoice.id);
  return { subscription, issuedInvoice };
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

  if (subscription.contractPerpetual || subscription.billingInterval === BillingInterval.CONTRACT_INFINITE) {
    throw new HttpError(400, "This subscription is on a signed contract and does not auto-renew.");
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
  if (!nextStart) {
    throw new HttpError(400, "Subscription has no period end to renew from.");
  }
  const interval = subscription.billingInterval ?? BillingInterval.MONTHLY;
  const nextEnd = billingPeriodEndFromStart(nextStart, interval);

  const result = await prisma.$transaction(async (tx) => {
    const { amount: renewalAmount, currency: renewalCurrency } = await resolveSubscriptionInvoiceAmount(
      tx,
      subscription.businessId,
      subscription.plan,
      interval,
    );
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
        currency: renewalCurrency,
        status: InvoiceStatus.PENDING,
        billingPeriodStart: nextStart,
        billingPeriodEnd: nextEnd,
        dueDate: dueInDays(nextStart, 7),
        externalReference: createInvoiceReference(),
        guestToken: newGuestToken(),
      },
    });

    return {
      subscription: updatedSubscription,
      invoice,
    };
  });

  queueSubscriptionInvoiceOwnerEmail(result.invoice.id);
  return result;
}

async function applySubscriptionActivationAfterInvoicePayment(
  tx: Prisma.TransactionClient,
  subscription: {
    id: string;
    status: SubscriptionStatus;
    billingInterval: BillingInterval;
    currentPeriodEnd: Date | null;
  },
  paidInvoice: { billingPeriodStart: Date; billingPeriodEnd: Date },
): Promise<void> {
  if (
    subscription.status === SubscriptionStatus.TRIALING ||
    subscription.status === SubscriptionStatus.EXPIRED ||
    subscription.status === SubscriptionStatus.PAST_DUE
  ) {
    const perpetual = subscription.billingInterval === BillingInterval.CONTRACT_INFINITE;
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: paidInvoice.billingPeriodStart,
        currentPeriodEnd: perpetual ? null : paidInvoice.billingPeriodEnd,
        contractPerpetual: perpetual,
        endedAt: null,
      },
    });
    return;
  }

  if (
    subscription.status === SubscriptionStatus.ACTIVE &&
    subscription.billingInterval !== BillingInterval.CONTRACT_INFINITE &&
    subscription.currentPeriodEnd
  ) {
    const cep = subscription.currentPeriodEnd.getTime();
    const bps = paidInvoice.billingPeriodStart.getTime();
    /** Next-period renewal invoices start at the current period end; plan-change invoices start at period start. */
    if (Math.abs(cep - bps) <= 3_600_000) {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: paidInvoice.billingPeriodStart,
          currentPeriodEnd: paidInvoice.billingPeriodEnd,
          endedAt: null,
        },
      });
    }
  }
}

export type CompleteSubscriptionInvoicePaymentInput = {
  invoiceId: string;
  provider: string;
  providerCheckoutSessionId?: string | null;
  providerPaymentRef?: string | null;
  idempotencyKey?: string | null;
  metadata?: Prisma.InputJsonValue;
};

async function postPaidSubscriptionInvoicePlatformAccounting(
  tx: Omit<
    Prisma.TransactionClient,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
  >,
  invoice: {
    id: string;
    businessId: string;
    subscriptionId: string | null;
    amount: Prisma.Decimal;
    currency: string;
  },
  provider: string,
): Promise<void> {
  await postPlatformJournalForPaidSubscriptionInvoice(tx, {
    id: invoice.id,
    businessId: invoice.businessId,
    amount: invoice.amount,
    currency: invoice.currency,
  });
  await recordSubscriptionCheckoutWalletFeeTx(tx, {
    provider,
    invoiceId: invoice.id,
    businessId: invoice.businessId,
    subscriptionId: invoice.subscriptionId,
    grossAmount: invoice.amount,
    currency: invoice.currency,
  });
}

type SubscriptionTx = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** Marks pending WALLET_FEE row(s) for this checkout succeeded alongside the invoice payment. */
async function settlePendingSubscriptionWalletFeeLedger(
  tx: SubscriptionTx,
  invoiceId: string,
  providerCheckoutSessionId: string | null | undefined,
  now: Date,
  metaPatch: { metadata?: object },
): Promise<void> {
  const sessionId = providerCheckoutSessionId?.trim() || undefined;
  const baseWhere = {
    subscriptionInvoiceId: invoiceId,
    type: BillingLedgerEntryType.WALLET_FEE,
    status: BillingLedgerStatus.PENDING,
  } as const;

  let wf = sessionId
    ? await tx.billingLedgerEntry.findFirst({
        where: { ...baseWhere, providerCheckoutSessionId: sessionId },
      })
    : null;
  if (!wf) {
    wf = await tx.billingLedgerEntry.findFirst({ where: { ...baseWhere } });
  }
  if (!wf) {
    return;
  }

  const canonicalIdem = `subscription-wallet-fee:${invoiceId}`;
  await tx.billingLedgerEntry.update({
    where: { id: wf.id },
    data: {
      status: BillingLedgerStatus.SUCCEEDED,
      succeededAt: now,
      idempotencyKey: wf.idempotencyKey ?? canonicalIdem,
      ...metaPatch,
    },
  });
}

/**
 * Marks the invoice paid, records a BillingLedgerEntry, and activates the subscription when applicable.
 * Idempotent for duplicate webhooks (same session or idempotency key).
 * Resolves the payment row with `subscriptionInvoiceId` + `INVOICE_PAYMENT` (never WALLET_FEE, which shares `providerCheckoutSessionId`).
 */
export async function completeSubscriptionInvoicePayment(
  input: CompleteSubscriptionInvoicePaymentInput,
) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.subscriptionInvoice.findUnique({
      where: { id: input.invoiceId },
      include: {
        subscription: true,
      },
    });

    if (!invoice) {
      throw new HttpError(404, "Invoice not found.");
    }

    const now = new Date();

    const metaPatch =
      input.metadata !== undefined && input.metadata !== null
        ? { metadata: input.metadata as object }
        : {};

    if (invoice.status === InvoiceStatus.PAID) {
      const dupLedger =
        (input.providerCheckoutSessionId &&
          (await tx.billingLedgerEntry.findFirst({
            where: {
              subscriptionInvoiceId: invoice.id,
              providerCheckoutSessionId: input.providerCheckoutSessionId,
              type: BillingLedgerEntryType.INVOICE_PAYMENT,
              status: BillingLedgerStatus.SUCCEEDED,
            },
          }))) ||
        (input.idempotencyKey &&
          (await tx.billingLedgerEntry.findFirst({
            where: {
              idempotencyKey: input.idempotencyKey,
              type: BillingLedgerEntryType.INVOICE_PAYMENT,
              status: BillingLedgerStatus.SUCCEEDED,
            },
          })));
      if (dupLedger) {
        await postPaidSubscriptionInvoicePlatformAccounting(
          tx,
          {
            id: invoice.id,
            businessId: invoice.businessId,
            subscriptionId: invoice.subscriptionId,
            amount: invoice.amount,
            currency: invoice.currency,
          },
          input.provider,
        );
        return tx.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
      }
      throw new HttpError(400, "Invoice is already paid.");
    }

    if (invoice.status !== InvoiceStatus.PENDING) {
      throw new HttpError(400, "Only pending invoices can be completed.");
    }

    // Always scope by invoice id + entry type so WALLET_FEE rows (same providerCheckoutSessionId) are never selected.
    let paymentLedger =
      (input.providerCheckoutSessionId &&
        (await tx.billingLedgerEntry.findFirst({
          where: {
            subscriptionInvoiceId: invoice.id,
            providerCheckoutSessionId: input.providerCheckoutSessionId,
            type: BillingLedgerEntryType.INVOICE_PAYMENT,
          },
        }))) ||
      (input.idempotencyKey &&
        (await tx.billingLedgerEntry.findFirst({
          where: {
            subscriptionInvoiceId: invoice.id,
            idempotencyKey: input.idempotencyKey,
            type: BillingLedgerEntryType.INVOICE_PAYMENT,
          },
        }))) ||
      null;

    if (paymentLedger?.status === BillingLedgerStatus.SUCCEEDED) {
      await settlePendingSubscriptionWalletFeeLedger(
        tx,
        invoice.id,
        input.providerCheckoutSessionId ?? paymentLedger.providerCheckoutSessionId,
        now,
        metaPatch,
      );
      const paidInvoice = await tx.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.PAID, paidAt: now },
      });
      await applySubscriptionActivationAfterInvoicePayment(
        tx,
        invoice.subscription,
        paidInvoice,
      );
      await postPaidSubscriptionInvoicePlatformAccounting(
        tx,
        {
          id: invoice.id,
          businessId: invoice.businessId,
          subscriptionId: invoice.subscriptionId,
          amount: invoice.amount,
          currency: invoice.currency,
        },
        input.provider,
      );
      return paidInvoice;
    }

    if (paymentLedger) {
      await tx.billingLedgerEntry.update({
        where: { id: paymentLedger.id },
        data: {
          status: BillingLedgerStatus.SUCCEEDED,
          succeededAt: now,
          ...(input.providerPaymentRef ? { providerPaymentRef: input.providerPaymentRef } : {}),
          ...metaPatch,
        },
      });
      await settlePendingSubscriptionWalletFeeLedger(
        tx,
        invoice.id,
        input.providerCheckoutSessionId ?? paymentLedger.providerCheckoutSessionId,
        now,
        metaPatch,
      );
    } else {
      await tx.billingLedgerEntry.create({
        data: {
          businessId: invoice.businessId,
          subscriptionId: invoice.subscriptionId,
          subscriptionInvoiceId: invoice.id,
          type: BillingLedgerEntryType.INVOICE_PAYMENT,
          direction: BillingLedgerDirection.MONEY_IN,
          status: BillingLedgerStatus.SUCCEEDED,
          amount: invoice.amount,
          currency: invoice.currency,
          provider: input.provider,
          providerCheckoutSessionId: input.providerCheckoutSessionId ?? null,
          providerPaymentRef: input.providerPaymentRef ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          succeededAt: now,
          ...metaPatch,
        },
      });
    }

    const paidInvoice = await tx.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: now,
      },
    });

    await applySubscriptionActivationAfterInvoicePayment(
      tx,
      invoice.subscription,
      paidInvoice,
    );

    await postPaidSubscriptionInvoicePlatformAccounting(
      tx,
      {
        id: invoice.id,
        businessId: invoice.businessId,
        subscriptionId: invoice.subscriptionId,
        amount: invoice.amount,
        currency: invoice.currency,
      },
      input.provider,
    );

    return paidInvoice;
  });
}

/** Dev / simulator: marks paid and writes a ledger row (idempotent per invoice). */
export async function payInvoice(invoiceId: string) {
  return completeSubscriptionInvoicePayment({
    invoiceId,
    provider: "internal_dev",
    idempotencyKey: `dev-pay:${invoiceId}`,
  });
}

export async function listBusinessSubscriptionInvoices(
  businessId: string,
  filters: { status?: InvoiceStatus; createdFrom?: Date; createdTo?: Date },
  pagination: { page: number; pageSize: number },
) {
  const where: Prisma.SubscriptionInvoiceWhereInput = { businessId };
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.createdFrom || filters.createdTo) {
    where.createdAt = {};
    if (filters.createdFrom) {
      where.createdAt.gte = filters.createdFrom;
    }
    if (filters.createdTo) {
      where.createdAt.lte = filters.createdTo;
    }
  }

  const skip = (pagination.page - 1) * pagination.pageSize;

  const [total, rows] = await prisma.$transaction([
    prisma.subscriptionInvoice.count({ where }),
    prisma.subscriptionInvoice.findMany({
      where,
      include: { plan: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: pagination.pageSize,
    }),
  ]);

  return { rows, total };
}

export async function getBusinessSubscriptionInvoiceDetail(businessId: string, invoiceId: string) {
  const invoice = await prisma.subscriptionInvoice.findFirst({
    where: { id: invoiceId, businessId },
    include: {
      business: true,
      plan: true,
      subscription: true,
    },
  });
  if (!invoice) {
    throw new HttpError(404, "Invoice not found.");
  }
  return invoice;
}

export function formatMoney(value: Prisma.Decimal) {
  return Number(value).toFixed(2);
}
