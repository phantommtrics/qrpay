import { Resend } from "resend";
import {
  StaffCreationNotificationStatus,
  StaffCreationNotificationType,
  UserRole,
} from "@prisma/client";

import { env } from "../config/env.js";
import { easypayEmailLogoHtml } from "../lib/easypay-logo.js";
import { guestQuotationUrl } from "../lib/public-guest-urls.js";
import { prisma } from "../lib/prisma.js";
import { buildSalesQuotationPdfBuffer, loadSalesQuotationForPdf } from "./sales-document-pdf.service.js";

const PLATFORM_NAME = "EasyPay";

function firstName(fullName: string) {
  const t = fullName.trim();
  if (!t) return "there";
  return t.split(/\s+/)[0] ?? t;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isValidBusinessEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function queueSalesQuotationSentEmail(quotationId: string): void {
  void dispatchSalesQuotationSentEmail(quotationId).catch((err) => {
    console.error("[sales-quotation-email]", quotationId, err);
  });
}

async function dispatchSalesQuotationSentEmail(quotationId: string): Promise<void> {
  const row = await prisma.salesQuotation.findUnique({
    where: { id: quotationId },
    include: { business: true, contact: true },
  });
  if (!row?.guestToken) {
    return;
  }
  const recipientEmail = row.contact.email?.trim();
  if (!recipientEmail) {
    return;
  }

  const businessEmail = row.business.ownerEmail.trim();
  const portalUrl = guestQuotationUrl(row.guestToken);
  const pdfRow = await loadSalesQuotationForPdf(row.businessId, row.id);
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await buildSalesQuotationPdfBuffer(pdfRow);
  } catch (e) {
    console.error("[sales-quotation-email] pdf build failed", quotationId, e);
    pdfBuffer = Buffer.alloc(0);
  }
  const pdfFilename = `quotation-${row.publicCode.replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`;

  const subject = `${row.business.name} — Quotation ${row.publicCode}`;
  const htmlBody = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:560px;">
    ${easypayEmailLogoHtml()}
    <div style="border-bottom:2px solid #0d9488;padding-bottom:16px;margin-bottom:20px;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#0f172a;">${escapeHtml(row.business.name)}</p>
      ${
        isValidBusinessEmail(businessEmail)
          ? `<p style="margin:6px 0 0;font-size:14px;color:#475569;"><a href="mailto:${escapeHtml(businessEmail)}" style="color:#0d9488;text-decoration:none;">${escapeHtml(businessEmail)}</a></p>`
          : ""
      }
    </div>
    <p style="margin:0 0 16px;">Dear ${escapeHtml(firstName(row.contact.name))},</p>
    <p style="margin:0 0 16px;">Please find your quotation attached as a PDF. You can review it online and respond here:</p>
    <p style="margin:0 0 20px;">
      <a href="${portalUrl}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">View quotation</a>
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#334155;">
      From this page you can <strong>accept</strong> the quote (we will prepare your invoice) or <strong>decline</strong> if it does not suit you.
      If you have questions, reply to this email — the business has been copied so we can all stay aligned.
    </p>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">Sent via ${PLATFORM_NAME}.</p>
  </div>`;

  const textBody = [
    `${row.business.name}`,
    isValidBusinessEmail(businessEmail) ? `Business email: ${businessEmail}` : "",
    "",
    `Dear ${firstName(row.contact.name)},`,
    "",
    `Your quotation ${row.publicCode} is attached. View and respond online: ${portalUrl}`,
    "",
    `— ${PLATFORM_NAME}`,
  ]
    .filter(Boolean)
    .join("\n");

  const log = await prisma.staffCreationNotificationLog.create({
    data: {
      businessId: row.businessId,
      userId: null,
      recipientName: row.contact.name,
      recipientEmail,
      staffRole: UserRole.MERCHANT,
      notificationType: StaffCreationNotificationType.SALES_QUOTATION_SENT,
      deliveryStatus: StaffCreationNotificationStatus.PENDING,
      provider: "resend",
      subject,
      htmlBody,
      textBody,
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
      subject,
      html: htmlBody,
      text: textBody,
      attachments:
        pdfBuffer.length > 0
          ? [{ filename: pdfFilename, content: pdfBuffer, contentType: "application/pdf" }]
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
