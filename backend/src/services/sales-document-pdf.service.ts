import type { Prisma } from "@prisma/client";
import PDFDocument from "pdfkit";

type PdfDoc = InstanceType<typeof PDFDocument>;

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

const COL = {
  teal600: "#0d9488",
  slate900: "#0f172a",
  slate800: "#1e293b",
  slate600: "#475569",
  slate500: "#64748b",
  slate400: "#94a3b8",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  slate50: "#f8fafc",
};

function money(n: number): string {
  return n.toFixed(2);
}

function dec(v: Prisma.Decimal | number): number {
  return typeof v === "number" ? v : Number(v.toString());
}

function fmtLongDate(d: Date) {
  return d.toLocaleDateString("en-US", { dateStyle: "long" });
}

function lineTotal(l: {
  quantity: Prisma.Decimal;
  unitAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
}): number {
  return dec(l.quantity) * dec(l.unitAmount) + dec(l.taxAmount);
}

const invoiceForPdfInclude = {
  business: { select: { name: true, ownerEmail: true, slug: true } },
  contact: { select: { id: true, name: true, email: true } },
  sourceQuotation: { select: { id: true, publicCode: true } },
  journalEntry: { select: { id: true, postedAt: true } },
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
  },
} as const;

const quotationForPdfInclude = {
  business: { select: { name: true, ownerEmail: true, slug: true } },
  contact: { select: { id: true, name: true, email: true } },
  invoiceFromQuote: { select: { id: true, publicCode: true, status: true } },
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
  },
} as const;

export type SalesInvoicePdfRow = Prisma.SalesInvoiceGetPayload<{ include: typeof invoiceForPdfInclude }>;
export type SalesQuotationPdfRow = Prisma.SalesQuotationGetPayload<{ include: typeof quotationForPdfInclude }>;

function pdfBufferFromDoc(build: (doc: PdfDoc, margin: number, contentRight: number) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 48;
    const doc = new PDFDocument({ size: "A4", margin });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const contentRight = doc.page.width - margin;
    build(doc, margin, contentRight);
    doc.end();
  });
}

