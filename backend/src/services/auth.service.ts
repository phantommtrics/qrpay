import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  BillingInterval,
  BusinessMembershipStatus,
  PlanCode,
  StaffCreationNotificationStatus,
  StaffCreationNotificationType,
  UserRole,
  User,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import {
  createSubscriptionForBusinessTx,
  getBusinessSubscription,
  userOwnsBusinessBlockingNewOrganization,
} from "./subscription.service.js";
import { queueSubscriptionInvoiceOwnerEmail } from "./subscription-invoice-email.service.js";
import {
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from "../utils/password.js";
import {
  buildStaffInviteEmailContent,
  sendStaffInviteEmail,
} from "./staff-invite.service.js";
import { guestSubscriptionInvoiceUrl } from "../lib/public-guest-urls.js";
import {
  buildSignUpTemporaryPasswordEmailContent,
  sendPasswordResetEmail,
  sendSignUpTemporaryPasswordEmailContent,
} from "./password-reset.service.js";
import { getMergedPlatformPermissionsForUser } from "./platform-security.service.js";
import { ensureDefaultChartOfAccountsForBusiness } from "./chart-of-accounts.service.js";
import { isCorporateIndustry } from "../utils/corporate-industry.js";
import { sendCorporateBusinessCreatedOperatorEmail } from "./corporate-signup-notify.service.js";
import { provisionDefaultWaveGatewayCredentialForBusiness } from "./business-gateway-credential.service.js";
import { isPetrolStationIndustry } from "./product.service.js";

type RegisterBusinessOwnerInput = {
  ownerName: string;
  ownerEmail: string;
  businessName: string;
  slug?: string;
  industry?: string;
  planCode: PlanCode;
  billingInterval?: BillingInterval;
  /** When set, create another business for this logged-in user (no password email). */
  authenticatedUserId?: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type ChangePasswordInput = {
  email: string;
  currentPassword: string;
  newPassword: string;
};

type ForgotPasswordInput = {
  email: string;
};

type CreateBusinessUserInput = {
  businessId: string;
  name: string;
  email: string;
  role: "ADMIN" | "CASHIER" | "MERCHANT";
  /** Petrol: branch for this staff member; omit or null = all stations. */
  assignedStationId?: string | null;
};

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function allocateUniqueBusinessSlug(
  tx: Prisma.TransactionClient,
  baseSlug: string,
): Promise<string> {
  const root = baseSlug.trim() || "business";
  let candidate = root;
  for (let attempt = 0; attempt < 24; attempt++) {
    const taken = await tx.business.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) {
      return candidate;
    }
    candidate = `${root}-${randomBytes(3).toString("hex")}`;
  }
  return `${root}-${randomBytes(8).toString("hex")}`;
}

async function rollbackNewOwnerRegistration(ids: {
  invoiceId: string;
  subscriptionId: string;
  userId: string;
  businessId: string;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.staffCreationNotificationLog.deleteMany({
      where: { businessId: ids.businessId },
    });
    await tx.subscriptionInvoice.delete({ where: { id: ids.invoiceId } });
    await tx.subscription.delete({ where: { id: ids.subscriptionId } });
    await tx.businessMembership.deleteMany({
      where: { userId: ids.userId, businessId: ids.businessId },
    });
    await tx.business.delete({ where: { id: ids.businessId } });
    await tx.user.delete({ where: { id: ids.userId } });
  });
}

