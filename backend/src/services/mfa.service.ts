import { UserRole } from "@prisma/client";
import jwt, { type SignOptions } from "jsonwebtoken";

import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { verifyPassword } from "../utils/password.js";
import {
  buildTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  isTotpEnrolled,
  totpQrDataUrl,
  verifyTotpCode,
} from "../utils/totp.js";

export type MfaPreAuthPayload = {
  id: string;
  email: string;
  preAuth: true;
};

export function roleRequiresMfa(role: UserRole): boolean {
  return role === UserRole.PLATFORM_OWNER || role === UserRole.PLATFORM_ADMIN;
}

export function signMfaPreAuthToken(user: { id: string; email: string }): string {
  const payload: MfaPreAuthPayload = {
    id: user.id,
    email: user.email,
    preAuth: true,
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.MFA_PRE_AUTH_EXPIRES_IN,
  } as SignOptions);
}

export function verifyMfaPreAuthToken(token: string): MfaPreAuthPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as MfaPreAuthPayload;
  if (!decoded?.preAuth || !decoded.id) {
    throw new HttpError(401, "Invalid or expired verification session.");
  }
  return decoded;
}

function totpCodeOk(code: string): boolean {
  return /^\d{6}$/.test(code);
}

async function loadUserForMfa(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new HttpError(401, "Invalid or expired verification session.");
  }
  return user;
}

export { isTotpEnrolled };

export async function beginMfaSetupForUser(userId: string, email: string) {
  const user = await loadUserForMfa(userId);
  if (isTotpEnrolled(user)) {
    throw new HttpError(400, "Authenticator is already enrolled.");
  }

  const secret = generateTotpSecret();
  const uri = buildTotpUri(email, secret);
  const qrDataUrl = await totpQrDataUrl(uri);

  return {
    secret,
    qrDataUrl,
    manualEntryKey: secret,
    issuer: env.TOTP_ISSUER,
  };
}

export async function confirmMfaEnrollment(input: {
  userId: string;
  secret: string;
  code: string;
}) {
  if (!totpCodeOk(input.code)) {
    throw new HttpError(400, "Code must be 6 digits.");
  }
  if (!input.secret || input.secret.length < 16) {
    throw new HttpError(400, "Invalid authenticator setup.");
  }

  const user = await loadUserForMfa(input.userId);
  if (isTotpEnrolled(user)) {
    throw new HttpError(400, "Authenticator is already enrolled.");
  }

  if (!verifyTotpCode(input.secret, input.code)) {
    throw new HttpError(400, "Invalid authenticator code. Try again.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpSecret: encryptTotpSecret(input.secret),
      totpEnabledAt: new Date(),
    },
  });

  return user.id;
}

export async function verifyMfaLoginCode(input: { userId: string; code: string }) {
  if (!totpCodeOk(input.code)) {
    throw new HttpError(400, "Code must be 6 digits.");
  }

  const user = await loadUserForMfa(input.userId);
  if (!isTotpEnrolled(user) || !user.totpSecret) {
    throw new HttpError(400, "Authenticator not enrolled. Complete setup first.");
  }

  const secret = decryptTotpSecret(user.totpSecret);
  if (!verifyTotpCode(secret, input.code)) {
    throw new HttpError(400, "Invalid authenticator code. Try again.");
  }

  return user.id;
}

export async function disableMfaForSelf(input: {
  userId: string;
  password?: string;
  code?: string;
}) {
  const user = await loadUserForMfa(input.userId);
  if (!isTotpEnrolled(user)) {
    throw new HttpError(400, "Authenticator is not enabled.");
  }

  if (roleRequiresMfa(user.role)) {
    throw new HttpError(
      400,
      "Platform operators cannot disable authenticator. Ask another admin to reset it.",
    );
  }

  const passwordOk =
    Boolean(input.password) && verifyPassword(input.password!, user.passwordHash);
  const codeOk =
    Boolean(input.code) &&
    totpCodeOk(input.code!) &&
    user.totpSecret != null &&
    verifyTotpCode(decryptTotpSecret(user.totpSecret), input.code!);

  if (!passwordOk && !codeOk) {
    throw new HttpError(401, "Enter your password or a valid authenticator code.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: null, totpEnabledAt: null },
  });

  return { totpEnrolled: false };
}

export async function resetUserMfaByAdmin(input: {
  actorUserId: string;
  targetUserId: string;
}) {
  const actor = await loadUserForMfa(input.actorUserId);
  if (actor.role !== UserRole.PLATFORM_OWNER && actor.role !== UserRole.PLATFORM_ADMIN) {
    throw new HttpError(403, "Platform access required.");
  }

  const target = await prisma.user.findUnique({ where: { id: input.targetUserId } });
  if (!target) {
    throw new HttpError(404, "User not found.");
  }

  if (target.role !== UserRole.PLATFORM_OWNER && target.role !== UserRole.PLATFORM_ADMIN) {
    throw new HttpError(400, "Use the business staff tools to reset merchant authenticator.");
  }

  if (target.id === actor.id) {
    throw new HttpError(
      400,
      "You cannot reset your own authenticator. Ask another platform admin to reset it.",
    );
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { totpSecret: null, totpEnabledAt: null },
  });

  return {
    id: target.id,
    email: target.email,
    totpEnrolled: false,
  };
}

/**
 * Business owner (or platform operator) clears MFA for a member of this business.
 * Used when a staff user loses their authenticator app.
 */
export async function resetBusinessMemberMfa(input: {
  actorUserId: string;
  businessId: string;
  targetUserId: string;
}) {
  const actor = await loadUserForMfa(input.actorUserId);
  const isPlatformOperator =
    actor.role === UserRole.PLATFORM_OWNER || actor.role === UserRole.PLATFORM_ADMIN;

  if (!isPlatformOperator) {
    const actorMembership = await prisma.businessMembership.findFirst({
      where: {
        userId: actor.id,
        businessId: input.businessId,
        isOwner: true,
      },
    });
    if (!actorMembership) {
      throw new HttpError(403, "Only the business owner can reset member authenticator.");
    }
  }

  const targetMembership = await prisma.businessMembership.findFirst({
    where: {
      userId: input.targetUserId,
      businessId: input.businessId,
    },
    include: { user: true },
  });
  if (!targetMembership) {
    throw new HttpError(404, "Member not found in this business.");
  }

  if (roleRequiresMfa(targetMembership.user.role)) {
    throw new HttpError(400, "Platform operator authenticator is managed under System users.");
  }

  if (targetMembership.userId === actor.id && !isPlatformOperator) {
    throw new HttpError(
      400,
      "You cannot reset your own authenticator here. Use Profile to disable it, or ask DirectPay support if you are locked out.",
    );
  }

  if (!isTotpEnrolled(targetMembership.user)) {
    throw new HttpError(400, "Authenticator is not enabled for this member.");
  }

  await prisma.user.update({
    where: { id: targetMembership.userId },
    data: { totpSecret: null, totpEnabledAt: null },
  });

  return {
    id: targetMembership.userId,
    email: targetMembership.user.email,
    totpEnrolled: false,
  };
}

export async function getMfaStatus(userId: string) {
  const user = await loadUserForMfa(userId);
  return {
    totpEnrolled: isTotpEnrolled(user),
    totpRequired: roleRequiresMfa(user.role),
  };
}
