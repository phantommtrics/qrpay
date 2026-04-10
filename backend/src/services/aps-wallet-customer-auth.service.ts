/**
 * Persists APS **authorized_token** (after customer confirms OTP) per tenant + gateway + normalized mobile.
 * Encrypted at rest with {@link encryptJsonPayload} / `APP_SECRET_ENCRYPTION_KEY` (same as merchant gateway secrets).
 * Used on later checkouts to call `process-payment` without repeating authorize+OTP while APS still accepts the token.
 * {@link ApsWalletCustomerAuthMerchantScope} separates business-merchant tokens (sales) from platform-merchant tokens (subscription billing).
 * Rows are removed when {@link deleteStoredApsAuthorizedToken} runs (e.g. process-payment rejects a stored token).
 */
import { ApsWalletCustomerAuthMerchantScope } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { decryptJsonPayload, encryptJsonPayload } from "../utils/field-encryption.js";
import { HttpError } from "../lib/http-error.js";
import { getPaymentGatewayByCode } from "./payment-gateway.service.js";

type StoredPayload = {
  authorizedToken: string;
};

export { ApsWalletCustomerAuthMerchantScope };

export async function getStoredApsAuthorizedToken(
  businessId: string,
  gatewayId: string,
  customerMobileNormalized: string,
  merchantScope: ApsWalletCustomerAuthMerchantScope = ApsWalletCustomerAuthMerchantScope.BUSINESS_MERCHANT,
): Promise<string | null> {
  const mobile = customerMobileNormalized.trim();
  if (!mobile) {
    return null;
  }
  const row = await prisma.businessApsWalletCustomerAuth.findUnique({
    where: {
      businessId_gatewayId_customerMobileNormalized_merchantScope: {
        businessId,
        gatewayId,
        customerMobileNormalized: mobile,
        merchantScope,
      },
    },
  });
  if (!row) {
    return null;
  }
  try {
    const payload = decryptJsonPayload<StoredPayload>(row.iv, row.ciphertext);
    const t = payload.authorizedToken?.trim();
    return t && t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

export async function upsertStoredApsAuthorizedToken(
  businessId: string,
  gatewayId: string,
  customerMobileNormalized: string,
  authorizedToken: string,
  merchantScope: ApsWalletCustomerAuthMerchantScope = ApsWalletCustomerAuthMerchantScope.BUSINESS_MERCHANT,
): Promise<void> {
  const mobile = customerMobileNormalized.trim();
  const token = authorizedToken.trim();
  if (!mobile || !token) {
    return;
  }
  const enc = encryptJsonPayload({ authorizedToken: token } satisfies StoredPayload);
  await prisma.businessApsWalletCustomerAuth.upsert({
    where: {
      businessId_gatewayId_customerMobileNormalized_merchantScope: {
        businessId,
        gatewayId,
        customerMobileNormalized: mobile,
        merchantScope,
      },
    },
    create: {
      businessId,
      gatewayId,
      customerMobileNormalized: mobile,
      merchantScope,
      iv: enc.iv,
      ciphertext: enc.ciphertext,
      keyVersion: 1,
    },
    update: {
      iv: enc.iv,
      ciphertext: enc.ciphertext,
      keyVersion: 1,
    },
  });
}

export async function deleteStoredApsAuthorizedToken(
  businessId: string,
  gatewayId: string,
  customerMobileNormalized: string,
  merchantScope: ApsWalletCustomerAuthMerchantScope = ApsWalletCustomerAuthMerchantScope.BUSINESS_MERCHANT,
): Promise<void> {
  const mobile = customerMobileNormalized.trim();
  if (!mobile) {
    return;
  }
  await prisma.businessApsWalletCustomerAuth.deleteMany({
    where: {
      businessId,
      gatewayId,
      customerMobileNormalized: mobile,
      merchantScope,
    },
  });
}

export type BusinessApsWalletCustomerAuthRow = {
  id: string;
  businessId: string;
  businessName?: string;
  gatewayId: string;
  gatewayCode: string;
  gatewayName: string;
  customerMobileNormalized: string;
  merchantScope: ApsWalletCustomerAuthMerchantScope;
  createdAt: string;
  updatedAt: string;
};

export async function listBusinessApsWalletCustomerAuths(
  businessId: string,
): Promise<BusinessApsWalletCustomerAuthRow[]> {
  const rows = await prisma.businessApsWalletCustomerAuth.findMany({
    where: { businessId },
    include: {
      gateway: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    businessId: r.businessId,
    gatewayId: r.gatewayId,
    gatewayCode: r.gateway.code,
    gatewayName: r.gateway.name,
    customerMobileNormalized: r.customerMobileNormalized,
    merchantScope: r.merchantScope,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function listPlatformApsWalletCustomerAuths(filters?: {
  businessId?: string;
  gatewayCode?: string;
}): Promise<BusinessApsWalletCustomerAuthRow[]> {
  let gatewayId: string | undefined;
  const gatewayCode = filters?.gatewayCode?.trim().toLowerCase();
  if (gatewayCode) {
    const gateway = await getPaymentGatewayByCode(gatewayCode);
    if (!gateway) {
      return [];
    }
    gatewayId = gateway.id;
  }
  const rows = await prisma.businessApsWalletCustomerAuth.findMany({
    where: {
      ...(filters?.businessId?.trim() ? { businessId: filters.businessId.trim() } : {}),
      ...(gatewayId ? { gatewayId } : {}),
    },
    include: {
      business: { select: { id: true, name: true } },
      gateway: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    businessId: r.businessId,
    businessName: r.business.name,
    gatewayId: r.gatewayId,
    gatewayCode: r.gateway.code,
    gatewayName: r.gateway.name,
    customerMobileNormalized: r.customerMobileNormalized,
    merchantScope: r.merchantScope,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function clearBusinessApsWalletCustomerAuth(
  businessId: string,
  authId: string,
): Promise<void> {
  const row = await prisma.businessApsWalletCustomerAuth.findUnique({
    where: { id: authId },
    select: { id: true, businessId: true },
  });
  if (!row || row.businessId !== businessId) {
    throw new HttpError(404, "APS customer authorization not found.");
  }
  await prisma.businessApsWalletCustomerAuth.delete({ where: { id: row.id } });
}

export async function clearPlatformApsWalletCustomerAuth(authId: string): Promise<void> {
  const row = await prisma.businessApsWalletCustomerAuth.findUnique({
    where: { id: authId },
    select: { id: true },
  });
  if (!row) {
    throw new HttpError(404, "APS customer authorization not found.");
  }
  await prisma.businessApsWalletCustomerAuth.delete({ where: { id: authId } });
}
