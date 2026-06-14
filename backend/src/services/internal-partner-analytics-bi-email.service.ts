import {
  StaffCreationNotificationStatus,
  StaffCreationNotificationType,
  UserRole,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { guestSubscriptionInvoiceUrl } from "../lib/public-guest-urls.js";
import { isCorporateIndustry } from "../utils/corporate-industry.js";
import { generateTemporaryPassword, hashPassword } from "../utils/password.js";
import {
  buildSignUpTemporaryPasswordEmailContent,
  sendSignUpTemporaryPasswordEmailContent,
} from "./password-reset.service.js";
import { sendCorporateBusinessCreatedOperatorEmail } from "./corporate-signup-notify.service.js";

/**
 * Owner welcome + pay link (when applicable), same pattern as self-serve signup when a
 * Corporate subscription is started for an analytics-bi partner business.
 */
export async function sendAnalyticsBiPartnerCorporateSubscriptionOwnerEmail(input: {
  businessId: string;
  invoiceId: string;
}): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: {
      id: true,
      name: true,
      slug: true,
      industry: true,
      ownerName: true,
      ownerEmail: true,
      platformBillingWaived: true,
      memberships: {
        where: { isOwner: true },
        take: 1,
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  if (!business || business.platformBillingWaived) {
    return;
  }

  const ownerUser = business.memberships[0]?.user;
  if (!ownerUser) {
    return;
  }

  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { id: input.invoiceId },
    select: {
      id: true,
      amount: true,
      externalReference: true,
      guestToken: true,
    },
  });
  if (!invoice) {
    return;
  }

  const temporaryPassword = generateTemporaryPassword();
  await prisma.user.update({
    where: { id: ownerUser.id },
    data: {
      passwordHash: hashPassword(temporaryPassword),
      mustChangePassword: true,
    },
  });

  const isCorpIndustry = isCorporateIndustry(business.industry);
  const guestToken = invoice.guestToken?.trim() || null;
  const emailContent = buildSignUpTemporaryPasswordEmailContent(
    {
      userName: ownerUser.name,
      userEmail: ownerUser.email,
      temporaryPassword,
    },
    {
      corporateWelcome: isCorpIndustry,
      subscriptionPayOnlineUrl:
        isCorpIndustry || Number(invoice.amount) === 0
          ? null
          : guestToken
            ? guestSubscriptionInvoiceUrl(guestToken)
            : null,
      subscriptionInvoiceRef:
        isCorpIndustry || Number(invoice.amount) === 0
          ? null
          : invoice.externalReference?.trim() || invoice.id,
    },
  );

  const notificationLog = await prisma.staffCreationNotificationLog.create({
    data: {
      businessId: business.id,
      userId: ownerUser.id,
      recipientName: ownerUser.name,
      recipientEmail: ownerUser.email,
      staffRole: UserRole.MERCHANT,
      notificationType: StaffCreationNotificationType.OWNER_SIGNUP,
      deliveryStatus: StaffCreationNotificationStatus.PENDING,
      provider: "resend",
      subject: emailContent.subject,
      htmlBody: emailContent.htmlBody,
      textBody: emailContent.textBody,
    },
  });

  try {
    const emailResult = await sendSignUpTemporaryPasswordEmailContent(
      ownerUser.email,
      emailContent,
    );

    await prisma.staffCreationNotificationLog.update({
      where: { id: notificationLog.id },
      data: {
        deliveryStatus: StaffCreationNotificationStatus.SENT,
        resendEmailId: emailResult.resendEmailId,
        sentAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.staffCreationNotificationLog.update({
      where: { id: notificationLog.id },
      data: {
        deliveryStatus: StaffCreationNotificationStatus.FAILED,
        failureReason: error instanceof Error ? error.message : "Unknown error",
      },
    });
    throw error;
  }
}

/** Fire-and-forget: owner signup email + operator notify for analytics-bi Corporate start. */
export function queueAnalyticsBiPartnerCorporateSubscriptionEmails(input: {
  businessId: string;
  invoiceId: string;
}): void {
  void sendAnalyticsBiPartnerCorporateSubscriptionOwnerEmail(input).catch((err) => {
    console.error("[analytics-bi-partner-email] owner signup", input.businessId, err);
  });

  void prisma.business
    .findUnique({
      where: { id: input.businessId },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerName: true,
        ownerEmail: true,
      },
    })
    .then((business) => {
      if (!business) {
        return;
      }
      return sendCorporateBusinessCreatedOperatorEmail({
        businessId: business.id,
        businessName: business.name,
        businessSlug: business.slug,
        ownerName: business.ownerName,
        ownerEmail: business.ownerEmail,
      });
    })
    .catch((err) => {
      console.error("[analytics-bi-partner-email] operator notify", input.businessId, err);
    });
}
