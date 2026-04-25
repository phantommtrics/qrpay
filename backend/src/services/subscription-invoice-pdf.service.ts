import type { Business, Plan, Subscription, SubscriptionInvoice } from "@prisma/client";
import PDFDocument from "pdfkit";

import { drawEasypayLogoPdfHeader } from "../lib/easypay-logo.js";

/** Tailwind-aligned palette (matches subscription invoice detail page). */
const COL = {
  teal600: "#0d9488",
  slate900: "#0f172a",
  slate800: "#1e293b",
  slate700: "#334155",
  slate600: "#475569",
  slate500: "#64748b",
  slate400: "#94a3b8",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  slate50: "#f8fafc",
  emerald700: "#15803d",
};

function money(amount: { toString(): string }) {
  return Number(amount.toString()).toFixed(2);
}

/** Long date like `Intl.DateTimeFormat(..., { dateStyle: 'long' })` (en-US locale). */
function fmtLongDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    dateStyle: "long",
  });
}

type InvoicePdfPayload = SubscriptionInvoice & {
  business: Business;
  plan: Plan;
  subscription: Subscription;
};

export function generateSubscriptionInvoicePdf(payload: InvoicePdfPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 48;
    const doc = new PDFDocument({ size: "A4", margin });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const contentRight = pageW - margin;
    const contentW = contentRight - margin;
    const midX = margin + contentW / 2;
    const rightColW = 200;
    const rightColX = contentRight - rightColW;

    const { business, plan, subscription } = payload;
    const amountStr = `${money(payload.amount)} ${payload.currency}`;
    const lineTitle = `${plan.name} — subscription billing (${plan.code})`;
    const lineSub = `Billing window ${fmtLongDate(payload.billingPeriodStart)} to ${fmtLongDate(payload.billingPeriodEnd)}`;
    const subStatusHuman = subscription.status.replace(/_/g, " ");

    let y = margin;
    y = drawEasypayLogoPdfHeader(doc, margin, y);

    // —— Header: left block (Invoice title, id) + right block (status, dates) ——
    const headerTop = y;

    doc.font("Helvetica-Bold").fontSize(26).fillColor(COL.slate900);
    doc.text("Invoice", margin, headerTop, { width: midX - margin - 12 });

    doc.font("Courier").fontSize(9).fillColor(COL.slate500);
    doc.text(payload.id, margin, headerTop + 32, { width: midX - margin - 12 });

    const ry = headerTop;
    doc.font("Helvetica").fontSize(10).fillColor(COL.slate600);
    doc.text("Status", rightColX, ry, { width: rightColW, align: "right" });
    doc.font("Helvetica-Bold").fontSize(16).fillColor(COL.slate800);
    doc.text(String(payload.status), rightColX, ry + 14, { width: rightColW, align: "right" });

    doc.font("Helvetica-Bold").fontSize(10).fillColor(COL.slate900);
    doc.text("Issue date", rightColX, ry + 44, { width: rightColW, align: "right" });
    doc.font("Helvetica").fillColor(COL.slate600);
    doc.text(fmtLongDate(payload.createdAt), rightColX, ry + 58, { width: rightColW, align: "right" });

    doc.font("Helvetica-Bold").fillColor(COL.slate900);
    doc.text("Due date", rightColX, ry + 78, { width: rightColW, align: "right" });
    doc.font("Helvetica").fillColor(COL.slate600);
    doc.text(fmtLongDate(payload.dueDate), rightColX, ry + 92, { width: rightColW, align: "right" });

    y = Math.max(headerTop + 72, ry + 112) + 8;
    doc.moveTo(margin, y).lineTo(contentRight, y).strokeColor(COL.slate200).lineWidth(1).stroke();
    y += 28;

    // —— Two columns: Bill to | Subscription ——
    const colGap = 24;
    const colW = (contentW - colGap) / 2;

    doc.font("Helvetica-Bold").fontSize(8).fillColor(COL.slate500);
    doc.text("BILL TO", margin, y, { width: colW, characterSpacing: 0.5 });

    doc.text("SUBSCRIPTION", margin + colW + colGap, y, { width: colW, characterSpacing: 0.5 });

    const rightX = margin + colW + colGap;
    /** Place body text below the section labels so labels never overlap names/plan. */
    const sectionLabelGap = 14;
    let yL = y + sectionLabelGap;
    let yR = y + sectionLabelGap;

    doc.font("Helvetica-Bold").fontSize(12).fillColor(COL.slate900);
    doc.text(business.name, margin, yL, { width: colW });
    yL += doc.heightOfString(business.name, { width: colW }) + 6;

    doc.font("Helvetica").fontSize(11).fillColor(COL.slate800);
    doc.text(plan.name, rightX, yR, { width: colW });
    yR += doc.heightOfString(plan.name, { width: colW }) + 4;

    doc.fontSize(10).fillColor(COL.slate600);
    doc.text(business.ownerName, margin, yL, { width: colW });
    yL += doc.heightOfString(business.ownerName, { width: colW }) + 4;
    const planDescH = doc.heightOfString(plan.description, { width: colW });
    doc.text(plan.description, rightX, yR, { width: colW });
    yR += planDescH + 8;

    doc.text(business.ownerEmail, margin, yL, { width: colW });
    yL += doc.heightOfString(business.ownerEmail, { width: colW }) + 4;

    doc.fontSize(8).fillColor(COL.slate500);
    doc.text(`Subscription status: ${subStatusHuman}`, rightX, yR, { width: colW });
    yR += 12;
    doc.text(
      `Service period: ${fmtLongDate(payload.billingPeriodStart)} — ${fmtLongDate(payload.billingPeriodEnd)}`,
      rightX,
      yR,
      { width: colW },
    );
    yR += 22;

    if (business.industry) {
      doc.text(`Industry: ${business.industry}`, margin, yL, { width: colW });
      yL += 12;
    }
    doc.font("Courier").fontSize(8).fillColor(COL.slate400);
    doc.text(`Ref: ${business.slug}`, margin, yL, { width: colW });
    yL += 16;

    y = Math.max(yL, yR) + 20;

    // —— Line items card (rounded rect + table) ——
    const tablePad = 16;
    const descColW = contentW - rightColW - tablePad * 2 - 8;
    const amountColW = rightColW;

    doc.font("Helvetica-Bold").fontSize(10);
    const row1H = doc.heightOfString(lineTitle, { width: descColW - 8 });
    doc.font("Helvetica").fontSize(8);
    const row2H = doc.heightOfString(lineSub, { width: descColW - 8 });
    const bodyH = Math.max(row1H + row2H + 28, 52);
    const theadH = 28;
    const cardH = theadH + bodyH + tablePad;

    doc.roundedRect(margin, y, contentW, cardH, 10).fillAndStroke(COL.slate50, COL.slate100);

    const innerX = margin + tablePad;
    const innerY = y + tablePad;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COL.slate500);
    doc.text("DESCRIPTION", innerX, innerY, { width: descColW });
    doc.text("AMOUNT", innerX + descColW, innerY, { width: amountColW, align: "right" });

    doc.moveTo(margin + 8, innerY + 20).lineTo(contentRight - 8, innerY + 20).strokeColor(COL.slate200).stroke();

    const cellY = innerY + 28;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COL.slate800);
    doc.text(lineTitle, innerX, cellY, { width: descColW - 8 });
    doc.font("Helvetica-Bold").fontSize(11).fillColor(COL.slate900);
    doc.text(amountStr, innerX + descColW, cellY, { width: amountColW, align: "right" });

    doc.font("Helvetica").fontSize(8).fillColor(COL.slate500);
    doc.text(lineSub, innerX, cellY + row1H + 4, { width: descColW - 8 });

    y += cardH + 28;

    // —— Totals (right-aligned block like UI max-w-xs) ——
    const totalsW = 220;
    const totalsX = contentRight - totalsW;
    doc.moveTo(margin, y).lineTo(contentRight, y).strokeColor(COL.slate200).stroke();
    y += 20;

    doc.font("Helvetica").fontSize(10).fillColor(COL.slate600);
    doc.text("Subtotal", totalsX, y, { width: 100 });
    doc.text(amountStr, totalsX, y, { width: totalsW, align: "right" });
    y += 18;

    doc.font("Helvetica-Bold").fontSize(12).fillColor(COL.slate900);
    doc.text("Total due", totalsX, y, { width: 100 });
    doc.text(amountStr, totalsX, y, { width: totalsW, align: "right" });
    y += 22;

    if (payload.paidAt) {
      doc.font("Helvetica").fontSize(10).fillColor(COL.emerald700);
      doc.text(`Paid on ${fmtLongDate(payload.paidAt)}`, totalsX, y, {
        width: totalsW,
        align: "right",
      });
      y += 16;
    }
    if (payload.externalReference?.trim()) {
      doc.font("Courier").fontSize(8).fillColor(COL.slate400);
      doc.text(`External ref: ${payload.externalReference.trim()}`, totalsX, y, {
        width: totalsW,
        align: "right",
      });
      y += 14;
    }

    y += 28;
    doc.moveTo(margin, y).lineTo(contentRight, y).strokeColor(COL.slate100).stroke();
    y += 20;

    doc.font("Helvetica").fontSize(8).fillColor(COL.slate400);
    doc.text("Thank you for using DirectPay.", margin, y, {
      width: contentW,
      align: "center",
    });
    y += 12;
    doc.text("This document was generated from the platform billing system.", margin, y, {
      width: contentW,
      align: "center",
    });

    doc.end();
  });
}
