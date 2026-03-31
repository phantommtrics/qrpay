import { Resend } from "resend";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";

const PLATFORM_NAME = "EasyPay";

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
    <p>Hello ${input.userName},</p>
    <p>We received a password reset request for your ${PLATFORM_NAME} account.</p>
    <p>Your temporary password is:</p>
    <p><strong>${input.temporaryPassword}</strong></p>
    <p>Visit <a href="${env.PLATFORM_URL}">${env.PLATFORM_URL}</a> to sign in. You will be asked to create a new password immediately.</p>
    <p>If you did not request this reset, please contact support as soon as possible.</p>
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
): SignUpTemporaryPasswordEmailContent {
  const subject = `Your ${PLATFORM_NAME} account is ready`;
  const htmlBody = `
    <p>Hello ${input.userName},</p>
    <p>Welcome to ${PLATFORM_NAME}. Your organization has been created.</p>
    <p>Your temporary password is:</p>
    <p><strong>${input.temporaryPassword}</strong></p>
    <p>Visit <a href="${env.PLATFORM_URL}">${env.PLATFORM_URL}</a> to sign in. You will be asked to create a new password after you log in.</p>
    <p>If you did not create this account, please contact support.</p>
  `;
  const textBody = [
    `Hello ${input.userName},`,
    "",
    `Welcome to ${PLATFORM_NAME}. Your organization has been created.`,
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
    <p>Hello ${input.userName},</p>
    <p>You have been granted platform administration access to ${PLATFORM_NAME}.</p>
    <p>Your temporary password is:</p>
    <p><strong>${input.temporaryPassword}</strong></p>
    <p>Visit <a href="${env.PLATFORM_URL}">${env.PLATFORM_URL}</a> to sign in. You will be asked to create a new password after you log in.</p>
    <p>If you were not expecting this, contact the platform owner immediately.</p>
  `;
  const textBody = [
    `Hello ${input.userName},`,
    "",
    `You have been granted platform administration access to ${PLATFORM_NAME}.`,
    `Temporary password: ${input.temporaryPassword}`,
    `Sign in: ${env.PLATFORM_URL}`,
    "You will be prompted to choose a new password after signing in.",
  ].join("\n");

  return { subject, htmlBody, textBody };
}