function sanitizeUser(user: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

export type AccessibleBusinessEntry = {
  business: Awaited<ReturnType<typeof getBusinessSubscription>>["business"];
  currentSubscription: Awaited<ReturnType<typeof getBusinessSubscription>>["currentSubscription"];
  isOwner: boolean;
  membershipStatus: BusinessMembershipStatus;
  assignedStationId: string | null;
};

async function listAccessibleBusinesses(userId: string): Promise<{
  businesses: AccessibleBusinessEntry[];
  activeBusinessId: string | null;
}> {
  const memberships = await prisma.businessMembership.findMany({
    where: {
      userId,
      status: { not: "TERMINATED" },
    },
    orderBy: [{ isOwner: "desc" }, { createdAt: "desc" }],
  });

  const businesses: AccessibleBusinessEntry[] = await Promise.all(
    memberships.map(async (membership) => {
      const subscriptionContext = await getBusinessSubscription(membership.businessId);

      return {
        business: subscriptionContext.business,
        currentSubscription: subscriptionContext.currentSubscription,
        isOwner: membership.isOwner,
        membershipStatus: membership.isOwner ? "ACTIVE" : membership.status,
        assignedStationId: membership.assignedStationId ?? null,
      };
    }),
  );

  const usableFirst = businesses.find((b) => b.isOwner || b.membershipStatus === "ACTIVE");

  return {
    businesses,
    activeBusinessId: usableFirst?.business.id ?? businesses[0]?.business.id ?? null,
  };
}

export async function registerBusinessOwner(input: RegisterBusinessOwnerInput) {
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const businessName = input.businessName.trim();
  const requestedOwnerName = input.ownerName.trim();
  const rawIndustry = input.industry?.trim() || null;
  const industry =
    rawIndustry && rawIndustry.toLowerCase() === "corporate" ? "Corporate" : rawIndustry;

  /** Corporate orgs use the Business Pro plan row for billing/catalog; entitlements are filtered by industry (see entitlement.service). */
  const planCodeForSubscription =
    industry && isCorporateIndustry(industry) ? PlanCode.BUSINESS_PRO : input.planCode;

  if (
    input.planCode === PlanCode.CORPORATE &&
    !(industry && isCorporateIndustry(industry))
  ) {
    throw new HttpError(400, "The Corporate plan applies only to Corporate industry organizations.");
  }

  const temporaryPassword = input.authenticatedUserId
    ? null
    : generateTemporaryPassword();

  const existingUser = await prisma.user.findUnique({
    where: { email: ownerEmail },
  });

  if (input.authenticatedUserId) {
    const sessionUser = await prisma.user.findUnique({
      where: { id: input.authenticatedUserId },
    });
    if (!sessionUser || !sessionUser.isActive) {
      throw new HttpError(401, "Session is invalid. Please sign in again.");
    }
    if (sessionUser.email.toLowerCase() !== ownerEmail) {
      throw new HttpError(403, "Email must match your signed-in account.");
    }
    if (
      sessionUser.role !== UserRole.MERCHANT &&
      sessionUser.role !== UserRole.ADMIN
    ) {
      throw new HttpError(400, "Only merchant accounts can create businesses.");
    }
    if (!existingUser || existingUser.id !== sessionUser.id) {
      throw new HttpError(403, "Email must match your signed-in account.");
    }

    if (await userOwnsBusinessBlockingNewOrganization(input.authenticatedUserId)) {
      throw new HttpError(
        403,
        "Pay open subscription invoices or renew your expired or past-due business before creating another organization.",
      );
    }
  } else if (existingUser) {
    throw new HttpError(
      409,
      "An account with this email already exists. Sign in to add another business, or use Forgot password.",
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    let user: User;

    if (input.authenticatedUserId) {
      const session = await tx.user.findUnique({
        where: { id: input.authenticatedUserId },
      });
      if (!session || !session.isActive) {
        throw new HttpError(401, "Session is invalid. Please sign in again.");
      }
      if (session.email.toLowerCase() !== ownerEmail) {
        throw new HttpError(403, "Email must match your signed-in account.");
      }
      if (
        session.role !== UserRole.MERCHANT &&
        session.role !== UserRole.ADMIN
      ) {
        throw new HttpError(400, "Only merchant accounts can create businesses.");
      }
      user = session;
    } else {
      user = await tx.user.create({
        data: {
          name: requestedOwnerName,
          email: ownerEmail,
          passwordHash: hashPassword(temporaryPassword!),
          role: UserRole.MERCHANT,
          mustChangePassword: true,
        },
      });
    }

    if (user.role !== UserRole.MERCHANT && user.role !== UserRole.ADMIN) {
      throw new HttpError(
        400,
        "Only merchant or platform-owner accounts can own businesses.",
      );
    }

    const baseSlug = normalizeSlug(input.slug || businessName);
    const slug = await allocateUniqueBusinessSlug(tx, baseSlug);

    const business = await tx.business.create({
      data: {
        name: businessName,
        slug,
        industry,
        ownerName: user.name,
        ownerEmail,
      },
    });

    await ensureDefaultChartOfAccountsForBusiness(tx, business.id);

    await tx.businessMembership.create({
      data: {
        userId: user.id,
        businessId: business.id,
        isOwner: true,
      },
    });

    const { subscription, invoice } = await createSubscriptionForBusinessTx(tx, {
      businessId: business.id,
      planCode: planCodeForSubscription,
      billingInterval: input.billingInterval ?? BillingInterval.MONTHLY,
    });

    return {
      user: sanitizeUser(user),
      business,
      subscription,
      invoice,
    };
  });

  if (!input.authenticatedUserId && temporaryPassword) {
    const signupEmailInput = {
      userName: result.user.name,
      userEmail: result.user.email,
      temporaryPassword,
    };
    const inv = result.invoice;
    const isCorpSignup = Boolean(industry && isCorporateIndustry(industry));
    const emailContent = buildSignUpTemporaryPasswordEmailContent(signupEmailInput, {
      corporateWelcome: isCorpSignup,
      subscriptionPayOnlineUrl:
        isCorpSignup || Number(inv.amount) === 0
          ? null
          : inv.guestToken?.trim()
            ? guestSubscriptionInvoiceUrl(inv.guestToken.trim())
            : null,
      subscriptionInvoiceRef:
        isCorpSignup || Number(inv.amount) === 0 ? null : inv.externalReference?.trim() || inv.id,
    });

    const notificationLog = await prisma.staffCreationNotificationLog.create({
      data: {
        businessId: result.business.id,
        userId: result.user.id,
        recipientName: result.user.name,
        recipientEmail: result.user.email,
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
        result.user.email,
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
          failureReason:
            error instanceof Error ? error.message : "Unknown error",
        },
      });

      await rollbackNewOwnerRegistration({
        invoiceId: result.invoice.id,
        subscriptionId: result.subscription.id,
        userId: result.user.id,
        businessId: result.business.id,
      });
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(
        502,
        "We could not send your sign-up email. Please try again.",
      );
    }
  }

  if (!isCorporateIndustry(industry)) {
    queueSubscriptionInvoiceOwnerEmail(result.invoice.id);
  }

  if (industry && isCorporateIndustry(industry)) {
    void sendCorporateBusinessCreatedOperatorEmail({
      businessId: result.business.id,
      businessName: result.business.name,
      businessSlug: result.business.slug,
      ownerName: result.user.name,
      ownerEmail: result.user.email,
    }).catch((err) => console.error("[corporate-signup-notify]", err));
  }

  await provisionDefaultWaveGatewayCredentialForBusiness(result.business.id);

  const access = await listAccessibleBusinesses(result.user.id);

  return {
    ...result,
    accessibleBusinesses: access.businesses,
    activeBusinessId: result.business.id,
  };
}

