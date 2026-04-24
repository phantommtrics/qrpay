import { Resend } from "resend";
import {
  ManualRefundReviewStatus,
  StaffCreationNotificationStatus,
  StaffCreationNotificationType,
  UserRole,
} from "@prisma/client";

import { env } from "../config/env.js";
import { easypayEmailLogoHtml } from "../lib/easypay-logo.js";
import { prisma } from "../lib/prisma.js";
import { generateSubscriptionInvoicePdf } from "./subscription-invoice-pdf.service.js";

const PLATFORM_NAME = "DPay";

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

function fmtLongDate(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type InvoiceRow = NonNullable<Awaited<ReturnType<typeof loadInvoiceWithRelations>>>;

async function loadInvoiceWithRelations(invoiceId: string) {
  return prisma.subscriptionInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      business: true,
      plan: true,
      subscription: true,
    },
  });
}

async function resolveRecipient(row: InvoiceRow) {
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
    return null;
  }
  return { recipientEmail, recipientName, userId };
}

async function sendWithPdf(params: {
  notificationType: StaffCreationNotificationType;
  subject: string;
  htmlBody: string;
  textBody: string;
  businessId: string;
  userId: string | null;
  recipientEmail: string;
  recipientName: string;
  pdfRow: InvoiceRow;
  invoiceRef: string;
}): Promise<void> {
  const row = params.pdfRow;

  const log = await prisma.staffCreationNotificationLog.create({
    data: {
      businessId: params.businessId,
      userId: params.userId,
      recipientName: params.recipientName,
      recipientEmail: params.recipientEmail,
      staffRole: UserRole.MERCHANT,
      notificationType: params.notificationType,
      deliveryStatus: StaffCreationNotificationStatus.PENDING,
      provider: "resend",
      subject: params.subject,
      htmlBody: params.htmlBody,
      textBody: params.textBody,
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
    const filename = safePdfFilename(params.invoiceRef);

    const result = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: params.recipientEmail,
      subject: params.subject,
      html: params.htmlBody,
      text: params.textBody,
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

export function queueSubscriptionInvoiceRefundReviewEmail(invoiceId: string): void {
  void dispatchRefundReviewEmail(invoiceId).catch((err) => {
    console.error("[subscription-refund-review-email]", invoiceId, err);
  });
}

export function queueSubscriptionInvoiceRefundApprovedEmail(invoiceId: string): void {
  void dispatchRefundApprovedEmail(invoiceId).catch((err) => {
    console.error("[subscription-refund-approved-email]", invoiceId, err);
  });
}

async function dispatchRefundReviewEmail(invoiceId: string): Promise<void> {
  const row = await loadInvoiceWithRelations(invoiceId);
  if (!row || row.manualRefundReviewStatus !== ManualRefundReviewStatus.PENDING_REVIEW) {
    return;
  }
  const rec = await resolveRecipient(row);
  if (!rec) {
    return;
  }

  const invoiceRef = row.externalReference?.trim() || row.id;
  const ownerFirst = firstName(rec.recipientName);
  const amountLabel = moneyLabel(row.amount, row.currency);

  const subject = `${PLATFORM_NAME} — refund review in progress (${invoiceRef})`;
  const htmlBody = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:560px;">
    ${easypayEmailLogoHtml()}
    <p>Dear ${ownerFirst},</p>
    <p>
      Thank you for your patience. We are reviewing a refund request relating to your subscription
      invoice for <strong>${row.business.name}</strong>. This message confirms that your case has been
      logged and is being assessed by our billing team.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;">
      <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Plan</td><td style="padding:6px 0;"><strong>${row.plan.name}</strong></td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Invoice reference</td><td style="padding:6px 0;font-family:monospace;">${invoiceRef}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Invoice amount</td><td style="padding:6px 0;"><strong>${amountLabel}</strong></td></tr>
    </table>
    <p>
      A PDF copy of the invoice is attached for your records.
    </p>
    <p>
      We aim to respond with a decision within a few business days. If we require any further
      information, we will contact you using this email address.
    </p>
    <p style="color:#64748b;font-size:13px;">
      This email is for information only. No funds have been transferred yet; any approved refund
      will be processed separately according to our procedures.
    </p>
    <p>Kind regards,<br/>The ${PLATFORM_NAME} billing team</p>
  </div>
  `;

  const textBody = [
    `Dear ${ownerFirst},`,
    "",
    `We are reviewing a refund request relating to your subscription invoice for ${row.business.name}.`,
    "",
    `Plan: ${row.plan.name}`,
    `Invoice reference: ${invoiceRef}`,
    `Invoice amount: ${amountLabel}`,
    "",
    "A PDF copy of the invoice is attached.",
    "",
    "We aim to respond with a decision within a few business days.",
    "",
    "No funds have been transferred by this message.",
    "",
    "Kind regards,",
    `${PLATFORM_NAME} billing team`,
  ].join("\n");

  await sendWithPdf({
    notificationType: StaffCreationNotificationType.SUBSCRIPTION_INVOICE_REFUND_REVIEW,
    subject,
    htmlBody,
    textBody,
    businessId: row.businessId,
    userId: rec.userId,
    recipientEmail: rec.recipientEmail,
    recipientName: rec.recipientName,
    pdfRow: row,
    invoiceRef,
  });
}

async function dispatchRefundApprovedEmail(invoiceId: string): Promise<void> {
  const row = await loadInvoiceWithRelations(invoiceId);
  if (!row || row.manualRefundReviewStatus !== ManualRefundReviewStatus.APPROVED_FOR_REFUND) {
    return;
  }
  if (!row.manualRefundExpectedBy) {
    return;
  }
  const rec = await resolveRecipient(row);
  if (!rec) {
    return;
  }

  const invoiceRef = row.externalReference?.trim() || row.id;
  const ownerFirst = firstName(rec.recipientName);
  const invTotalLabel = moneyLabel(row.amount, row.currency);
  const partial = row.manualRefundApprovedAmount;
  const isPartial = partial != null;
  const approvedLabel = isPartial ? moneyLabel(partial, row.currency) : invTotalLabel;
  const scopeHtml = isPartial
    ? `A <strong>partial refund</strong> of <strong>${approvedLabel}</strong> has been approved (invoice total: ${invTotalLabel}).`
    : `A <strong>full refund</strong> of <strong>${approvedLabel}</strong> (the invoice total) has been approved.`;
  const scopeText = isPartial
    ? `A partial refund of ${approvedLabel} has been approved (invoice total: ${invTotalLabel}).`
    : `A full refund of ${approvedLabel} has been approved.`;

  const expectedByLabel = fmtLongDate(row.manualRefundExpectedBy);

  const subject = `${PLATFORM_NAME} — refund approved (${invoiceRef})`;
  const htmlBody = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:560px;">
    ${easypayEmailLogoHtml()}
    <p>Dear ${ownerFirst},</p>
    <p>
      Following our review, we are pleased to confirm a refund decision for
      <strong>${row.business.name}</strong>.
    </p>
    <p>${scopeHtml}</p>
    <p>
      We currently expect to complete this refund by <strong>${expectedByLabel}</strong>.
      If there is any delay (for example due to bank processing), we will let you know.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;">
      <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Plan</td><td style="padding:6px 0;"><strong>${row.plan.name}</strong></td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Invoice reference</td><td style="padding:6px 0;font-family:monospace;">${invoiceRef}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Expected refund completion</td><td style="padding:6px 0;"><strong>${expectedByLabel}</strong></td></tr>
    </table>
    <p>
      A PDF copy of the invoice is attached for your records.
    </p>
    <p style="color:#64748b;font-size:13px;">
      Refunds are processed through our finance operations. This message does not itself move funds;
      it documents the approved amount and expected timeline.
    </p>
    <p>
      If you have any questions, please reply to this email or contact your platform administrator.
    </p>
    <p>Kind regards,<br/>The ${PLATFORM_NAME} billing team</p>
  </div>
  `;

  const textBody = [
    `Dear ${ownerFirst},`,
    "",
    `We have approved a refund relating to ${row.business.name}.`,
    "",
    scopeText,
    "",
    `We expect to complete this refund by ${expectedByLabel}.`,
    "",
    `Plan: ${row.plan.name}`,
    `Invoice reference: ${invoiceRef}`,
    "",
    "A PDF copy of the invoice is attached.",
    "",
    "Kind regards,",
    `${PLATFORM_NAME} billing team`,
  ].join("\n");

  await sendWithPdf({
    notificationType: StaffCreationNotificationType.SUBSCRIPTION_INVOICE_REFUND_APPROVED,
    subject,
    htmlBody,
    textBody,
    businessId: row.businessId,
    userId: rec.userId,
    recipientEmail: rec.recipientEmail,
    recipientName: rec.recipientName,
    pdfRow: row,
    invoiceRef,
  });
}
