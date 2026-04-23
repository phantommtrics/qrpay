import {
  BillingInterval,
  InvoiceStatus,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { newGuestToken } from "../lib/guest-token.js";
import { billingPeriodEndFromStart, createInvoiceReference, dueInDays } from "../utils/billing.js";
import { resolveSubscriptionInvoiceAmount } from "./corporate-billing.service.js";
import { queueSubscriptionInvoiceOwnerEmail } from "./subscription-invoice-email.service.js";

/** Match frontend `expiring_soon` (7 days) — invoice + owner email when inside this window. */
export const SUBSCRIPTION_RENEWAL_REMINDER_DAYS = 7;

const MS_PER_DAY = 86_400_000;

function inRenewalOrOverdueWindow(periodEnd: Date, now: Date): boolean {
  const windowStart = periodEnd.getTime() - SUBSCRIPTION_RENEWAL_REMINDER_DAYS * MS_PER_DAY;
  return now.getTime() >= windowStart;
}

function subscriptionHasPendingInvoice(
  invoices: Array<{ status: InvoiceStatus }>,
): boolean {
  return invoices.some((i) => i.status === InvoiceStatus.PENDING);
}

type SubscriptionRenewalRow = Prisma.SubscriptionGetPayload<{
  include: {
    plan: true;
    invoices: { orderBy: { createdAt: "desc" }; take: 12 };
  };
}>;

function isContractLike(sub: SubscriptionRenewalRow): boolean {
  return (
    Boolean(sub.contractPerpetual) || sub.billingInterval === BillingInterval.CONTRACT_INFINITE
  );
}

/**
 * Creates a pending invoice for the next billed period without advancing subscription dates
 * (periods advance when the invoice is paid — see `applySubscriptionActivationAfterInvoicePayment`).
 */
async function createUpcomingPeriodRenewalInvoiceTx(
  tx: Prisma.TransactionClient,
  input: {
    subscriptionId: string;
    businessId: string;
    planId: string;
    billingInterval: BillingInterval;
    periodStart: Date;
  },
): Promise<{ id: string } | null> {
  const plan = await tx.plan.findUnique({ where: { id: input.planId } });
  if (!plan || !plan.isActive) {
    throw new Error("Plan not found for renewal invoice.");
  }
  const interval = input.billingInterval ?? BillingInterval.MONTHLY;
  const billingPeriodEnd = billingPeriodEndFromStart(input.periodStart, interval);
  const { amount, currency } = await resolveSubscriptionInvoiceAmount(
    tx,
    input.businessId,
    plan,
    interval,
  );
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  const now = new Date();
  const dueDate =
    input.periodStart.getTime() > now.getTime() ? input.periodStart : dueInDays(now, 7);

  const invoice = await tx.subscriptionInvoice.create({
    data: {
      businessId: input.businessId,
      subscriptionId: input.subscriptionId,
      planId: input.planId,
      amount,
      currency,
      status: InvoiceStatus.PENDING,
      billingPeriodStart: input.periodStart,
      billingPeriodEnd,
      dueDate,
      externalReference: createInvoiceReference(),
      guestToken: newGuestToken(),
    },
  });
  return { id: invoice.id };
}

/**
 * When trial / paid period / post-expiry needs a payable invoice, create it (once) and email the owner.
 * Idempotent: skips if a pending invoice already exists on the subscription.
 */
export async function ensureSubscriptionRenewalInvoiceForSubscription(
  subscription: SubscriptionRenewalRow,
): Promise<boolean> {
  if (isContractLike(subscription)) {
    return false;
  }

  const now = new Date();
  const invoices = subscription.invoices ?? [];

  if (subscriptionHasPendingInvoice(invoices)) {
    return false;
  }

  const interval = subscription.billingInterval ?? BillingInterval.MONTHLY;

  if (
    subscription.status === SubscriptionStatus.TRIALING &&
    subscription.currentPeriodEnd &&
    inRenewalOrOverdueWindow(subscription.currentPeriodEnd, now)
  ) {
    // First invoice is created at signup; do not duplicate. Owner is emailed on signup.
    return false;
  }

  if (
    (subscription.status === SubscriptionStatus.ACTIVE ||
      subscription.status === SubscriptionStatus.PAST_DUE) &&
    subscription.currentPeriodEnd &&
    inRenewalOrOverdueWindow(subscription.currentPeriodEnd, now)
  ) {
    const periodStart = subscription.currentPeriodEnd;
    const created = await prisma.$transaction(async (tx) => {
      const still = await tx.subscription.findUnique({
        where: { id: subscription.id },
        include: {
          invoices: { where: { status: InvoiceStatus.PENDING }, take: 1 },
        },
      });
      if (!still || still.invoices.length > 0) {
        return null;
      }
      return createUpcomingPeriodRenewalInvoiceTx(tx, {
        subscriptionId: still.id,
        businessId: still.businessId,
        planId: still.planId,
        billingInterval: still.billingInterval ?? BillingInterval.MONTHLY,
        periodStart,
      });
    });
    if (created?.id) {
      queueSubscriptionInvoiceOwnerEmail(created.id);
      return true;
    }
    return false;
  }

  if (
    subscription.status === SubscriptionStatus.EXPIRED ||
    subscription.status === SubscriptionStatus.CANCELLED
  ) {
    const periodStart = subscription.currentPeriodEnd ?? subscription.endedAt ?? now;
    const created = await prisma.$transaction(async (tx) => {
      const still = await tx.subscription.findUnique({
        where: { id: subscription.id },
        include: {
          invoices: { where: { status: InvoiceStatus.PENDING }, take: 1 },
        },
      });
      if (!still || still.invoices.length > 0) {
        return null;
      }
      return createUpcomingPeriodRenewalInvoiceTx(tx, {
        subscriptionId: still.id,
        businessId: still.businessId,
        planId: still.planId,
        billingInterval: still.billingInterval ?? BillingInterval.MONTHLY,
        periodStart,
      });
    });
    if (created?.id) {
      queueSubscriptionInvoiceOwnerEmail(created.id);
      return true;
    }
    return false;
  }

  return false;
}

/** Used by the background sweep: businesses that may need a renewal invoice or trial follow-up. */
export async function listBusinessIdsForSubscriptionRenewalSweep(limit: number): Promise<string[]> {
  const cap = Math.min(Math.max(limit, 1), 500);
  const now = new Date();
  const horizon = new Date(now.getTime() + SUBSCRIPTION_RENEWAL_REMINDER_DAYS * MS_PER_DAY);

  const candidates = await prisma.subscription.findMany({
    where: {
      OR: [
        {
          status: SubscriptionStatus.TRIALING,
          currentPeriodEnd: { lte: horizon },
          AND: [
            { NOT: { contractPerpetual: true } },
            { NOT: { billingInterval: BillingInterval.CONTRACT_INFINITE } },
          ],
        },
        {
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
          currentPeriodEnd: { lte: horizon, not: null },
          AND: [
            { NOT: { contractPerpetual: true } },
            { NOT: { billingInterval: BillingInterval.CONTRACT_INFINITE } },
          ],
        },
        {
          status: { in: [SubscriptionStatus.EXPIRED, SubscriptionStatus.CANCELLED] },
          NOT: {
            invoices: { some: { status: InvoiceStatus.PENDING } },
          },
        },
      ],
    },
    select: { businessId: true },
    take: cap,
    orderBy: { updatedAt: "desc" },
  });

  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of candidates) {
    if (!seen.has(row.businessId)) {
      seen.add(row.businessId);
      out.push(row.businessId);
    }
  }
  return out;
}