export async function loginUser(input: LoginInput) {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw new HttpError(401, "Invalid email or password.");
  }

  if (!user.isActive) {
    throw new HttpError(403, "This account has been disabled.");
  }

  // Platform operators operate outside tenant context; do not attach memberships as "their" businesses.
  const access =
    user.role === UserRole.ADMIN ||
    user.role === UserRole.PLATFORM_OWNER ||
    user.role === UserRole.PLATFORM_ADMIN
      ? { businesses: [], activeBusinessId: null }
      : await listAccessibleBusinesses(user.id);

  if (
    user.role !== UserRole.PLATFORM_OWNER &&
    user.role !== UserRole.PLATFORM_ADMIN &&
    user.role !== UserRole.ADMIN &&
    access.businesses.length === 0
  ) {
    throw new HttpError(404, "User not found.");
  }

  const platformPermissions =
    user.role === UserRole.PLATFORM_ADMIN
      ? await getMergedPlatformPermissionsForUser(user.id)
      : undefined;

  return {
    user: sanitizeUser(user),
    accessibleBusinesses: access.businesses,
    activeBusinessId: access.activeBusinessId,
    platformPermissions,
  };
}

export async function changePassword(input: ChangePasswordInput) {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !verifyPassword(input.currentPassword, user.passwordHash)) {
    throw new HttpError(401, "Invalid email or password.");
  }

  if (!user.isActive) {
    throw new HttpError(403, "This account has been disabled.");
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(input.newPassword),
      mustChangePassword: false,
      passwordResetIssuedAt: null,
    },
  });

  return sanitizeUser(updatedUser);
}

