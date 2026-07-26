import {
  BillingInterval,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import {
  SUBSCRIPTION_RENEWAL_EARLY_REMINDER_DAYS,
  SUBSCRIPTION_RENEWAL_REMINDER_DAYS,
} from "./subscription-renewal-invoice.service.js";
import { queueSubscriptionEndingReminderEmail } from "./subscription-ending-reminder-email.service.js";

const MS_PER_DAY = 86_400_000;

type SubscriptionReminderRow = Prisma.SubscriptionGetPayload<{
  include: { plan: true; business: { select: { platformBillingWaived: true } } };
}>;

type ReminderMilestone = "early" | "final";

function isContractLike(sub: SubscriptionReminderRow): boolean {
  return Boolean(sub.contractPerpetual) || sub.billingInterval === BillingInterval.CONTRACT_INFINITE;
}

function inReminderWindow(
  periodEnd: Date,
  now: Date,
  daysBefore: number,
  nextMilestoneDaysBefore: number | null,
): boolean {
  const windowStart = periodEnd.getTime() - daysBefore * MS_PER_DAY;
  const windowEnd =
    nextMilestoneDaysBefore != null
      ? periodEnd.getTime() - nextMilestoneDaysBefore * MS_PER_DAY
      : periodEnd.getTime();
  return now.getTime() >= windowStart && now.getTime() < windowEnd;
}

function reminderAlreadySentForPeriod(
  sub: SubscriptionReminderRow,
  periodEnd: Date,
  milestone: ReminderMilestone,
): boolean {
  const sentFor =
    milestone === "early" ? sub.periodEndEarlyReminderSentFor : sub.periodEndReminderSentFor;
  return sentFor?.getTime() === periodEnd.getTime();
}

function shouldSendMilestoneReminder(
  sub: SubscriptionReminderRow,
  now: Date,
  milestone: ReminderMilestone,
  daysBefore: number,
  nextMilestoneDaysBefore: number | null,
): boolean {
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

  if (!inReminderWindow(periodEnd, now, daysBefore, nextMilestoneDaysBefore)) {
    return false;
  }

  if (reminderAlreadySentForPeriod(sub, periodEnd, milestone)) {
    return false;
  }

  return true;
}

async function claimReminderSend(
  subscriptionId: string,
  periodEnd: Date,
  milestone: ReminderMilestone,
): Promise<boolean> {
  const sentForField =
    milestone === "early" ? "periodEndEarlyReminderSentFor" : "periodEndReminderSentFor";

  const claimed = await prisma.subscription.updateMany({
    where: {
      id: subscriptionId,
      currentPeriodEnd: periodEnd,
      OR: [{ [sentForField]: null }, { NOT: { [sentForField]: periodEnd } }],
    },
    data: {
      [sentForField]: periodEnd,
    },
  });

  return claimed.count > 0;
}

async function trySendMilestoneReminder(
  subscription: SubscriptionReminderRow,
  milestone: ReminderMilestone,
  daysBefore: number,
  nextMilestoneDaysBefore: number | null,
): Promise<boolean> {
  const now = new Date();
  const periodEnd = subscription.currentPeriodEnd;
  if (
    !periodEnd ||
    !shouldSendMilestoneReminder(subscription, now, milestone, daysBefore, nextMilestoneDaysBefore)
  ) {
    return false;
  }

  const claimed = await claimReminderSend(subscription.id, periodEnd, milestone);
  if (!claimed) {
    return false;
  }

  queueSubscriptionEndingReminderEmail(subscription.id, milestone);
  return true;
}

/**
 * Sends at most two owner emails per billing period before expiry:
 * - ~30 days: early reminder (trials only; paid subs get the renewal invoice email instead)
 * - ~7 days: final ending reminder
 * Nothing is sent on or after `currentPeriodEnd`.
 */
export async function ensureSubscriptionEndingReminderForSubscription(
  subscription: SubscriptionReminderRow,
): Promise<boolean> {
  let sent = false;

  if (subscription.status === SubscriptionStatus.TRIALING) {
    sent =
      (await trySendMilestoneReminder(
        subscription,
        "early",
        SUBSCRIPTION_RENEWAL_EARLY_REMINDER_DAYS,
        SUBSCRIPTION_RENEWAL_REMINDER_DAYS,
      )) || sent;
  }

  sent =
    (await trySendMilestoneReminder(
      subscription,
      "final",
      SUBSCRIPTION_RENEWAL_REMINDER_DAYS,
      null,
    )) || sent;

  return sent;
}
