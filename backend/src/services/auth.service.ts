import {
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
} from "./subscription.service.js";
import {
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from "../utils/password.js";
import {
  buildStaffInviteEmailContent,
  sendStaffInviteEmail,
} from "./staff-invite.service.js";
import { sendPasswordResetEmail } from "./password-reset.service.js";

type RegisterBusinessOwnerInput = {
  ownerName: string;
  ownerEmail: string;
  password: string;
  businessName: string;
  slug?: string;
  industry?: string;
  planCode: PlanCode;
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
};

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

async function listAccessibleBusinesses(userId: string) {
  const memberships = await prisma.businessMembership.findMany({
    where: { userId },
    orderBy: [{ isOwner: "desc" }, { createdAt: "desc" }],
  });

  const businesses = await Promise.all(
    memberships.map(async (membership) => {
      const subscriptionContext = await getBusinessSubscription(membership.businessId);

      return {
        business: subscriptionContext.business,
        currentSubscription: subscriptionContext.currentSubscription,
        isOwner: membership.isOwner,
      };
    }),
  );

  return {
    businesses,
    activeBusinessId: businesses[0]?.business.id ?? null,
  };
}

export async function registerBusinessOwner(input: RegisterBusinessOwnerInput) {
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const businessName = input.businessName.trim();
  const slug = normalizeSlug(input.slug || businessName);
  const requestedOwnerName = input.ownerName.trim();
  const industry = input.industry?.trim() || null;

  const existingUser = await prisma.user.findUnique({
    where: { email: ownerEmail },
  });

  if (
    existingUser &&
    (!existingUser.isActive ||
      !verifyPassword(input.password, existingUser.passwordHash))
  ) {
    throw new HttpError(401, "Existing account credentials are invalid.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          name: requestedOwnerName,
          email: ownerEmail,
          passwordHash: hashPassword(input.password),
          role: UserRole.MERCHANT,
          mustChangePassword: false,
        },
      }));

    if (user.role !== UserRole.MERCHANT && user.role !== UserRole.ADMIN) {
      throw new HttpError(
        400,
        "Only merchant or platform-owner accounts can own businesses.",
      );
    }

    const business = await tx.business.create({
      data: {
        name: businessName,
        slug,
        industry,
        ownerName: user.name,
        ownerEmail,
      },
    });

    await tx.businessMembership.create({
      data: {
        userId: user.id,
        businessId: business.id,
        isOwner: true,
      },
    });

    const businessAdminRole = await tx.role.findFirst({
      where: { name: "Business Admin" },
    });

    if (businessAdminRole) {
      await tx.userRoleAssignment.create({
        data: {
          userId: user.id,
          roleId: businessAdminRole.id,
          scope: business.id,
          assignedBy: user.id,
        },
      });
    }

    const { subscription, invoice } = await createSubscriptionForBusinessTx(tx, {
      businessId: business.id,
      planCode: input.planCode,
    });

    return {
      user: sanitizeUser(user),
      business,
      subscription,
      invoice,
    };
  });

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

  const access = user.role === UserRole.ADMIN
    ? { businesses: [], activeBusinessId: null }
    : await listAccessibleBusinesses(user.id);

  return {
    user: sanitizeUser(user),
    accessibleBusinesses: access.businesses,
    activeBusinessId: access.activeBusinessId,
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
    },
  });

  return memberships.map((membership) => sanitizeUser(membership.user));
}

export async function createBusinessUser(input: CreateBusinessUserInput): Promise<{ user: User; inviteType: 'existing-user' | 'new-user' }> {
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
  });

  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

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

    return { user, inviteType };
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

  return { user, inviteType };
}