export async function forgotPassword(input: ForgotPasswordInput) {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.isActive) {
    return {
      message:
        "If an account with that email exists, a temporary password has been sent.",
    };
  }

  const temporaryPassword = generateTemporaryPassword();
  const previousPasswordHash = user.passwordHash;
  const previousMustChangePassword = user.mustChangePassword;
  const previousPasswordResetIssuedAt = user.passwordResetIssuedAt;
  const resetIssuedAt = new Date();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(temporaryPassword),
      mustChangePassword: true,
      passwordResetIssuedAt: resetIssuedAt,
    },
  });

  try {
    await sendPasswordResetEmail({
      userName: user.name,
      userEmail: user.email,
      temporaryPassword,
    });
  } catch (error) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: previousPasswordHash,
        mustChangePassword: previousMustChangePassword,
        passwordResetIssuedAt: previousPasswordResetIssuedAt,
      },
    });

    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(
      502,
      "Temporary password email could not be sent. Please try again.",
    );
  }

  return {
    message:
      "If an account with that email exists, a temporary password has been sent.",
  };
}

async function resolveAssignedStationIdForStaffInvite(
  businessId: string,
  industry: string | null,
  assignedStationId: string | null | undefined,
): Promise<string | null> {
  const raw = assignedStationId?.trim();
  if (!raw) {
    return null;
  }
  if (!isPetrolStationIndustry(industry)) {
    throw new HttpError(400, "Branch assignment is only used for petrol station businesses.");
  }
  const st = await prisma.businessStation.findFirst({
    where: { id: raw, businessId, isActive: true },
  });
  if (!st) {
    throw new HttpError(400, "Invalid or inactive station for this business.");
  }
  return st.id;
}

export async function listBusinessUsers(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

  const memberships = await prisma.businessMembership.findMany({
    where: { businessId, user: { isActive: true } },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
    include: {
      user: true,
      assignedStation: { select: { id: true, name: true } },
    },
  });

  return memberships.map((membership) => ({
    ...sanitizeUser(membership.user),
    isOwner: membership.isOwner,
    membershipStatus: membership.status,
    assignedStationId: membership.assignedStationId ?? null,
    assignedStationName: membership.assignedStation?.name ?? null,
  }));
}

