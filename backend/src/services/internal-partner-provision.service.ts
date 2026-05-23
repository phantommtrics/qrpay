import { PlanCode, UserRole, type Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { generateTemporaryPassword, hashPassword } from "../utils/password.js";
import { ensureDefaultChartOfAccountsForBusiness } from "./chart-of-accounts.service.js";
import { ensureInternalPartnerCheckoutProduct } from "./sale.service.js";
import { WaveAggregatedMerchantProvisionTrigger } from "@prisma/client";

import { provisionDefaultWaveGatewayCredentialForBusiness } from "./business-gateway-credential.service.js";
import { createInternalPartnerForeverBasicSubscriptionForBusinessTx } from "./subscription.service.js";

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
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

export type ProvisionInternalPartnerBusinessInput = {
  externalUserId: string;
  ownerEmail: string;
  ownerName: string;
  businessName: string;
  slug?: string;
  industry?: string;
  /** Optional per-business webhook URL (otherwise comma-separated INTERNAL_PARTNER_WEBHOOK_URL defaults). */
  webhookUrl?: string | null;
};

export type ProvisionInternalPartnerBusinessResult = {
  businessId: string;
  userId: string;
  subscriptionId: string;
  slug: string;
  idempotentReplay: boolean;
};

export async function provisionInternalPartnerBusiness(
  input: ProvisionInternalPartnerBusinessInput,
): Promise<ProvisionInternalPartnerBusinessResult> {
  const externalUserId = input.externalUserId.trim();
  if (!externalUserId) {
    throw new HttpError(400, "externalUserId is required.");
  }
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const ownerName = input.ownerName.trim();
  const businessName = input.businessName.trim();
  if (!ownerEmail || !ownerName || !businessName) {
    throw new HttpError(400, "ownerEmail, ownerName, and businessName are required.");
  }

  const existingBiz = await prisma.business.findFirst({
    where: { partnerProvisioningExternalUserId: externalUserId },
    select: {
      id: true,
      slug: true,
      memberships: { where: { isOwner: true }, take: 1, select: { userId: true } },
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
    },
  });
  if (existingBiz) {
    const userId = existingBiz.memberships[0]?.userId;
    const subscriptionId = existingBiz.subscriptions[0]?.id;
    if (!userId || !subscriptionId) {
      throw new HttpError(500, "Partner business record is incomplete.");
    }
    // Ensure Wave aggregated merchant exists (no-op if already provisioned; backfill for older tenants).
    await provisionDefaultWaveGatewayCredentialForBusiness(
      existingBiz.id,
      WaveAggregatedMerchantProvisionTrigger.INTERNAL_PARTNER_PROVISION,
    );
    return {
      businessId: existingBiz.id,
      userId,
      subscriptionId,
      slug: existingBiz.slug,
      idempotentReplay: true,
    };
  }

  const emailOwner = await prisma.user.findUnique({
    where: { email: ownerEmail },
    select: { id: true },
  });
  if (emailOwner) {
    throw new HttpError(
      409,
      "This email is already registered in Easypay. Use a different owner email for partner provisioning.",
    );
  }

  const password = generateTemporaryPassword();

  const created = await prisma.$transaction(async (tx) => {
    const slug = await allocateUniqueBusinessSlug(tx, normalizeSlug(input.slug || businessName));

    const user = await tx.user.create({
      data: {
        name: ownerName,
        email: ownerEmail,
        passwordHash: hashPassword(password),
        role: UserRole.MERCHANT,
        mustChangePassword: true,
      },
    });

    const business = await tx.business.create({
      data: {
        name: businessName,
        slug,
        industry: input.industry?.trim() || null,
        ownerName,
        ownerEmail,
        platformBillingWaived: true,
        partnerProvisioningExternalUserId: externalUserId,
        internalPartnerWebhookUrl: input.webhookUrl?.trim() || null,
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

    const subscription = await createInternalPartnerForeverBasicSubscriptionForBusinessTx(tx, {
      businessId: business.id,
      planCode: PlanCode.BASIC,
    });

    return { user, business, subscription };
  });

  await ensureInternalPartnerCheckoutProduct(created.business.id);
  await provisionDefaultWaveGatewayCredentialForBusiness(
    created.business.id,
    WaveAggregatedMerchantProvisionTrigger.INTERNAL_PARTNER_PROVISION,
  );

  return {
    businessId: created.business.id,
    userId: created.user.id,
    subscriptionId: created.subscription.id,
    slug: created.business.slug,
    idempotentReplay: false,
  };
}
