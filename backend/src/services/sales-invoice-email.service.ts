import { Resend } from "resend";
import {
  SalesInvoiceStatus,
  StaffCreationNotificationStatus,
  StaffCreationNotificationType,
  UserRole,
} from "@prisma/client";

import { env } from "../config/env.js";
import { easypayEmailLogoHtml } from "../lib/easypay-logo.js";
import { guestInvoiceUrl } from "../lib/public-guest-urls.js";
import { prisma } from "../lib/prisma.js";
import { buildSalesInvoicePdfBuffer, loadSalesInvoiceForPdfById } from "./sales-document-pdf.service.js";

const PLATFORM_NAME = "DPay";

export type SalesInvoiceEmailContent = {
  subject: string;
  htmlBody: string;
  textBody: string;
};

function firstName(fullName: string) {
  const t = fullName.trim();
  if (!t) return "there";
  return t.split(/\s+/)[0] ?? t;
}

function moneyLabel(amount: { toString(): string }, currency: string) {
  return `${Number(amount.toString()).toFixed(2)} ${currency}`;
}

function invoiceTotal(lines: { quantity: unknown; unitAmount: unknown; taxAmount: unknown }[]): number {
  let s = 0;
  for (const l of lines) {
    const q = Number(l.quantity);
    const u = Number(l.unitAmount);
    const t = Number(l.taxAmount);
    if (Number.isFinite(q) && Number.isFinite(u) && Number.isFinite(t)) {
      s += q * u + t;
    }
  }
  return s;
}

