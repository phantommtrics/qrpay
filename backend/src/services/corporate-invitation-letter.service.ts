import { Resend } from "resend";
import PDFDocument from "pdfkit";
import { Prisma, StaffCreationNotificationStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { env } from "../config/env.js";
import { drawEasypayLogoPdfHeader, easypayEmailLogoHtml } from "../lib/easypay-logo.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

type PdfDoc = InstanceType<typeof PDFDocument>;

const PLATFORM_NAME = "DirectPay";
const DEFAULT_CURRENCY = "GMD";
const REPLY_TO_EMAIL = "info@phantommetrics.gm";
const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

const COL = {
  teal600: "#0d9488",
  slate900: "#0f172a",
  slate800: "#1e293b",
  slate700: "#334155",
  slate600: "#475569",
  slate500: "#64748b",
  slate300: "#cbd5e1",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  slate50: "#f8fafc",
  white: "#ffffff",
};

export type CorporateInvitationLetterInput = {
  templateMode?: "default" | "manual";
  organizationName: string;
  contactName: string;
  contactTitle?: string | null;
  toEmail: string;
  ccEmails: string[];
  senderName: string;
  senderTitle?: string | null;
  senderEmail?: string | null;
  proposalReference?: string | null;
  monthlyFeeLabel?: string | null;
  onboardingTimeline?: string | null;
  nextStep?: string | null;
  subject?: string | null;
  personalNote?: string | null;
  manualTemplateContent?: string | null;
};

export type CorporateInvitationLetterSender = {
  userId: string;
  userName: string;
  userEmail: string;
};

export type CorporateInvitationEmailLogRow = {
  id: string;
  organizationName: string;
  contactName: string;
  contactTitle: string | null;
  recipientEmail: string;
  ccEmails: string[];
  senderName: string;
  senderTitle: string | null;
  subject: string;
  attachmentFilename: string;
  provider: string;
  deliveryStatus: StaffCreationNotificationStatus;
  resendEmailId: string | null;
  failureReason: string | null;
  sentAt: Date | null;
  createdByUserId: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function statusSql(status: StaffCreationNotificationStatus) {
  return Prisma.sql`${status}::"StaffCreationNotificationStatus"`;
}

async function createInvitationLog(input: {
  organizationName: string;
  contactName: string;
  contactTitle: string | null;
  recipientEmail: string;
  ccEmails: string[];
  senderName: string;
  senderTitle: string | null;
  subject: string;
  attachmentFilename: string;
  createdByUserId: string;
  createdByName: string;
  createdByEmail: string;
}): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "corporateInvitationEmailLogs" (
      "id",
      "organizationName",
      "contactName",
      "contactTitle",
      "recipientEmail",
      "ccEmails",
      "senderName",
      "senderTitle",
      "subject",
      "attachmentFilename",
      "provider",
      "deliveryStatus",
      "createdByUserId",
      "createdByName",
      "createdByEmail",
      "updatedAt"
    )
    VALUES (
      ${randomUUID()},
      ${input.organizationName},
      ${input.contactName},
      ${input.contactTitle},
      ${input.recipientEmail},
      ${input.ccEmails},
      ${input.senderName},
      ${input.senderTitle},
      ${input.subject},
      ${input.attachmentFilename},
      'resend',
      ${statusSql(StaffCreationNotificationStatus.PENDING)},
      ${input.createdByUserId},
      ${input.createdByName},
      ${input.createdByEmail},
      NOW()
    )
    RETURNING "id"
  `;
  return rows[0] ?? { id: "" };
}

async function markInvitationLogFailed(id: string, failureReason: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "corporateInvitationEmailLogs"
    SET
      "deliveryStatus" = ${statusSql(StaffCreationNotificationStatus.FAILED)},
      "failureReason" = ${failureReason},
      "updatedAt" = NOW()
    WHERE "id" = ${id}
  `;
}

async function markInvitationLogSent(id: string, resendEmailId: string): Promise<CorporateInvitationEmailLogRow> {
  const rows = await prisma.$queryRaw<CorporateInvitationEmailLogRow[]>`
    UPDATE "corporateInvitationEmailLogs"
    SET
      "deliveryStatus" = ${statusSql(StaffCreationNotificationStatus.SENT)},
      "resendEmailId" = ${resendEmailId},
      "sentAt" = NOW(),
      "updatedAt" = NOW()
    WHERE "id" = ${id}
    RETURNING *
  `;
  const row = rows[0];
  if (!row) {
    throw new HttpError(500, "Invitation email log was not found after sending.");
  }
  return row;
}

function pdfBufferFromDoc(build: (doc: PdfDoc, margin: number, contentRight: number) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 54;
    const doc = new PDFDocument({ size: "A4", margin });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc, margin, doc.page.width - margin);
    doc.end();
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstName(fullName: string): string {
  const t = fullName.trim();
  if (!t) return "there";
  return t.split(/\s+/)[0] ?? t;
}

function cleanFilenamePart(s: string): string {
  const cleaned = s.trim().replace(/[^a-zA-Z0-9-_]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "corporate";
}

function todayLong(): string {
  return new Date().toLocaleDateString("en-US", { dateStyle: "long" });
}

function valueOrDefault(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function templateVariableMap(input: CorporateInvitationLetterInput): Record<string, string> {
  return {
    today: todayLong(),
    platformName: PLATFORM_NAME,
    platformUrl: env.PLATFORM_URL,
    organizationName: input.organizationName,
    contactName: input.contactName,
    contactFirstName: firstName(input.contactName),
    contactTitle: input.contactTitle?.trim() || "",
    recipientEmail: input.toEmail,
    ccEmails: input.ccEmails.join(", "),
    senderName: input.senderName,
    senderTitle: valueOrDefault(input.senderTitle, `${PLATFORM_NAME} Platform Operations`),
    senderEmail: input.senderEmail?.trim() || "",
    replyToEmail: REPLY_TO_EMAIL,
    proposalReference: valueOrDefault(input.proposalReference, "Business invitation letter"),
    monthlyFeeLabel: moneyLabel(input),
    onboardingTimeline: timelineLabel(input),
    nextStep: nextStepLabel(input),
  };
}

function renderManualTemplate(input: CorporateInvitationLetterInput): string {
  const template = input.manualTemplateContent?.trim();
  if (!template) {
    return buildDefaultCorporateInvitationLetterText(input);
  }
  const variables = templateVariableMap(input);
  return template.replace(TEMPLATE_VARIABLE_PATTERN, (_match, key: string) => variables[key] ?? "");
}

function moneyLabel(input: CorporateInvitationLetterInput): string {
  return valueOrDefault(input.monthlyFeeLabel, `Custom corporate pricing in ${DEFAULT_CURRENCY}`);
}

function timelineLabel(input: CorporateInvitationLetterInput): string {
  return valueOrDefault(input.onboardingTimeline, "5 to 10 business days after account setup and wallet readiness checks");
}

function nextStepLabel(input: CorporateInvitationLetterInput): string {
  return valueOrDefault(
    input.nextStep,
    "A short discovery meeting to confirm your payment channels, approval workflow, reporting needs, and onboarding schedule.",
  );
}

function buildDefaultCorporateInvitationLetterText(input: CorporateInvitationLetterInput): string {
  const contactTitle = input.contactTitle?.trim();
  const titleLine = contactTitle ? `${contactTitle}\n${input.organizationName}` : input.organizationName;
  const reference = input.proposalReference?.trim()
    ? `\nReference: ${input.proposalReference.trim()}`
    : "";
  const senderTitle = input.senderTitle?.trim();

  return [
    todayLong(),
    "",
    input.contactName,
    titleLine,
    reference,
    "",
    `Dear ${firstName(input.contactName)},`,
    "",
    `We are pleased to introduce ${PLATFORM_NAME} to ${input.organizationName} as a practical business platform for organizations that want stronger control over collections, cash movement, and everyday accounting operations.`,
    "",
    `${PLATFORM_NAME} helps corporate teams and growing businesses manage cash activity, keep journals and books up to date, collect payments from local wallets including Wave, APS, and Yonna, and review financial reports from one secure workspace. Your finance and operations team can use the platform to view profit and loss, account statements, balance sheets, transaction journals, customer invoices, supplier bills, and other accounting features that support clearer decisions and better oversight.`,
    "",
    `For ${input.organizationName}, our proposal is to configure a corporate workspace that matches your operating structure, payment collection needs, approval controls, and reporting expectations. The commercial discussion can be aligned around ${moneyLabel(input)}, with onboarding targeted within ${timelineLabel(input)}.`,
    "",
    "Key areas we can support include:",
    "- Cash and wallet payment tracking across supported local payment channels.",
    "- Journal bookkeeping and transaction records for finance visibility.",
    "- Profit and loss, balance sheet, account statement, and general ledger reporting.",
    "- Subscription, invoice, bill, and customer payment workflows for business teams.",
    "- Role-based access for owners, administrators, finance staff, and operators.",
    "",
    `Recommended next step: ${nextStepLabel(input)}`,
    "",
    "Platform details:",
    `- Platform URL: ${env.PLATFORM_URL}`,
    `- Sender email: ${valueOrDefault(input.senderEmail, "Available from the DirectPay platform team")}`,
    `- Replies: ${REPLY_TO_EMAIL}`,
    "",
    `We would welcome the opportunity to discuss how ${PLATFORM_NAME} can support ${input.organizationName}'s finance operations and payment collection strategy.`,
    "",
    "Kind regards,",
    input.senderName,
    senderTitle || `${PLATFORM_NAME} Platform Operations`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function buildCorporateInvitationLetterText(input: CorporateInvitationLetterInput): string {
  if (input.templateMode === "manual") {
    return renderManualTemplate(input);
  }
  return buildDefaultCorporateInvitationLetterText(input);
}

function addWrappedText(doc: PdfDoc, text: string, x: number, y: number, width: number, options?: { bold?: boolean }) {
  doc.font(options?.bold ? "Helvetica-Bold" : "Helvetica").fontSize(10.5).fillColor(COL.slate800);
  doc.text(text, x, y, { width, lineGap: 3 });
  return doc.y;
}

function addBullet(doc: PdfDoc, text: string, x: number, y: number, width: number) {
  doc.font("Helvetica").fontSize(10).fillColor(COL.slate700);
  doc.circle(x + 3, y + 6, 2).fill(COL.teal600);
  doc.text(text, x + 14, y, { width: width - 14, lineGap: 2 });
  return doc.y;
}

function ensurePageSpace(doc: PdfDoc, currentY: number, margin: number, needed: number): number {
  if (currentY + needed <= doc.page.height - margin) {
    return currentY;
  }
  doc.addPage();
  return margin;
}

function drawLetterTextLines(doc: PdfDoc, text: string, startY: number, margin: number, contentW: number): number {
  let y = startY;
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      y += 8;
      continue;
    }
    y = ensurePageSpace(doc, y, margin, 34);
    if (/^[-*]\s+/.test(line)) {
      y = addBullet(doc, line.replace(/^[-*]\s+/, ""), margin, y, contentW);
      y += 6;
      continue;
    }
    const isHeading = line.length <= 90 && !line.endsWith(".") && /:$/u.test(line);
    y = addWrappedText(doc, line, margin, y, contentW, { bold: isHeading });
    y += isHeading ? 8 : 10;
  }
  return y;
}

export function buildCorporateInvitationLetterPdfBuffer(
  input: CorporateInvitationLetterInput,
): Promise<Buffer> {
  return pdfBufferFromDoc((doc, margin, contentRight) => {
    const contentW = contentRight - margin;
    let y = drawEasypayLogoPdfHeader(doc, margin, margin);

    doc.font("Helvetica-Bold").fontSize(8).fillColor(COL.teal600);
    doc.text("CORPORATE BUSINESS PROPOSAL", margin, y, { characterSpacing: 1.8 });
    y += 14;
    doc.font("Helvetica-Bold").fontSize(22).fillColor(COL.slate900);
    doc.text(`Invitation to ${PLATFORM_NAME}`, margin, y, { width: contentW * 0.72 });

    const ref = valueOrDefault(input.proposalReference, "Business invitation letter");
    doc.font("Helvetica").fontSize(9).fillColor(COL.slate500);
    doc.text(todayLong(), contentRight - 170, y + 4, { width: 170, align: "right" });
    doc.text(ref, contentRight - 170, y + 20, { width: 170, align: "right" });
    y += 44;

    doc.moveTo(margin, y).lineTo(contentRight, y).strokeColor(COL.slate200).lineWidth(1).stroke();
    y += 18;

    const detailsBoxY = y;
    const detailsBoxH = 128;
    doc.roundedRect(margin, detailsBoxY, contentW, detailsBoxH, 12).fill(COL.slate50);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COL.slate500);
    doc.text("PREPARED FOR", margin + 18, detailsBoxY + 16);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(COL.slate900);
    doc.text(input.organizationName, margin + 18, detailsBoxY + 32, { width: contentW * 0.44 });
    doc.font("Helvetica").fontSize(9).fillColor(COL.slate600);
    doc.text(input.contactName, margin + 18, detailsBoxY + 58, { width: contentW * 0.44 });
    if (input.contactTitle?.trim()) {
      doc.text(input.contactTitle.trim(), margin + 18, detailsBoxY + 72, { width: contentW * 0.44 });
    }

    const detailX = margin + contentW * 0.55;
    const detailW = contentW * 0.39;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COL.slate500);
    doc.text("PROPOSAL DETAILS", detailX, detailsBoxY + 16);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COL.slate500);
    doc.text("Commercials", detailX, detailsBoxY + 34, { width: detailW });
    doc.font("Helvetica").fontSize(9).fillColor(COL.slate700);
    doc.text(moneyLabel(input), detailX, detailsBoxY + 47, { width: detailW, lineGap: 1 });
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COL.slate500);
    doc.text("Onboarding", detailX, detailsBoxY + 82, { width: detailW });
    doc.font("Helvetica").fontSize(9).fillColor(COL.slate700);
    doc.text(timelineLabel(input), detailX, detailsBoxY + 95, { width: detailW, lineGap: 1 });
    y = detailsBoxY + detailsBoxH + 26;

    if (input.templateMode === "manual") {
      y = drawLetterTextLines(doc, buildCorporateInvitationLetterText(input), y, margin, contentW);
      doc.font("Helvetica").fontSize(7).fillColor(COL.slate500);
      doc.text(`Sent by ${PLATFORM_NAME}.`, margin, doc.page.height - margin + 16, {
        width: contentW,
        align: "center",
      });
      return;
    }

    y = addWrappedText(doc, `Dear ${firstName(input.contactName)},`, margin, y, contentW);
    y += 12;
    const paragraphs = [
      `We are pleased to introduce ${PLATFORM_NAME} to ${input.organizationName} as a practical business platform for organizations that want stronger control over collections, cash movement, and everyday accounting operations.`,
      `${PLATFORM_NAME} helps corporate teams and growing businesses manage cash activity, keep journals and books up to date, collect payments from local wallets including Wave, APS, and Yonna, and review financial reports from one secure workspace.`,
      `For ${input.organizationName}, our proposal is to configure a corporate workspace that matches your operating structure, payment collection needs, approval controls, and reporting expectations.`,
    ];
    for (const p of paragraphs) {
      y = ensurePageSpace(doc, y, margin, 54);
      y = addWrappedText(doc, p, margin, y, contentW);
      y += 10;
    }

    y = ensurePageSpace(doc, y, margin, 116);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(COL.slate900);
    doc.text("How DirectPay can support your team", margin, y);
    y += 20;
    const bullets = [
      "Cash and wallet payment tracking across Wave, APS, and Yonna.",
      "Journal bookkeeping and transaction records for finance visibility.",
      "Profit and loss, balance sheet, account statement, and general ledger reporting.",
      "Subscription, invoice, bill, and customer payment workflows for business teams.",
      "Role-based access for owners, administrators, finance staff, and operators.",
    ];
    for (const b of bullets) {
      y = addBullet(doc, b, margin, y, contentW);
      y += 7;
    }

    y = ensurePageSpace(doc, y + 8, margin, 86);
    doc.roundedRect(margin, y, contentW, 70, 12).fill(COL.teal600);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COL.white);
    doc.text("Recommended next step", margin + 18, y + 14);
    doc.font("Helvetica").fontSize(10).fillColor(COL.white);
    doc.text(nextStepLabel(input), margin + 18, y + 32, { width: contentW - 36, lineGap: 2 });
    y += 92;

    y = ensurePageSpace(doc, y, margin, 72);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(COL.slate900);
    doc.text("Platform details", margin, y);
    y += 20;
    for (const detail of [
      `Platform URL: ${env.PLATFORM_URL}`,
      `Sender email: ${valueOrDefault(input.senderEmail, "Available from the DirectPay platform team")}`,
      `Replies: ${REPLY_TO_EMAIL}`,
    ]) {
      y = addBullet(doc, detail, margin, y, contentW);
      y += 6;
    }
    y += 8;

    y = ensurePageSpace(doc, y, margin, 80);
    y = addWrappedText(
      doc,
      `We would welcome the opportunity to discuss how ${PLATFORM_NAME} can support ${input.organizationName}'s finance operations and payment collection strategy.`,
      margin,
      y,
      contentW,
    );
    y += 24;
    doc.font("Helvetica").fontSize(10.5).fillColor(COL.slate800);
    doc.text("Kind regards,", margin, y);
    y += 18;
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COL.slate900);
    doc.text(input.senderName, margin, y);
    y += 14;
    doc.font("Helvetica").fontSize(9.5).fillColor(COL.slate600);
    doc.text(valueOrDefault(input.senderTitle, `${PLATFORM_NAME} Platform Operations`), margin, y);

    doc.font("Helvetica").fontSize(7).fillColor(COL.slate500);
    doc.text(`Sent by ${PLATFORM_NAME}.`, margin, doc.page.height - margin + 16, {
      width: contentW,
      align: "center",
    });
  });
}

