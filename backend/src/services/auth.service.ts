import {
  PlanCode,
  StaffCreationNotificationStatus,
  StaffCreationNotificationType,
  UserRole,
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
  role: "CASHIER" | "MERCHANT";
};

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
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

export async function createBusinessUser(input: CreateBusinessUserInput) {
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    include: {
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          plan: true,
        },
      },
      memberships: {
        where: { user: { isActive: true } },
      },
    },
  });

  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: input.email.trim().toLowerCase() },
  });

  const currentSubscription = business.subscriptions[0];

  if (!currentSubscription) {
    throw new HttpError(400, "Business does not have a subscription yet.");
  }

  if (business.memberships.length >= currentSubscription.plan.staffLimit) {
    throw new HttpError(
      400,
      `This plan allows up to ${currentSubscription.plan.staffLimit} active users.`,
    );
  }

  let user = existingUser;
  let createdNewUser = false;
  let temporaryPassword: string | null = null;

  if (user) {
    if (!user.isActive) {
      throw new HttpError(403, "This account has been disabled.");
    }

    if (user.role !== input.role) {
      throw new HttpError(
        400,
        `This account already exists as a ${user.role.toLowerCase()} user.`,
      );
    }

    const existingMembership = await prisma.businessMembership.findUnique({
      where: {
        userId_businessId: {
          userId: user.id,
          businessId: input.businessId,
        },
      },
    });

    if (existingMembership) {
      throw new HttpError(409, "This user already has access to the business.");
    }
  } else {
    temporaryPassword = generateTemporaryPassword();
    user = await prisma.user.create({
      data: {
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        passwordHash: hashPassword(temporaryPassword),
        role: input.role,
      },
    });
    createdNewUser = true;
  }

  const notificationType = createdNewUser
    ? StaffCreationNotificationType.NEW_USER
    : StaffCreationNotificationType.EXISTING_USER;
  const inviteInput = createdNewUser
    ? {
        type: "new-user" as const,
        temporaryPassword: temporaryPassword!,
        staffName: user.name,
        staffEmail: user.email,
        staffRole: input.role,
        businessName: business.name,
        businessIndustry: business.industry,
        businessOwnerName: business.ownerName,
        businessOwnerEmail: business.ownerEmail,
      }
    : {
        type: "existing-user" as const,
        staffName: user.name,
        staffEmail: user.email,
        staffRole: input.role,
        businessName: business.name,
        businessIndustry: business.industry,
        businessOwnerName: business.ownerName,
        businessOwnerEmail: business.ownerEmail,
      };
  const emailContent = buildStaffInviteEmailContent(inviteInput);

  try {
    await prisma.businessMembership.create({
      data: {
        userId: user.id,
        businessId: input.businessId,
        isOwner: false,
      },
    });

    const notificationLog = await prisma.staffCreationNotificationLog.create({
      data: {
        businessId: business.id,
        userId: user.id,
        recipientName: user.name,
        recipientEmail: user.email,
        staffRole: input.role,
        notificationType,
        deliveryStatus: StaffCreationNotificationStatus.PENDING,
        provider: "resend",
        subject: emailContent.subject,
        htmlBody: emailContent.htmlBody,
        textBody: emailContent.textBody,
      },
    });

    const emailResult = await sendStaffInviteEmail(inviteInput);

    try {
      await prisma.staffCreationNotificationLog.update({
        where: { id: notificationLog.id },
        data: {
          deliveryStatus: StaffCreationNotificationStatus.SENT,
          resendEmailId: emailResult.resendEmailId,
          subject: emailResult.subject,
          sentAt: new Date(),
          failureReason: null,
        },
      });
    } catch (logUpdateError) {
      console.error("Failed to mark staff notification as sent.", logUpdateError);
    }
  } catch (error) {
    try {
      await prisma.staffCreationNotificationLog.updateMany({
        where: {
          businessId: input.businessId,
          userId: user.id,
          notificationType,
          deliveryStatus: StaffCreationNotificationStatus.PENDING,
        },
        data: {
          deliveryStatus: StaffCreationNotificationStatus.FAILED,
          failureReason:
            error instanceof Error
              ? error.message
              : "Unable to send staff invite email.",
        },
      });
    } catch (logFailureError) {
      console.error(
        "Failed to mark staff notification as failed.",
        logFailureError,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.businessMembership.deleteMany({
        where: {
          userId: user.id,
          businessId: input.businessId,
          isOwner: false,
        },
      });

      if (createdNewUser) {
        const memberships = await tx.businessMembership.count({
          where: { userId: user.id },
        });

        if (memberships === 0) {
          await tx.user.delete({
            where: { id: user.id },
          });
        }
      }
    });

    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(
      502,
      "Staff account could not be created because the invite email failed to send.",
    );
  }

  return {
    user: sanitizeUser(user),
    inviteType: createdNewUser ? "new-user" : "existing-user",
  };
}
