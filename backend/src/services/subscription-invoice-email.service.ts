import { Resend } from "resend";
import {
  StaffCreationNotificationStatus,
  StaffCreationNotificationType,
  UserRole,
} from "@prisma/client";

import { env } from "../config/env.js";
import { easypayEmailLogoHtml } from "../lib/easypay-logo.js";
import { guestSubscriptionInvoiceUrl, spaHashRoute } from "../lib/public-guest-urls.js";
import { prisma } from "../lib/prisma.js";
import { newGuestToken } from "../lib/guest-token.js";
import { isCorporateIndustry } from "../utils/corporate-industry.js";
import { generateSubscriptionInvoicePdf } from "./subscription-invoice-pdf.service.js";

const PLATFORM_NAME = "DPay";

export type SubscriptionInvoiceEmailContent = {
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

export function buildSubscriptionInvoiceEmailContent(input: {
  businessName: string;
  ownerFirstName: string;
  planName: string;
  amountLabel: string;
  dueDateLabel: string;
  invoiceRef: string;
  /** Guest portal: view invoice and pay (Wave/Yonna), like customer sales invoices. */
  payOnlineUrl?: string | null;
}): SubscriptionInvoiceEmailContent {
  const subject = `${PLATFORM_NAME} — subscription invoice ${input.invoiceRef}`;
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
    <p>Dear ${input.ownerFirstName},</p>
    <p>
      A new subscription invoice has been issued for <strong>${input.businessName}</strong>.
      Please review the details below and complete payment by the due date to keep your service active.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;">
      <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Plan</td><td style="padding:6px 0;"><strong>${input.planName}</strong></td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Amount due</td><td style="padding:6px 0;"><strong>${input.amountLabel}</strong></td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Due date</td><td style="padding:6px 0;">${input.dueDateLabel}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Invoice ref.</td><td style="padding:6px 0;font-family:monospace;">${input.invoiceRef}</td></tr>
    </table>
    <p>
      A PDF copy of this invoice is attached for your records.
    </p>
    ${portalBlock}
    <p>
      <a href="${billingUrl()}" style="color:#0d9488;font-weight:600;">Open billing</a>
      to pay online (where your plan supports it) or manage payment methods.
    </p>
    <p style="color:#64748b;font-size:13px;">
      If you have questions about this invoice, reply to this email or contact your platform administrator.
    </p>
    <p>Kind regards,<br/>The ${PLATFORM_NAME} team</p>
  </div>
  `;

  const textBody = [
    `Dear ${input.ownerFirstName},`,
    "",
    `A new subscription invoice has been issued for ${input.businessName}.`,
    "",
    `Plan: ${input.planName}`,
    `Amount due: ${input.amountLabel}`,
    `Due date: ${input.dueDateLabel}`,
    `Invoice reference: ${input.invoiceRef}`,
    "",
    "A PDF copy is attached.",
    "",
    ...(input.payOnlineUrl?.trim()
      ? [`Pay online: ${input.payOnlineUrl.trim()}`, ""]
      : []),
    `Billing: ${billingUrl()}`,
    "",
    `— ${PLATFORM_NAME}`,
  ].join("\n");

  return { subject, htmlBody, textBody };
}

function firstName(fullName: string) {
  const t = fullName.trim();
  if (!t) return "there";
  return t.split(/\s+/)[0] ?? t;
}

function safePdfFilename(ref: string) {
  const cleaned = ref.replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 80);
  return cleaned.length > 0 ? `invoice-${cleaned}.pdf` : "subscription-invoice.pdf";
}

function moneyLabel(amount: { toString(): string }, currency: string) {
  return `${Number(amount.toString()).toFixed(2)} ${currency}`;
}

function fmtDue(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Fire-and-forget: sends subscription invoice email with PDF to the business owner and logs to
 * StaffCreationNotificationLog (same pattern as staff invites / owner signup).
 */
export function queueSubscriptionInvoiceOwnerEmail(invoiceId: string): void {
  void dispatchSubscriptionInvoiceOwnerEmail(invoiceId).catch((err) => {
    console.error("[subscription-invoice-email]", invoiceId, err);
  });
}

async function dispatchSubscriptionInvoiceOwnerEmail(invoiceId: string): Promise<void> {
  const row = await prisma.subscriptionInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      business: true,
      plan: true,
      subscription: true,
    },
  });

  if (!row) {
    return;
  }

  if (
    isCorporateIndustry(row.business.industry) &&
    Number(row.amount) === 0
  ) {
    return;
  }

  let guestToken = row.guestToken?.trim() || null;
  if (!guestToken) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = newGuestToken();
      const clash = await prisma.subscriptionInvoice.findFirst({
        where: { guestToken: candidate },
        select: { id: true },
      });
      if (!clash) {
        guestToken = candidate;
        await prisma.subscriptionInvoice.update({
          where: { id: row.id },
          data: { guestToken: candidate },
        });
        break;
      }
    }
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

  const invoiceRef = row.externalReference?.trim() || row.id;
  const payOnlineUrl = guestToken ? guestSubscriptionInvoiceUrl(guestToken) : null;
  const content = buildSubscriptionInvoiceEmailContent({
    businessName: row.business.name,
    ownerFirstName: firstName(recipientName),
    planName: row.plan.name,
    amountLabel: moneyLabel(row.amount, row.currency),
    dueDateLabel: fmtDue(row.dueDate),
    invoiceRef,
    payOnlineUrl,
  });

  const log = await prisma.staffCreationNotificationLog.create({
    data: {
      businessId: row.businessId,
      userId,
      recipientName,
      recipientEmail,
      staffRole: UserRole.MERCHANT,
      notificationType: StaffCreationNotificationType.SUBSCRIPTION_INVOICE,
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
    const pdfBuffer = await generateSubscriptionInvoicePdf(row);
    const resend = new Resend(env.RESEND_API_KEY);
    const filename = safePdfFilename(invoiceRef);

    const result = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: recipientEmail,
      subject: content.subject,
      html: content.htmlBody,
      text: content.textBody,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
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
