import { Resend } from "resend";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import { easypayEmailLogoHtml } from "../lib/easypay-logo.js";

type StaffInviteContext = {
  staffName: string;
  staffEmail: string;
  staffRole: "CASHIER" | "MERCHANT";
  businessName: string;
  businessIndustry: string | null;
  businessOwnerName: string;
  businessOwnerEmail: string;
};

type ExistingStaffInviteInput = StaffInviteContext & {
  type: "existing-user";
};

type NewStaffInviteInput = StaffInviteContext & {
  type: "new-user";
  temporaryPassword: string;
};

const PLATFORM_NAME = "EasyPay";

type StaffInviteEmailContent = {
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

function formatRole(role: "CASHIER" | "MERCHANT") {
  return role === "MERCHANT" ? "Manager" : "Cashier";
}

function formatBusinessDetails(input: StaffInviteContext) {
  const industryLine = input.businessIndustry
    ? `<li><strong>Industry:</strong> ${input.businessIndustry}</li>`
    : "";

  return `
    <ul>
      <li><strong>Business:</strong> ${input.businessName}</li>
      ${industryLine}
      <li><strong>Role:</strong> ${formatRole(input.staffRole)}</li>
      <li><strong>Added by:</strong> ${input.businessOwnerName} (${input.businessOwnerEmail})</li>
    </ul>
  `;
}

export async function sendStaffInviteEmail(
  input: ExistingStaffInviteInput | NewStaffInviteInput,
) {
  const resend = getResendClient();
  const content = buildStaffInviteEmailContent(input);

  const result = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL!,
    to: input.staffEmail,
    subject: content.subject,
    html: content.htmlBody,
    text: content.textBody,
  });

  if (result.error) {
    throw new HttpError(
      result.error.statusCode ?? 502,
      result.error.message || "Unable to send staff invite email.",
    );
  }

  if (!result.data?.id) {
    throw new HttpError(502, "Resend did not return an email ID.");
  }

  return {
    resendEmailId: result.data.id,
    ...content,
  };
}

export function buildStaffInviteEmailContent(
  input: ExistingStaffInviteInput | NewStaffInviteInput,
): StaffInviteEmailContent {
  const businessDetails = formatBusinessDetails(input);

  const subject =
    input.type === "existing-user"
      ? `You've been added to ${input.businessName} on ${PLATFORM_NAME}`
      : `Your ${PLATFORM_NAME} staff account is ready`;

  const loginBlock =
    input.type === "new-user"
      ? `
        <p>Your temporary password is:</p>
        <p><strong>${input.temporaryPassword}</strong></p>
        <p>Visit <a href="${env.PLATFORM_URL}">${env.PLATFORM_URL}</a> to sign in and change your password.</p>
      `
      : `
        <p>Use your existing ${PLATFORM_NAME} account to sign in at <a href="${env.PLATFORM_URL}">${env.PLATFORM_URL}</a>.</p>
      `;

  const intro =
    input.type === "existing-user"
      ? `<p>Hello ${input.staffName},</p><p>${input.businessOwnerName} has added you as staff for a business on ${PLATFORM_NAME}.</p>`
      : `<p>Hello ${input.staffName},</p><p>${input.businessOwnerName} created a new staff account for you on ${PLATFORM_NAME}.</p>`;

  return {
    subject,
    htmlBody: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:560px;">
        ${easypayEmailLogoHtml()}
        ${intro}
        <p>Here are your business details:</p>
        ${businessDetails}
        ${loginBlock}
        <p>If you were not expecting this invitation, please contact ${input.businessOwnerEmail}.</p>
      </div>
    `,
    textBody:
      input.type === "existing-user"
        ? [
            `Hello ${input.staffName},`,
            "",
            `${input.businessOwnerName} has added you as ${formatRole(input.staffRole)} staff for ${input.businessName} on ${PLATFORM_NAME}.`,
            input.businessIndustry ? `Industry: ${input.businessIndustry}` : null,
            `Added by: ${input.businessOwnerName} (${input.businessOwnerEmail})`,
            `Sign in here: ${env.PLATFORM_URL}`,
          ]
            .filter(Boolean)
            .join("\n")
        : [
            `Hello ${input.staffName},`,
            "",
            `${input.businessOwnerName} created a new ${PLATFORM_NAME} staff account for you for ${input.businessName}.`,
            input.businessIndustry ? `Industry: ${input.businessIndustry}` : null,
            `Role: ${formatRole(input.staffRole)}`,
            `Temporary password: ${input.temporaryPassword}`,
            `Login URL: ${env.PLATFORM_URL}`,
            `Added by: ${input.businessOwnerName} (${input.businessOwnerEmail})`,
          ]
            .filter(Boolean)
            .join("\n"),
  };
}
