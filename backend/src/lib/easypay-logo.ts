import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type PDFDocument from "pdfkit";
import { env } from "../config/env.js";

type PdfDoc = InstanceType<typeof PDFDocument>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedLogo: Buffer | null = null;

export function resolveEasypayLogoFilePath(): string {
  const candidates = [
    path.join(__dirname, "../../assets/easypay_logo_file.png"),
    path.join(__dirname, "../../../webFrontend/public/easypay_logo_file.png"),
    path.join(process.cwd(), "assets/easypay_logo_file.png"),
    path.join(process.cwd(), "webFrontend/public/easypay_logo_file.png"),
    path.join(process.cwd(), "../webFrontend/public/easypay_logo_file.png"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return p;
    }
  }
  throw new Error(
    "Product logo not found. Add backend/assets/easypay_logo_file.png or webFrontend/public/easypay_logo_file.png.",
  );
}

export function getEasypayLogoBuffer(): Buffer {
  if (!cachedLogo) {
    cachedLogo = readFileSync(resolveEasypayLogoFilePath());
  }
  return cachedLogo;
}

/** Absolute URL for HTML emails (hosted from the web app public folder). */
export function easypayLogoUrlForEmail(): string {
  if (env.EASYPAY_LOGO_URL?.trim()) {
    return env.EASYPAY_LOGO_URL.trim();
  }
  const origin = env.PLATFORM_URL.split("#")[0].trim().replace(/\/+$/, "");
  return `${origin}/easypay_logo_file.png`;
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Top-of-email logo block; URL is attribute-escaped. */
export function easypayEmailLogoHtml(): string {
  const src = escapeHtmlAttr(easypayLogoUrlForEmail());
  return `<div style="margin:0 0 20px;padding-bottom:16px;border-bottom:1px solid #e2e8f0;">
  <img src="${src}" alt="DPay" width="220" style="max-width:min(92%,240px);height:auto;display:block;border:0;outline:none;text-decoration:none;" />
</div>`;
}

const PDF_LOGO_MAX_W = 190;
const PDF_LOGO_MAX_H = 52;

/**
 * Draws the product logo at the top-left. Returns the Y coordinate to continue below the logo
 * (or startY if the file is missing).
 */
export function drawEasypayLogoPdfHeader(doc: PdfDoc, margin: number, startY: number): number {
  try {
    const buf = getEasypayLogoBuffer();
    doc.image(buf, margin, startY, {
      fit: [PDF_LOGO_MAX_W, PDF_LOGO_MAX_H],
    });
    return startY + PDF_LOGO_MAX_H + 12;
  } catch (err) {
    console.warn("[easypay-logo] PDF header skipped:", err);
    return startY;
  }
}