function isValidBusinessEmail(email: string): boolean {
  const t = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export function buildSalesInvoiceApprovedEmailContent(input: {
  businessName: string;
  businessEmail: string | null;
  contactName: string;
  invoiceRef: string;
  amountLabel: string;
  dueDateLabel: string | null;
  issueDateLabel: string;
  /** Guest portal: view invoice and pay with Wave/Yonna. */
  portalUrl?: string | null;
}): SalesInvoiceEmailContent {
  const subject = `${input.businessName} — Invoice ${input.invoiceRef}`;
  const dueBlock =
    input.dueDateLabel !== null
      ? `<tr><td style="padding:8px 16px 8px 0;color:#64748b;font-size:14px;">Due date</td><td style="padding:8px 0;font-size:14px;color:#0f172a;"><strong>${escapeHtml(input.dueDateLabel)}</strong></td></tr>`
      : "";

  const businessEmailRow = input.businessEmail
    ? `<p style="margin:6px 0 0;font-size:14px;color:#475569;"><a href="mailto:${escapeHtml(input.businessEmail)}" style="color:#0d9488;text-decoration:none;">${escapeHtml(input.businessEmail)}</a></p>`
    : "";

  const htmlBody = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:560px;">
    ${easypayEmailLogoHtml()}
    <div style="border-bottom:2px solid #0d9488;padding-bottom:16px;margin-bottom:20px;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#0f172a;">${escapeHtml(input.businessName)}</p>
      ${businessEmailRow}
    </div>

    <p style="margin:0 0 16px;">Dear ${escapeHtml(firstName(input.contactName))},</p>

    <p style="margin:0 0 16px;">
      Thank you for your business. Please find your official invoice below. A PDF copy is attached for your records.
    </p>
    ${
      input.portalUrl
        ? `<p style="margin:0 0 16px;">
      <a href="${escapeHtml(input.portalUrl)}" style="display:inline-block;padding:12px 20px;background:#0d9488;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">View invoice &amp; pay online</a>
    </p>
    <p style="margin:0 0 16px;font-size:13px;color:#64748b;">Or open this link: <a href="${escapeHtml(input.portalUrl)}" style="color:#0d9488;word-break:break-all;">${escapeHtml(input.portalUrl)}</a></p>`
        : ""
    }

    <table cellpadding="0" cellspacing="0" style="margin:16px 0 24px;border-collapse:collapse;width:100%;background:#f8fafc;border-radius:8px;padding:16px 20px;">
      <tr><td style="padding:8px 16px 8px 0;color:#64748b;font-size:14px;">Invoice</td><td style="padding:8px 0;font-size:14px;color:#0f172a;"><strong>${escapeHtml(input.invoiceRef)}</strong></td></tr>
      <tr><td style="padding:8px 16px 8px 0;color:#64748b;font-size:14px;">Issue date</td><td style="padding:8px 0;font-size:14px;color:#0f172a;">${escapeHtml(input.issueDateLabel)}</td></tr>
      ${dueBlock}
      <tr><td style="padding:8px 16px 8px 0;color:#64748b;font-size:14px;">Amount due</td><td style="padding:8px 0;font-size:18px;color:#0f172a;"><strong>${escapeHtml(input.amountLabel)}</strong></td></tr>
    </table>

    <div style="font-size:14px;color:#334155;margin:0 0 20px;">
      <p style="margin:0 0 10px;font-weight:600;color:#0f172a;">Payment &amp; terms</p>
      <p style="margin:0 0 8px;">
        Please arrange payment by the due date shown above. If you have already paid, kindly disregard this notice or
        contact us with your payment reference so we can match it quickly.
      </p>
      <p style="margin:0 0 8px;">
        If anything on this invoice does not match your records, reply to this email and we will be glad to help.
        We aim to resolve questions promptly and keep our relationship straightforward and fair.
      </p>
      <p style="margin:0;">
        We appreciate your trust and look forward to working with you.
      </p>
    </div>

    <p style="margin:24px 0 0;font-size:14px;color:#0f172a;">
      Kind regards,<br/>
      <strong>${escapeHtml(input.businessName)}</strong><br/>
      ${
        input.businessEmail
          ? `<span style="color:#64748b;">${escapeHtml(input.businessEmail)}</span>`
          : ""
      }
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">
      Sent via ${PLATFORM_NAME}. The business has been copied on this message so replies reach both you and them.
    </p>
  </div>
  `;

  const textBody = [
    `${input.businessName}`,
    ...(input.businessEmail ? [`Business email: ${input.businessEmail}`] : []),
    "",
    `Dear ${firstName(input.contactName)},`,
    "",
    "Thank you for your business. Your invoice is attached as a PDF.",
    ...(input.portalUrl ? ["", `View and pay online: ${input.portalUrl}`] : []),
    "",
    `Invoice: ${input.invoiceRef}`,
    `Issue date: ${input.issueDateLabel}`,
    ...(input.dueDateLabel !== null ? [`Due date: ${input.dueDateLabel}`] : []),
    `Amount due: ${input.amountLabel}`,
    "",
    "Payment & terms:",
    "Please arrange payment by the due date. If something does not match your records, reply to this email.",
    "We appreciate your trust.",
    "",
    `Kind regards,`,
    `${input.businessName}`,
    ...(input.businessEmail ? [`${input.businessEmail}`] : []),
    "",
    `— ${PLATFORM_NAME}`,
  ].join("\n");

  return { subject, htmlBody, textBody };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function queueSalesInvoiceApprovedEmail(invoiceId: string): void {
  void dispatchSalesInvoiceApprovedEmail(invoiceId).catch((err) => {
    console.error("[sales-invoice-email]", invoiceId, err);
  });
}

async function dispatchSalesInvoiceApprovedEmail(invoiceId: string): Promise<void> {
  const row = await loadSalesInvoiceForPdfById(invoiceId);

  if (!row || row.status !== SalesInvoiceStatus.APPROVED) {
    return;
  }

  const recipientEmail = row.contact.email?.trim();
  if (!recipientEmail) {
    return;
  }

  const total = invoiceTotal(row.lines);
  const businessEmail = row.business.ownerEmail.trim();
  const dueDateLabel = row.dueDate
    ? row.dueDate.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  const issueDateLabel = row.issueDate.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const portalUrl = row.guestToken ? guestInvoiceUrl(row.guestToken) : null;

  const content = buildSalesInvoiceApprovedEmailContent({
    businessName: row.business.name,
    businessEmail: isValidBusinessEmail(businessEmail) ? businessEmail : null,
    contactName: row.contact.name,
    invoiceRef: row.publicCode,
    amountLabel: moneyLabel({ toString: () => String(total) }, row.currency),
    dueDateLabel,
    issueDateLabel,
    portalUrl,
  });

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await buildSalesInvoicePdfBuffer(row);
  } catch (e) {
    console.error("[sales-invoice-email] pdf build failed", invoiceId, e);
    pdfBuffer = Buffer.alloc(0);
  }

  const pdfFilename = `invoice-${row.publicCode.replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`;

  const log = await prisma.staffCreationNotificationLog.create({
    data: {
      businessId: row.businessId,
      userId: null,
      recipientName: row.contact.name,
      recipientEmail,
      staffRole: UserRole.MERCHANT,
      notificationType: StaffCreationNotificationType.SALES_INVOICE_APPROVED,
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

  const cc =
    isValidBusinessEmail(businessEmail) && businessEmail.toLowerCase() !== recipientEmail.toLowerCase()
      ? businessEmail
      : undefined;

  const replyTo = isValidBusinessEmail(businessEmail) ? businessEmail : undefined;

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: recipientEmail,
      ...(cc ? { cc: [cc] } : {}),
      ...(replyTo ? { replyTo } : {}),
      subject: content.subject,
      html: content.htmlBody,
      text: content.textBody,
      attachments:
        pdfBuffer.length > 0
          ? [
              {
                filename: pdfFilename,
                content: pdfBuffer,
                contentType: "application/pdf",
              },
            ]
          : undefined,
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
