import {
  BillingInterval,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { SUBSCRIPTION_RENEWAL_REMINDER_DAYS } from "./subscription-renewal-invoice.service.js";
import { queueSubscriptionEndingReminderEmail } from "./subscription-ending-reminder-email.service.js";

const MS_PER_DAY = 86_400_000;

type SubscriptionReminderRow = Prisma.SubscriptionGetPayload<{
  include: { plan: true; business: { select: { platformBillingWaived: true } } };
}>;

function isContractLike(sub: SubscriptionReminderRow): boolean {
  return Boolean(sub.contractPerpetual) || sub.billingInterval === BillingInterval.CONTRACT_INFINITE;
}

function inEndingReminderWindow(periodEnd: Date, now: Date): boolean {
  const windowStart = periodEnd.getTime() - SUBSCRIPTION_RENEWAL_REMINDER_DAYS * MS_PER_DAY;
  return now.getTime() >= windowStart && now.getTime() < periodEnd.getTime();
}

function shouldSendEndingReminder(sub: SubscriptionReminderRow, now: Date): boolean {
  if (isContractLike(sub) || sub.business.platformBillingWaived) {
    return false;
  }

  const periodEnd = sub.currentPeriodEnd;
  if (!periodEnd) {
    return false;
  }

  if (
    sub.status !== SubscriptionStatus.TRIALING &&
    sub.status !== SubscriptionStatus.ACTIVE &&
    sub.status !== SubscriptionStatus.PAST_DUE
  ) {
    return false;
  }

  if (!inEndingReminderWindow(periodEnd, now)) {
    return false;
  }

  if (sub.periodEndReminderSentFor?.getTime() === periodEnd.getTime()) {
    return false;
  }

  return true;
}

/**
 * Sends one owner email per billing period when the subscription end date is within
 * {@link SUBSCRIPTION_RENEWAL_REMINDER_DAYS} (7 days).
 */
export async function ensureSubscriptionEndingReminderForSubscription(
  subscription: SubscriptionReminderRow,
): Promise<boolean> {
  const now = new Date();
  const periodEnd = subscription.currentPeriodEnd;
  if (!shouldSendEndingReminder(subscription, now) || !periodEnd) {
    return false;
  }

  const claimed = await prisma.subscription.updateMany({
    where: {
      id: subscription.id,
      currentPeriodEnd: periodEnd,
      OR: [{ periodEndReminderSentFor: null }, { NOT: { periodEndReminderSentFor: periodEnd } }],
    },
    data: {
      periodEndReminderSentFor: periodEnd,
    },
  });

  if (claimed.count === 0) {
    return false;
  }

  queueSubscriptionEndingReminderEmail(subscription.id);
  return true;
}