export function buildSalesInvoicePdfBuffer(row: SalesInvoicePdfRow): Promise<Buffer> {
  return pdfBufferFromDoc((doc, margin, contentRight) => {
    const contentW = contentRight - margin;
    const lines = [...row.lines].sort((a, b) => a.sortOrder - b.sortOrder);
    let sub = 0;
    let total = 0;
    for (const l of lines) {
      sub += dec(l.quantity) * dec(l.unitAmount);
      total += lineTotal(l);
    }

    let y = margin;

    doc.font("Helvetica-Bold").fontSize(8).fillColor(COL.teal600);
    doc.text("SALES INVOICE", margin, y, { characterSpacing: 2 });
    doc.font("Helvetica-Bold").fontSize(22).fillColor(COL.slate900);
    doc.text(row.business.name, margin, y + 14, { width: contentW * 0.55 });

    doc.font("Helvetica").fontSize(9).fillColor(COL.slate600);
    doc.text(row.business.ownerEmail, margin, y + 42, { width: contentW * 0.55 });

    const rightW = 200;
    const rx = contentRight - rightW;
    doc.font("Courier").fontSize(10).fillColor(COL.slate800);
    doc.text(row.publicCode, rx, y, { width: rightW, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor(COL.slate500);
    doc.text(`Status: ${row.status}`, rx, y + 18, { width: rightW, align: "right" });

    y += 72;
    doc.moveTo(margin, y).lineTo(contentRight, y).strokeColor(COL.slate200).lineWidth(1).stroke();
    y += 16;

    const colGap = 20;
    const half = (contentW - colGap) / 2;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COL.slate500);
    doc.text("BILL TO", margin, y);
    doc.text("DETAILS", margin + half + colGap, y);
    y += 14;

    doc.font("Helvetica-Bold").fontSize(11).fillColor(COL.slate900);
    doc.text(row.contact.name, margin, y, { width: half });
    doc.font("Helvetica").fontSize(9).fillColor(COL.slate600);
    const detailX = margin + half + colGap;
    let dy = y;
    doc.text(`Issue: ${fmtLongDate(row.issueDate)}`, detailX, dy, { width: half });
    dy += 14;
    if (row.dueDate) {
      doc.text(`Due: ${fmtLongDate(row.dueDate)}`, detailX, dy, { width: half });
      dy += 14;
    }
    if (row.reference?.trim()) {
      doc.text(`Ref: ${row.reference.trim()}`, detailX, dy, { width: half });
      dy += 14;
    }
    if (row.sourceQuotation) {
      doc.text(`From quote: ${row.sourceQuotation.publicCode}`, detailX, dy, { width: half });
      dy += 14;
    }

    if (row.contact.email) {
      doc.font("Helvetica").fontSize(9).fillColor(COL.slate600);
      doc.text(row.contact.email, margin, y + 16, { width: half });
    }

    y = Math.max(y + 36, dy + 8) + 8;
    doc.moveTo(margin, y).lineTo(contentRight, y).strokeColor(COL.slate200).stroke();
    y += 12;

    doc.font("Helvetica-Bold").fontSize(7).fillColor(COL.slate500);
    doc.text("DESCRIPTION", margin, y, { width: 200 });
    doc.text("ACCOUNT", margin + 205, y, { width: 110 });
    doc.text("QTY", margin + 318, y, { width: 36, align: "right" });
    doc.text("UNIT", margin + 358, y, { width: 52, align: "right" });
    doc.text("TAX", margin + 412, y, { width: 44, align: "right" });
    doc.text("AMOUNT", margin + 458, y, { width: contentRight - margin - 458, align: "right" });
    y += 12;
    doc.moveTo(margin, y).lineTo(contentRight, y).strokeColor(COL.slate100).stroke();
    y += 6;

    doc.font("Helvetica").fontSize(8).fillColor(COL.slate800);
    const pageBottom = doc.page.height - margin;
    for (const l of lines) {
      const desc = [l.narration || "—", l.unitLabel ? `(${l.unitLabel})` : ""].filter(Boolean).join(" ");
      const acc = l.chartOfAccount ? `${l.chartOfAccount.code}` : "—";
      const h = Math.max(
        doc.heightOfString(desc, { width: 198 }),
        doc.heightOfString(acc, { width: 108 }),
        14,
      );
      if (y + h > pageBottom - 100) {
        doc.addPage();
        y = margin;
      }
      doc.text(desc, margin, y, { width: 198 });
      doc.text(acc, margin + 205, y, { width: 108 });
      doc.text(String(dec(l.quantity)), margin + 318, y, { width: 36, align: "right" });
      doc.text(money(dec(l.unitAmount)), margin + 358, y, { width: 52, align: "right" });
      doc.text(money(dec(l.taxAmount)), margin + 412, y, { width: 44, align: "right" });
      doc.font("Helvetica-Bold");
      doc.text(money(lineTotal(l)), margin + 458, y, { width: contentRight - margin - 458, align: "right" });
      doc.font("Helvetica");
      y += h + 4;
    }

    y += 8;
    const totalsX = contentRight - 220;
    doc.moveTo(totalsX - 8, y).lineTo(contentRight, y).strokeColor(COL.slate200).stroke();
    y += 12;
    doc.font("Helvetica").fontSize(9).fillColor(COL.slate600);
    doc.text("Subtotal (ex. tax)", totalsX, y, { width: 120 });
    doc.text(`${money(sub)} ${row.currency}`, totalsX + 120, y, { width: 100, align: "right" });
    y += 16;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(COL.slate900);
    doc.text("Total", totalsX, y, { width: 120 });
    doc.text(`${money(total)} ${row.currency}`, totalsX + 120, y, { width: 100, align: "right" });
    y += 28;

    if (row.journalEntry) {
      doc.font("Helvetica").fontSize(8).fillColor(COL.slate400);
      doc.text(`Payment recorded in ledger ${fmtLongDate(row.journalEntry.postedAt)}.`, margin, y, {
        width: contentW,
      });
      y += 14;
    }

    doc.font("Helvetica").fontSize(7).fillColor(COL.slate400);
    doc.text(
      "Thank you for your business. Please remit payment by the due date. Questions? Reply to this email or contact us at the address above.",
      margin,
      y,
      { width: contentW, align: "center" },
    );
  });
}

export function buildSalesQuotationPdfBuffer(row: SalesQuotationPdfRow): Promise<Buffer> {
  return pdfBufferFromDoc((doc, margin, contentRight) => {
    const contentW = contentRight - margin;
    const lines = [...row.lines].sort((a, b) => a.sortOrder - b.sortOrder);
    let sub = 0;
    let total = 0;
    for (const l of lines) {
      sub += dec(l.quantity) * dec(l.unitAmount);
      total += lineTotal(l);
    }

    let y = margin;

    doc.font("Helvetica-Bold").fontSize(8).fillColor(COL.teal600);
    doc.text("QUOTATION", margin, y, { characterSpacing: 2 });
    doc.font("Helvetica-Bold").fontSize(22).fillColor(COL.slate900);
    doc.text(row.business.name, margin, y + 14, { width: contentW * 0.55 });

    doc.font("Helvetica").fontSize(9).fillColor(COL.slate600);
    doc.text(row.business.ownerEmail, margin, y + 42, { width: contentW * 0.55 });

    const rightW = 200;
    const rx = contentRight - rightW;
    doc.font("Courier").fontSize(10).fillColor(COL.slate800);
    doc.text(row.publicCode, rx, y, { width: rightW, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor(COL.slate500);
    doc.text(`Status: ${row.status}`, rx, y + 18, { width: rightW, align: "right" });

    y += 72;
    doc.moveTo(margin, y).lineTo(contentRight, y).strokeColor(COL.slate200).lineWidth(1).stroke();
    y += 16;

    const colGap = 20;
    const half = (contentW - colGap) / 2;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COL.slate500);
    doc.text("BILL TO", margin, y);
    doc.text("VALIDITY", margin + half + colGap, y);
    y += 14;

    doc.font("Helvetica-Bold").fontSize(11).fillColor(COL.slate900);
    doc.text(row.contact.name, margin, y, { width: half });
    const detailX = margin + half + colGap;
    let dy = y;
    if (row.validUntil) {
      doc.font("Helvetica").fontSize(9).fillColor(COL.slate600);
      doc.text(`Valid until: ${fmtLongDate(row.validUntil)}`, detailX, dy, { width: half });
      dy += 14;
    }
    if (row.reference?.trim()) {
      doc.text(`Ref: ${row.reference.trim()}`, detailX, dy, { width: half });
      dy += 14;
    }

    if (row.contact.email) {
      doc.font("Helvetica").fontSize(9).fillColor(COL.slate600);
      doc.text(row.contact.email, margin, y + 16, { width: half });
    }

    y = Math.max(y + 36, dy + 8) + 8;
    doc.moveTo(margin, y).lineTo(contentRight, y).strokeColor(COL.slate200).stroke();
    y += 12;

    doc.font("Helvetica-Bold").fontSize(7).fillColor(COL.slate500);
    doc.text("DESCRIPTION", margin, y, { width: 200 });
    doc.text("ACCOUNT", margin + 205, y, { width: 110 });
    doc.text("QTY", margin + 318, y, { width: 36, align: "right" });
    doc.text("UNIT", margin + 358, y, { width: 52, align: "right" });
    doc.text("TAX", margin + 412, y, { width: 44, align: "right" });
    doc.text("AMOUNT", margin + 458, y, { width: contentRight - margin - 458, align: "right" });
    y += 12;
    doc.moveTo(margin, y).lineTo(contentRight, y).strokeColor(COL.slate100).stroke();
    y += 6;

    doc.font("Helvetica").fontSize(8).fillColor(COL.slate800);
    const pageBottom = doc.page.height - margin;
    for (const l of lines) {
      const desc = [l.narration || "—", l.unitLabel ? `(${l.unitLabel})` : ""].filter(Boolean).join(" ");
      const acc = l.chartOfAccount ? `${l.chartOfAccount.code}` : "—";
      const h = Math.max(
        doc.heightOfString(desc, { width: 198 }),
        doc.heightOfString(acc, { width: 108 }),
        14,
      );
      if (y + h > pageBottom - 100) {
        doc.addPage();
        y = margin;
      }
      doc.text(desc, margin, y, { width: 198 });
      doc.text(acc, margin + 205, y, { width: 108 });
      doc.text(String(dec(l.quantity)), margin + 318, y, { width: 36, align: "right" });
      doc.text(money(dec(l.unitAmount)), margin + 358, y, { width: 52, align: "right" });
      doc.text(money(dec(l.taxAmount)), margin + 412, y, { width: 44, align: "right" });
      doc.font("Helvetica-Bold");
      doc.text(money(lineTotal(l)), margin + 458, y, { width: contentRight - margin - 458, align: "right" });
      doc.font("Helvetica");
      y += h + 4;
    }

    y += 8;
    const totalsX = contentRight - 220;
    doc.moveTo(totalsX - 8, y).lineTo(contentRight, y).strokeColor(COL.slate200).stroke();
    y += 12;
    doc.font("Helvetica").fontSize(9).fillColor(COL.slate600);
    doc.text("Subtotal (ex. tax)", totalsX, y, { width: 120 });
    doc.text(`${money(sub)} ${row.currency}`, totalsX + 120, y, { width: 100, align: "right" });
    y += 16;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(COL.slate900);
    doc.text("Total", totalsX, y, { width: 120 });
    doc.text(`${money(total)} ${row.currency}`, totalsX + 120, y, { width: 100, align: "right" });
    y += 28;

    doc.font("Helvetica").fontSize(7).fillColor(COL.slate400);
    doc.text(
      "This quotation is subject to your acceptance and any terms agreed separately. We appreciate the opportunity to work with you.",
      margin,
      y,
      { width: contentW, align: "center" },
    );
  });
}

export async function loadSalesInvoiceForPdf(
  businessId: string,
  invoiceId: string,
): Promise<SalesInvoicePdfRow> {
  const row = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, businessId },
    include: invoiceForPdfInclude,
  });
  if (!row) {
    throw new HttpError(404, "Invoice not found.");
  }
  return row;
}

