import { Resend } from "resend";
import {
  BillStatus,
  StaffCreationNotificationStatus,
  StaffCreationNotificationType,
  UserRole,
} from "@prisma/client";

import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { buildPlatformBillPdfBuffer, loadPlatformBillForPdf } from "./platform-bill-document-pdf.service.js";

const PLATFORM_NAME = "EasyPay";

function firstName(fullName: string) {
  const t = fullName.trim();
  if (!t) return "there";
  return t.split(/\s+/)[0] ?? t;
}

function moneyLabel(amount: { toString(): string }, currency: string) {
  return `${Number(amount.toString()).toFixed(2)} ${currency}`;
}

function billTotal(lines: { quantity: unknown; unitAmount: unknown; taxAmount: unknown }[]): number {
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPlatformBillApprovedEmailContent(input: {
  supplierContactName: string;
  billRef: string;
  amountLabel: string;
  dueDateLabel: string | null;
  issueDateLabel: string;
}): { subject: string; htmlBody: string; textBody: string } {
  const subject = `${PLATFORM_NAME} — Purchase bill ${input.billRef}`;
  const dueBlock =
    input.dueDateLabel !== null
      ? `<tr><td style="padding:8px 16px 8px 0;color:#64748b;font-size:14px;">Due date</td><td style="padding:8px 0;font-size:14px;color:#0f172a;"><strong>${escapeHtml(input.dueDateLabel)}</strong></td></tr>`
      : "";

  const htmlBody = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:560px;">
    <div style="border-bottom:2px solid #0d9488;padding-bottom:16px;margin-bottom:20px;">
      <p style="margin:0;font-size:12px;letter-spacing:0.12em;color:#0d9488;font-weight:700;">${PLATFORM_NAME}</p>
      <p style="margin:8px 0 0;font-size:20px;font-weight:700;color:#0f172a;">Platform purchase bill</p>
    </div>

    <p style="margin:0 0 16px;">Dear ${escapeHtml(firstName(input.supplierContactName))},</p>

    <p style="margin:0 0 16px;">
      Please find attached our purchase bill for your records. This reflects amounts ${PLATFORM_NAME} owes for goods or services supplied.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin:16px 0 24px;border-collapse:collapse;width:100%;background:#f8fafc;border-radius:8px;padding:16px 20px;">
      <tr><td style="padding:8px 16px 8px 0;color:#64748b;font-size:14px;">Bill</td><td style="padding:8px 0;font-size:14px;color:#0f172a;"><strong>${escapeHtml(input.billRef)}</strong></td></tr>
      <tr><td style="padding:8px 16px 8px 0;color:#64748b;font-size:14px;">Issue date</td><td style="padding:8px 0;font-size:14px;color:#0f172a;">${escapeHtml(input.issueDateLabel)}</td></tr>
      ${dueBlock}
      <tr><td style="padding:8px 16px 8px 0;color:#64748b;font-size:14px;">Amount</td><td style="padding:8px 0;font-size:18px;color:#0f172a;"><strong>${escapeHtml(input.amountLabel)}</strong></td></tr>
    </table>

    <div style="font-size:14px;color:#334155;margin:0 0 20px;">
      <p style="margin:0 0 10px;font-weight:600;color:#0f172a;">Payment</p>
      <p style="margin:0 0 8px;">
        We will arrange payment according to the terms shown. If anything on this bill does not match your records, reply to this email.
      </p>
    </div>

    <p style="margin:24px 0 0;font-size:14px;color:#0f172a;">
      Kind regards,<br/>
      <strong>${PLATFORM_NAME}</strong>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">
      Sent via ${PLATFORM_NAME}.
    </p>
  </div>
  `;

  const textBody = [
    PLATFORM_NAME,
    "",
    `Dear ${firstName(input.supplierContactName)},`,
    "",
    "Please find attached our purchase bill for your records.",
    "",
    `Bill: ${input.billRef}`,
    `Issue date: ${input.issueDateLabel}`,
    ...(input.dueDateLabel !== null ? [`Due date: ${input.dueDateLabel}`] : []),
    `Amount: ${input.amountLabel}`,
    "",
    "If something does not match your records, reply to this email.",
    "",
    `Kind regards,`,
    PLATFORM_NAME,
    "",
    `— ${PLATFORM_NAME}`,
  ].join("\n");

  return { subject, htmlBody, textBody };
}

export function queuePlatformBillApprovedEmail(billId: string): void {
  void dispatchPlatformBillApprovedEmail(billId).catch((err) => {
    console.error("[platform-bill-email]", billId, err);
  });
}

async function dispatchPlatformBillApprovedEmail(billId: string): Promise<void> {
  const row = await loadPlatformBillForPdf(billId);

  if (row.status !== BillStatus.APPROVED) {
    return;
  }

  const recipientEmail = row.supplier.email?.trim();
  if (!recipientEmail) {
    return;
  }

  const total = billTotal(row.lines);
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

  const content = buildPlatformBillApprovedEmailContent({
    supplierContactName: row.supplier.name,
    billRef: row.publicCode,
    amountLabel: moneyLabel({ toString: () => String(total) }, row.currency),
    dueDateLabel,
    issueDateLabel,
  });

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await buildPlatformBillPdfBuffer(row);
  } catch (e) {
    console.error("[platform-bill-email] pdf build failed", billId, e);
    pdfBuffer = Buffer.alloc(0);
  }

  const pdfFilename = `bill-${row.publicCode.replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`;

  const log = await prisma.staffCreationNotificationLog.create({
    data: {
      businessId: null,
      userId: null,
      recipientName: row.supplier.name,
      recipientEmail,
      staffRole: UserRole.MERCHANT,
      notificationType: StaffCreationNotificationType.PURCHASE_BILL_APPROVED,
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
