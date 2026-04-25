import { Resend } from "resend";

import { env } from "../config/env.js";
import { easypayEmailLogoHtml } from "../lib/easypay-logo.js";

const PLATFORM_NAME = "DirectPay";

function parseRecipientList(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && s.includes("@"));
}

/**
 * Internal-only: notify operators that a new corporate business needs a billing template.
 * Never throws; logs on failure. Skips if env recipients are unset or Resend is not configured.
 */
export async function sendCorporateBusinessCreatedOperatorEmail(input: {
  businessId: string;
  businessName: string;
  businessSlug: string;
  ownerName: string;
  ownerEmail: string;
}): Promise<void> {
  const to = parseRecipientList(env.CORPORATE_SIGNUP_NOTIFY_EMAIL);
  if (to.length === 0) {
    return;
  }
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.warn(
      "[corporate-signup-notify] CORPORATE_SIGNUP_NOTIFY_EMAIL is set but RESEND_API_KEY / RESEND_FROM_EMAIL are missing; skipping operator email.",
    );
    return;
  }

  const platformBase = env.PLATFORM_URL.replace(/\/$/, "");
  const assignPath = "/#/platform/corporate/businesses";
  const assignUrl = `${platformBase}${assignPath}`;

  const subject = `${PLATFORM_NAME} — New corporate business: ${input.businessName}`;
  const htmlBody = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:560px;">
    ${easypayEmailLogoHtml()}
    <p><strong>New Corporate organization</strong> — assign a billing template in the operator console.</p>
    <table cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;">
      <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Business</td><td style="padding:6px 0;"><strong>${escapeHtml(input.businessName)}</strong></td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Slug</td><td style="padding:6px 0;font-family:monospace;">${escapeHtml(input.businessSlug)}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Business ID</td><td style="padding:6px 0;font-family:monospace;font-size:12px;">${escapeHtml(input.businessId)}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Owner</td><td style="padding:6px 0;">${escapeHtml(input.ownerName)}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Owner email</td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(input.ownerEmail)}">${escapeHtml(input.ownerEmail)}</a></td></tr>
    </table>
    <p style="margin:16px 0;">
      <a href="${escapeHtml(assignUrl)}" style="display:inline-block;padding:12px 20px;background:#0d9488;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Open Corporate → Businesses</a>
    </p>
    <p style="font-size:13px;color:#64748b;">Or copy: <a href="${escapeHtml(assignUrl)}" style="color:#0d9488;word-break:break-all;">${escapeHtml(assignUrl)}</a></p>
  </div>
  `;
  const textBody = [
    `${PLATFORM_NAME} — New corporate business (assign billing template).`,
    "",
    `Business: ${input.businessName}`,
    `Slug: ${input.businessSlug}`,
    `Business ID: ${input.businessId}`,
    `Owner: ${input.ownerName}`,
    `Owner email: ${input.ownerEmail}`,
    "",
    `Assign template: ${assignUrl}`,
  ].join("\n");

  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to,
    subject,
    html: htmlBody,
    text: textBody,
  });

  if (result.error) {
    console.error(
      "[corporate-signup-notify] Resend error:",
      result.error.message ?? result.error,
    );
    return;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