export async function createBusinessUser(input: CreateBusinessUserInput): Promise<{
  user: User;
  inviteType: "existing-user" | "new-user";
  assignedStationId: string | null;
  assignedStationName: string | null;
}> {
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
  });

  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

  const resolvedStationId = await resolveAssignedStationIdForStaffInvite(
    input.businessId,
    business.industry,
    input.assignedStationId,
  );

  // Check if user already exists
  let user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  const inviteType: 'existing-user' | 'new-user' = user ? 'existing-user' : 'new-user';

  if (user) {
    // Check if user is already a member of this business
    const existingMembership = await prisma.businessMembership.findFirst({
      where: {
        userId: user.id,
        businessId: input.businessId,
      },
    });

    if (existingMembership) {
      throw new HttpError(409, "This user already has access to the business.");
    }

    // Add user to business
    await prisma.businessMembership.create({
      data: {
        userId: user.id,
        businessId: input.businessId,
        isOwner: false,
        assignedStationId: resolvedStationId,
      },
    });

    // Build email content for existing user - only for non-ADMIN roles
    if (input.role !== 'ADMIN') {
      const existingUserInviteInput = {
        type: "existing-user" as const,
        staffName: user.name,
        staffEmail: user.email,
        staffRole: input.role as 'CASHIER' | 'MERCHANT',
        businessName: business.name,
        businessIndustry: business.industry,
        businessOwnerName: business.ownerName,
        businessOwnerEmail: business.ownerEmail,
      };
      const existingUserEmailContent = buildStaffInviteEmailContent(existingUserInviteInput);

      // Create notification log
      const existingUserNotificationLog = await prisma.staffCreationNotificationLog.create({
        data: {
          businessId: input.businessId,
          userId: user.id,
          recipientName: user.name,
          recipientEmail: user.email,
          staffRole: input.role as UserRole,
          notificationType: StaffCreationNotificationType.EXISTING_USER,
          deliveryStatus: StaffCreationNotificationStatus.PENDING,
          provider: "resend",
          subject: existingUserEmailContent.subject,
          htmlBody: existingUserEmailContent.htmlBody,
          textBody: existingUserEmailContent.textBody,
        },
      });

      // Send email
      try {
        const emailResult = await sendStaffInviteEmail(existingUserInviteInput);

        // Update notification log with sent status
        await prisma.staffCreationNotificationLog.update({
          where: { id: existingUserNotificationLog.id },
          data: {
            deliveryStatus: StaffCreationNotificationStatus.SENT,
            resendEmailId: emailResult.resendEmailId,
            sentAt: new Date(),
          },
        });
      } catch (error) {
        // Update notification log with failed status
        await prisma.staffCreationNotificationLog.update({
          where: { id: existingUserNotificationLog.id },
          data: {
            deliveryStatus: StaffCreationNotificationStatus.FAILED,
            failureReason: error instanceof Error ? error.message : 'Unknown error',
          },
        });

        // Continue - notification is logged but don't fail the entire operation
        console.error('Failed to send staff invite email:', error);
      }
    }

    const stationRow = resolvedStationId
      ? await prisma.businessStation.findFirst({
          where: { id: resolvedStationId, businessId: input.businessId },
          select: { name: true },
        })
      : null;
    return {
      user,
      inviteType,
      assignedStationId: resolvedStationId,
      assignedStationName: stationRow?.name ?? null,
    };
  }

  // User doesn't exist, so create a new one
  // Create new user
  const temporaryPassword = generateTemporaryPassword();
  const hashedPassword = hashPassword(temporaryPassword);

  user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: hashedPassword,
      role: input.role,
      mustChangePassword: true,
    },
  });

  // Add user to business
  await prisma.businessMembership.create({
    data: {
      userId: user.id,
      businessId: input.businessId,
      isOwner: false,
      assignedStationId: resolvedStationId,
    },
  });

  // Build email content - only for non-ADMIN roles
  if (input.role !== 'ADMIN') {
    const inviteInput = {
      type: "new-user" as const,
      temporaryPassword,
      staffName: user.name,
      staffEmail: user.email,
      staffRole: input.role as 'CASHIER' | 'MERCHANT',
      businessName: business.name,
      businessIndustry: business.industry,
      businessOwnerName: business.ownerName,
      businessOwnerEmail: business.ownerEmail,
    };
    const emailContent = buildStaffInviteEmailContent(inviteInput);

    // Create notification log
    const notificationLog = await prisma.staffCreationNotificationLog.create({
      data: {
        businessId: input.businessId,
        userId: user.id,
        recipientName: user.name,
        recipientEmail: user.email,
        staffRole: input.role as UserRole,
        notificationType: StaffCreationNotificationType.NEW_USER,
        deliveryStatus: StaffCreationNotificationStatus.PENDING,
        provider: "resend",
        subject: emailContent.subject,
        htmlBody: emailContent.htmlBody,
        textBody: emailContent.textBody,
      },
    });

    // Send email
    try {
      const emailResult = await sendStaffInviteEmail(inviteInput);

      // Update notification log with sent status
      await prisma.staffCreationNotificationLog.update({
        where: { id: notificationLog.id },
        data: {
          deliveryStatus: StaffCreationNotificationStatus.SENT,
          resendEmailId: emailResult.resendEmailId,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      // Update notification log with failed status
      await prisma.staffCreationNotificationLog.update({
        where: { id: notificationLog.id },
        data: {
          deliveryStatus: StaffCreationNotificationStatus.FAILED,
          failureReason: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      // Continue - notification is logged but don't fail the entire operation
      console.error('Failed to send staff invite email:', error);
    }
  }

  const stationRow = resolvedStationId
    ? await prisma.businessStation.findFirst({
        where: { id: resolvedStationId, businessId: input.businessId },
        select: { name: true },
      })
    : null;

  return {
    user,
    inviteType,
    assignedStationId: resolvedStationId,
    assignedStationName: stationRow?.name ?? null,
  };
}