export async function loadSalesQuotationForPdf(
  businessId: string,
  quotationId: string,
): Promise<SalesQuotationPdfRow> {
  const row = await prisma.salesQuotation.findFirst({
    where: { id: quotationId, businessId },
    include: quotationForPdfInclude,
  });
  if (!row) {
    throw new HttpError(404, "Quotation not found.");
  }
  return row;
}

export async function loadSalesInvoiceForPdfById(invoiceId: string): Promise<SalesInvoicePdfRow | null> {
  const row = await prisma.salesInvoice.findUnique({
    where: { id: invoiceId },
    include: invoiceForPdfInclude,
  });
  return row;
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]/g, "_");
}

export async function renderSalesInvoicePdfDownload(
  businessId: string,
  invoiceId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const row = await loadSalesInvoiceForPdf(businessId, invoiceId);
  const buffer = await buildSalesInvoicePdfBuffer(row);
  return { buffer, filename: `invoice-${safeFilenamePart(row.publicCode)}.pdf` };
}

export async function renderSalesQuotationPdfDownload(
  businessId: string,
  quotationId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const row = await loadSalesQuotationForPdf(businessId, quotationId);
  const buffer = await buildSalesQuotationPdfBuffer(row);
  return { buffer, filename: `quotation-${safeFilenamePart(row.publicCode)}.pdf` };
}