export function buildCorporateInvitationEmailContent(input: CorporateInvitationLetterInput): {
  subject: string;
  htmlBody: string;
  textBody: string;
} {
  const subject =
    input.subject?.trim() || `${PLATFORM_NAME} proposal for ${input.organizationName}`;
  const note = input.personalNote?.trim()
    ? `<p style="margin:0 0 16px;color:#334155;">${escapeHtml(input.personalNote.trim())}</p>`
    : "";
  const htmlBody = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:580px;">
    ${easypayEmailLogoHtml()}
    <p style="margin:0 0 16px;">Dear ${escapeHtml(firstName(input.contactName))},</p>
    <p style="margin:0 0 16px;">
      I am reaching out from ${PLATFORM_NAME}, a business payments and accounting platform, with a short proposal
      letter prepared for
      <strong>${escapeHtml(input.organizationName)}</strong>.
    </p>
    ${note}
    <p style="margin:0 0 16px;">
      The attachment explains how ${PLATFORM_NAME} can help your organization manage cash activity, bookkeeping,
      wallet collections through Wave, APS, and Yonna, and finance reports such as profit and loss, account
      statements, and balance sheets.
    </p>
    <p style="margin:0 0 20px;">
      Please open the PDF proposal letter for the details. We would be happy to arrange a short discussion around
      your payment collection and accounting workflow.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">
      Platform: <a href="${escapeHtml(env.PLATFORM_URL)}" style="color:#0d9488;text-decoration:none;">${escapeHtml(env.PLATFORM_URL)}</a><br/>
      Sender email: ${escapeHtml(valueOrDefault(input.senderEmail, "DirectPay platform team"))}<br/>
      Replies go to: <a href="mailto:${REPLY_TO_EMAIL}" style="color:#0d9488;text-decoration:none;">${REPLY_TO_EMAIL}</a>
    </p>
    <p style="margin:24px 0 0;">
      Kind regards,<br/>
      <strong>${escapeHtml(input.senderName)}</strong><br/>
      <span style="color:#64748b;">${escapeHtml(valueOrDefault(input.senderTitle, `${PLATFORM_NAME} Platform Operations`))}</span>
    </p>
  </div>`;

  const textBody = [
    `Dear ${firstName(input.contactName)},`,
    "",
    `I am reaching out from ${PLATFORM_NAME}, a business payments and accounting platform, with a short proposal letter prepared for ${input.organizationName}.`,
    ...(input.personalNote?.trim() ? ["", input.personalNote.trim()] : []),
    "",
    `The attachment explains how ${PLATFORM_NAME} can help your organization manage cash activity, bookkeeping, wallet collections through Wave, APS, and Yonna, and finance reports such as profit and loss, account statements, and balance sheets.`,
    "",
    "Please open the PDF proposal letter for the details.",
    "",
    `Platform: ${env.PLATFORM_URL}`,
    `Sender email: ${valueOrDefault(input.senderEmail, "DirectPay platform team")}`,
    `Replies go to: ${REPLY_TO_EMAIL}`,
    "",
    "Kind regards,",
    input.senderName,
    valueOrDefault(input.senderTitle, `${PLATFORM_NAME} Platform Operations`),
  ].join("\n");

  return { subject, htmlBody, textBody };
}

export async function sendCorporateInvitationLetter(input: CorporateInvitationLetterInput, sender: CorporateInvitationLetterSender): Promise<{
  id: string;
  providerMessageId: string;
  attachmentFilename: string;
}> {
  const pdfBuffer = await buildCorporateInvitationLetterPdfBuffer(input);
  const content = buildCorporateInvitationEmailContent(input);
  const attachmentFilename = `directpay-proposal-${cleanFilenamePart(input.organizationName)}.pdf`;
  const log = await createInvitationLog({
    organizationName: input.organizationName,
    contactName: input.contactName,
    contactTitle: input.contactTitle?.trim() || null,
    recipientEmail: input.toEmail,
    ccEmails: input.ccEmails,
    senderName: input.senderName,
    senderTitle: input.senderTitle?.trim() || null,
    subject: content.subject,
    attachmentFilename,
    createdByUserId: sender.userId,
    createdByName: sender.userName,
    createdByEmail: sender.userEmail,
  });

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    await markInvitationLogFailed(log.id, "RESEND_API_KEY or RESEND_FROM_EMAIL is not configured.");
    throw new HttpError(503, "RESEND_API_KEY or RESEND_FROM_EMAIL is not configured.");
  }

  const resend = new Resend(env.RESEND_API_KEY);
  let result: Awaited<ReturnType<Resend["emails"]["send"]>>;
  try {
    result = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.toEmail,
      ...(input.ccEmails.length > 0 ? { cc: input.ccEmails } : {}),
      replyTo: REPLY_TO_EMAIL,
      subject: content.subject,
      html: content.htmlBody,
      text: content.textBody,
      attachments: [
        {
          filename: attachmentFilename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (error) {
    await markInvitationLogFailed(
      log.id,
      error instanceof Error ? error.message : "Unknown email provider error",
    );
    throw error;
  }

  if (result.error) {
    await markInvitationLogFailed(
      log.id,
      result.error.message ?? "Resend could not send the invitation letter.",
    );
    throw new HttpError(502, result.error.message ?? "Resend could not send the invitation letter.");
  }
  if (!result.data?.id) {
    await markInvitationLogFailed(log.id, "Resend did not return an email ID.");
    throw new HttpError(502, "Resend did not return an email ID.");
  }
  const sent = await markInvitationLogSent(log.id, result.data.id);
  return { id: sent.id, providerMessageId: result.data.id, attachmentFilename };
}

export async function listCorporateInvitationEmailLogs(limit = 100) {
  const safeLimit = Math.min(Math.max(limit, 1), 250);
  return prisma.$queryRaw<CorporateInvitationEmailLogRow[]>`
    SELECT *
    FROM "corporateInvitationEmailLogs"
    ORDER BY "createdAt" DESC
    LIMIT ${safeLimit}
  `;
}
