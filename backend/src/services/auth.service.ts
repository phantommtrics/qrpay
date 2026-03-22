import { PlanCode, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import {
  createSubscriptionForBusinessTx,
  getBusinessSubscription,
} from "./subscription.service.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

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

type CreateBusinessUserInput = {
  businessId: string;
  name: string;
  email: string;
  password: string;
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
  createdAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
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

    if (!verifyPassword(input.password, user.passwordHash)) {
      throw new HttpError(
        401,
        "Existing account password is incorrect for this email.",
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
    user = await prisma.user.create({
      data: {
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        passwordHash: hashPassword(input.password),
        role: input.role,
      },
    });
  }

  await prisma.businessMembership.create({
    data: {
      userId: user.id,
      businessId: input.businessId,
      isOwner: false,
    },
  });

  return sanitizeUser(user);
}
