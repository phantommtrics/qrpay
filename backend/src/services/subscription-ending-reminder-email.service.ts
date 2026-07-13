import { Resend } from "resend";
import {
  StaffCreationNotificationStatus,
  StaffCreationNotificationType,
  InvoiceStatus,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";

import { env } from "../config/env.js";
import { easypayEmailLogoHtml } from "../lib/easypay-logo.js";
import { guestSubscriptionInvoiceUrl, spaHashRoute } from "../lib/public-guest-urls.js";
import { prisma } from "../lib/prisma.js";

const PLATFORM_NAME = "DirectPay";

export type SubscriptionEndingReminderEmailContent = {
  subject: string;
  htmlBody: string;
  textBody: string;
};

function billingUrl() {
  return spaHashRoute(env.PLATFORM_URL.replace(/\/$/, ""), "/billing");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstName(fullName: string) {
  const t = fullName.trim();
  if (!t) return "there";
  return t.split(/\s+/)[0] ?? t;
}

function fmtEnd(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function periodLabel(status: SubscriptionStatus) {
  return status === SubscriptionStatus.TRIALING ? "trial" : "subscription";
}

export function buildSubscriptionEndingReminderEmailContent(input: {
  businessName: string;
  ownerFirstName: string;
  planName: string;
  periodEnd: Date;
  daysLeft: number;
  subscriptionStatus: SubscriptionStatus;
  payOnlineUrl?: string | null;
}): SubscriptionEndingReminderEmailContent {
  const period = periodLabel(input.subscriptionStatus);
  const endLabel = fmtEnd(input.periodEnd);
  const subject = `${PLATFORM_NAME} — your ${input.planName} ${period} ends on ${endLabel}`;
  const daysPhrase =
    input.daysLeft <= 1
      ? "tomorrow"
      : input.daysLeft === 7
        ? "in one week"
        : `in ${input.daysLeft} days`;

  const portalBlock =
    input.payOnlineUrl && input.payOnlineUrl.trim()
      ? `<p style="margin:16px 0;">
      <a href="${escapeHtml(input.payOnlineUrl.trim())}" style="display:inline-block;padding:12px 20px;background:#0d9488;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">View invoice &amp; pay online</a>
    </p>
    <p style="margin:0 0 16px;font-size:13px;color:#64748b;">Or open this link: <a href="${escapeHtml(input.payOnlineUrl.trim())}" style="color:#0d9488;word-break:break-all;">${escapeHtml(input.payOnlineUrl.trim())}</a></p>`
      : "";

  const htmlBody = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:560px;">
    ${easypayEmailLogoHtml()}
    <p>Dear ${escapeHtml(input.ownerFirstName)},</p>
    <p>
      This is a reminder that the <strong>${escapeHtml(input.planName)}</strong> ${period} for
      <strong>${escapeHtml(input.businessName)}</strong> ends <strong>${escapeHtml(endLabel)}</strong>
      (${daysPhrase}).
    </p>
    <p>
      To keep your service active, complete payment before the end date. After that, access may be
      restricted until billing is brought up to date.
    </p>
    ${portalBlock}
    <p>
      <a href="${billingUrl()}" style="color:#0d9488;font-weight:600;">Open billing</a>
      to review your plan, pay any open invoice, or manage payment methods.
    </p>
    <p style="color:#64748b;font-size:13px;">
      If you have questions, reply to this email or contact your platform administrator.
    </p>
    <p>Kind regards,<br/>The ${PLATFORM_NAME} team</p>
  </div>
  `;

  const textBody = [
    `Dear ${input.ownerFirstName},`,
    "",
    `Your ${input.planName} ${period} for ${input.businessName} ends on ${endLabel} (${daysPhrase}).`,
    "",
    "To keep your service active, complete payment before the end date.",
    "",
    ...(input.payOnlineUrl?.trim() ? [`Pay online: ${input.payOnlineUrl.trim()}`, ""] : []),
    `Billing: ${billingUrl()}`,
    "",
    `— ${PLATFORM_NAME}`,
  ].join("\n");

  return { subject, htmlBody, textBody };
}

export function queueSubscriptionEndingReminderEmail(subscriptionId: string): void {
  void dispatchSubscriptionEndingReminderEmail(subscriptionId).catch((err) => {
    console.error("[subscription-ending-reminder-email]", subscriptionId, err);
  });
}

async function dispatchSubscriptionEndingReminderEmail(subscriptionId: string): Promise<void> {
  const row = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      plan: true,
      business: true,
      invoices: {
        where: { status: InvoiceStatus.PENDING },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!row?.currentPeriodEnd) {
    return;
  }

  const ownerMembership = await prisma.businessMembership.findFirst({
    where: { businessId: row.businessId, isOwner: true },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  const recipientEmail =
    ownerMembership?.user?.email?.trim() || row.business.ownerEmail.trim();
  const recipientName =
    ownerMembership?.user?.name?.trim() || row.business.ownerName.trim();
  const userId = ownerMembership?.user?.id ?? null;

  if (!recipientEmail) {
    return;
  }

  const pendingInvoice = row.invoices[0];
  const guestToken = pendingInvoice?.guestToken?.trim() || null;
  const payOnlineUrl = guestToken ? guestSubscriptionInvoiceUrl(guestToken) : null;
  const daysLeft = Math.max(
    0,
    Math.ceil((row.currentPeriodEnd.getTime() - Date.now()) / 86_400_000),
  );

  const content = buildSubscriptionEndingReminderEmailContent({
    businessName: row.business.name,
    ownerFirstName: firstName(recipientName),
    planName: row.plan.name,
    periodEnd: row.currentPeriodEnd,
    daysLeft,
    subscriptionStatus: row.status,
    payOnlineUrl,
  });

  const log = await prisma.staffCreationNotificationLog.create({
    data: {
      businessId: row.businessId,
      userId,
      recipientName,
      recipientEmail,
      staffRole: UserRole.MERCHANT,
      notificationType: StaffCreationNotificationType.SUBSCRIPTION_ENDING_REMINDER,
      deliveryStatus: StaffCreationNotificationStatus.PENDING,
      provider: "resend",
      subject: content.subject,
      htmlBody: content.htmlBody,
      textBody: content.textBody,
    },
  });

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    await prisma.staffCreationNotificationLog.update({
      where: { id: log.id },
      data: {
        deliveryStatus: StaffCreationNotificationStatus.FAILED,
        failureReason: "RESEND_API_KEY or RESEND_FROM_EMAIL not configured.",
      },
    });
    return;
  }

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: recipientEmail,
      subject: content.subject,
      html: content.htmlBody,
      text: content.textBody,
    });

    if (result.error) {
      await prisma.staffCreationNotificationLog.update({
        where: { id: log.id },
        data: {
          deliveryStatus: StaffCreationNotificationStatus.FAILED,
          failureReason: result.error.message ?? "Resend error",
        },
      });
      return;
    }

    if (!result.data?.id) {
      await prisma.staffCreationNotificationLog.update({
        where: { id: log.id },
        data: {
          deliveryStatus: StaffCreationNotificationStatus.FAILED,
          failureReason: "Resend did not return an email ID.",
        },
      });
      return;
    }

    await prisma.staffCreationNotificationLog.update({
      where: { id: log.id },
      data: {
        deliveryStatus: StaffCreationNotificationStatus.SENT,
        resendEmailId: result.data.id,
        sentAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.staffCreationNotificationLog.update({
      where: { id: log.id },
      data: {
        deliveryStatus: StaffCreationNotificationStatus.FAILED,
        failureReason: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}
