import { Resend } from "resend";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import { easypayEmailLogoHtml } from "../lib/easypay-logo.js";

const PLATFORM_NAME = "DirectPay";

type PasswordResetEmailInput = {
  userName: string;
  userEmail: string;
  temporaryPassword: string;
};

export type SignUpTemporaryPasswordEmailContent = {
  subject: string;
  htmlBody: string;
  textBody: string;
};

/** Optional guest pay portal for the first subscription invoice (owner signup). */
export type SignUpEmailExtras = {
  subscriptionPayOnlineUrl?: string | null;
  subscriptionInvoiceRef?: string | null;
  /** Corporate industry: custom copy; no self-serve invoice link until DirectPay configures billing. */
  corporateWelcome?: boolean;
};

function escapeHtmlSignup(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getResendClient() {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    throw new HttpError(
      500,
      "Email delivery is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.",
    );
  }

  return new Resend(env.RESEND_API_KEY);
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput) {
  const resend = getResendClient();
  const subject = `${PLATFORM_NAME} temporary password`;
  const htmlBody = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:560px;">
    ${easypayEmailLogoHtml()}
    <p>Hello ${input.userName},</p>
    <p>We received a password reset request for your ${PLATFORM_NAME} account.</p>
    <p>Your temporary password is:</p>
    <p><strong>${input.temporaryPassword}</strong></p>
    <p>Visit <a href="${env.PLATFORM_URL}">${env.PLATFORM_URL}</a> to sign in. You will be asked to create a new password immediately.</p>
    <p>If you did not request this reset, please contact support as soon as possible.</p>
  </div>
  `;
  const textBody = [
    `Hello ${input.userName},`,
    "",
    `We received a password reset request for your ${PLATFORM_NAME} account.`,
    `Temporary password: ${input.temporaryPassword}`,
    `Login URL: ${env.PLATFORM_URL}`,
    "You will be asked to create a new password immediately after signing in.",
  ].join("\n");

  const result = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL!,
    to: input.userEmail,
    subject,
    html: htmlBody,
    text: textBody,
  });

  if (result.error) {
    throw new HttpError(
      result.error.statusCode ?? 502,
      result.error.message || "Unable to send password reset email.",
    );
  }

  if (!result.data?.id) {
    throw new HttpError(502, "Resend did not return an email ID.");
  }

  return {
    resendEmailId: result.data.id,
    subject,
  };
}

export function buildSignUpTemporaryPasswordEmailContent(
  input: PasswordResetEmailInput,
  extras?: SignUpEmailExtras | null,
): SignUpTemporaryPasswordEmailContent {
  if (extras?.corporateWelcome) {
    const subject = `Your ${PLATFORM_NAME} corporate workspace is ready`;
    const htmlBody = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:560px;">
    ${easypayEmailLogoHtml()}
    <p>Hello ${input.userName},</p>
    <p>Welcome to ${PLATFORM_NAME}. Your <strong>Corporate</strong> workspace is set up on our Business Pro product tier with <strong>custom corporate billing</strong> (POS, catalogue, and orders are not included unless we add them for you).</p>
    <p style="margin:16px 0;padding:14px 16px;background:#f0fdfa;border-radius:10px;border:1px solid #99f6e4;color:#0f172a;font-size:14px;">
      <strong>What happens next</strong><br />
      You will not receive a self-serve subscription invoice by email yet. ${PLATFORM_NAME} will contact you with a formal invoice once your corporate billing template and terms are assigned in the operator console.
    </p>
    <p>Your temporary password is:</p>
    <p><strong>${input.temporaryPassword}</strong></p>
    <p>Visit <a href="${env.PLATFORM_URL}">${env.PLATFORM_URL}</a> to sign in. You will be asked to create a new password after you log in.</p>
    <p>If you did not create this account, please contact support.</p>
  </div>
  `;
    const textBody = [
      `Hello ${input.userName},`,
      "",
      `Welcome to ${PLATFORM_NAME}. Your Corporate workspace is set up on our Business Pro product tier with custom corporate billing (POS, catalogue, and orders are not included unless we add them for you).`,
      "",
      "What happens next:",
      `You will not receive a self-serve subscription invoice by email yet. ${PLATFORM_NAME} will contact you with a formal invoice once your corporate billing template and terms are assigned.`,
      "",
      `Temporary password: ${input.temporaryPassword}`,
      `Sign in: ${env.PLATFORM_URL}`,
      "You will be prompted to choose a new password after signing in.",
    ].join("\n");
    return { subject, htmlBody, textBody };
  }

  const subject = `Your ${PLATFORM_NAME} account is ready`;
  const payUrl = extras?.subscriptionPayOnlineUrl?.trim() || null;
  const invRef = extras?.subscriptionInvoiceRef?.trim() || null;
  const payBlock =
    payUrl && invRef
      ? `<p style="margin:20px 0 8px;font-weight:600;color:#0f172a;">Pay your subscription online (no sign-in required)</p>
    <p style="margin:0 0 12px;font-size:14px;color:#475569;">Invoice <span style="font-family:monospace;">${escapeHtmlSignup(invRef)}</span> — use the secure link below with Wave or your mobile wallet, same as paying any ${PLATFORM_NAME} invoice by email.</p>
    <p style="margin:0 0 16px;">
      <a href="${escapeHtmlSignup(payUrl)}" style="display:inline-block;padding:12px 20px;background:#0d9488;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">View invoice &amp; pay online</a>
    </p>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b;">Or copy this link: <a href="${escapeHtmlSignup(payUrl)}" style="color:#0d9488;word-break:break-all;">${escapeHtmlSignup(payUrl)}</a></p>`
      : payUrl
        ? `<p style="margin:20px 0 8px;font-weight:600;color:#0f172a;">Pay your subscription online (no sign-in required)</p>
    <p style="margin:0 0 16px;">
      <a href="${escapeHtmlSignup(payUrl)}" style="display:inline-block;padding:12px 20px;background:#0d9488;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">View invoice &amp; pay online</a>
    </p>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b;">Or copy this link: <a href="${escapeHtmlSignup(payUrl)}" style="color:#0d9488;word-break:break-all;">${escapeHtmlSignup(payUrl)}</a></p>`
        : "";
  const htmlBody = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:560px;">
    ${easypayEmailLogoHtml()}
    <p>Hello ${input.userName},</p>
    <p>Welcome to ${PLATFORM_NAME}. Your organization has been created.</p>
    ${payBlock}
    <p>Your temporary password is:</p>
    <p><strong>${input.temporaryPassword}</strong></p>
    <p>Visit <a href="${env.PLATFORM_URL}">${env.PLATFORM_URL}</a> to sign in. You will be asked to create a new password after you log in.</p>
    <p>If you did not create this account, please contact support.</p>
  </div>
  `;
  const textBody = [
    `Hello ${input.userName},`,
    "",
    `Welcome to ${PLATFORM_NAME}. Your organization has been created.`,
    "",
    ...(payUrl
      ? [
          "Pay your subscription online (no sign-in required):",
          payUrl,
          ...(invRef ? [`Invoice ref: ${invRef}`, ""] : [""]),
        ]
      : []),
    `Temporary password: ${input.temporaryPassword}`,
    `Sign in: ${env.PLATFORM_URL}`,
    "You will be prompted to choose a new password after signing in.",
  ].join("\n");

  return { subject, htmlBody, textBody };
}

export async function sendSignUpTemporaryPasswordEmailContent(
  recipientEmail: string,
  content: SignUpTemporaryPasswordEmailContent,
) {
  const resend = getResendClient();

  const result = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL!,
    to: recipientEmail,
    subject: content.subject,
    html: content.htmlBody,
    text: content.textBody,
  });

  if (result.error) {
    throw new HttpError(
      result.error.statusCode ?? 502,
      result.error.message || "Unable to send sign-up email.",
    );
  }

  if (!result.data?.id) {
    throw new HttpError(502, "Resend did not return an email ID.");
  }

  return {
    resendEmailId: result.data.id,
    subject: content.subject,
  };
}

export async function sendSignUpTemporaryPasswordEmail(input: PasswordResetEmailInput) {
  const content = buildSignUpTemporaryPasswordEmailContent(input);
  return sendSignUpTemporaryPasswordEmailContent(input.userEmail, content);
}

export function buildPlatformAdminTemporaryPasswordEmailContent(
  input: PasswordResetEmailInput,
): SignUpTemporaryPasswordEmailContent {
  const subject = `Your ${PLATFORM_NAME} platform access is ready`;
  const htmlBody = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:560px;">
    ${easypayEmailLogoHtml()}
    <p>Hello ${input.userName},</p>
    <p>You have been granted platform administration access to ${PLATFORM_NAME}.</p>
    <p>Your temporary password is:</p>
    <p><strong>${input.temporaryPassword}</strong></p>
    <p>Visit <a href="${env.PLATFORM_URL}">${env.PLATFORM_URL}</a> to sign in. You will be asked to create a new password after you log in.</p>
    <p>If you were not expecting this, contact DirectPay support immediately.</p>
  </div>
  `;
  const textBody = [
    `Hello ${input.userName},`,
    "",
    `You have been granted platform administration access to ${PLATFORM_NAME}.`,
    `Temporary password: ${input.temporaryPassword}`,
    `Sign in: ${env.PLATFORM_URL}`,
    "You will be prompted to choose a new password after signing in.",
    "If you were not expecting this, contact DirectPay support immediately.",
  ].join("\n");

  return { subject, htmlBody, textBody };
}
