import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";

export type MerchantProfilePayload = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    mustChangePassword: boolean;
    createdAt: string;
  };
  business: {
    id: string;
    name: string;
    slug: string;
    industry: string | null;
    ownerName: string;
    ownerEmail: string;
    logoUrl: string | null;
    createdAt: string;
  };
  membership: {
    isOwner: boolean;
    status: string;
  };
};

export async function getMerchantProfile(
  userId: string,
  businessId: string,
): Promise<MerchantProfilePayload> {
  const [user, business, membership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        mustChangePassword: true,
        createdAt: true,
      },
    }),
    prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        slug: true,
        industry: true,
        ownerName: true,
        ownerEmail: true,
        logoUrl: true,
        createdAt: true,
      },
    }),
    prisma.businessMembership.findFirst({
      where: { userId, businessId },
      select: { isOwner: true, status: true },
    }),
  ]);

  if (!user) throw new HttpError(404, "User not found.");
  if (!business) throw new HttpError(404, "Business not found.");
  if (!membership) throw new HttpError(403, "Access denied to this business.");

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt.toISOString(),
    },
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      industry: business.industry,
      ownerName: business.ownerName,
      ownerEmail: business.ownerEmail,
      logoUrl: business.logoUrl,
      createdAt: business.createdAt.toISOString(),
    },
    membership: {
      isOwner: membership.isOwner,
      status: membership.isOwner ? "ACTIVE" : membership.status,
    },
  };
}

export async function updateBusinessLogoUrl(
  businessId: string,
  logoUrl: string | null,
): Promise<{ logoUrl: string | null }> {
  const updated = await prisma.business.update({
    where: { id: businessId },
    data: { logoUrl },
    select: { logoUrl: true },
  });
  return { logoUrl: updated.logoUrl };
}
