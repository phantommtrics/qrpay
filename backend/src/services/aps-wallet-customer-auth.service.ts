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
import { apsWalletBusinessMerchantContext, apsWalletUnlinkCustomer } from "./aps-wallet-client.service.js";
import {
  type ApsGatewaySecrets,
  getDecryptedGatewaySecrets,
} from "./business-gateway-credential.service.js";

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
  // A successful APS unlink means the previously stored authorized token is no longer valid.
  // Keep the row for analytics, but force next checkout to run OTP and mint a fresh token.
  if (row.lastUnlinkSucceededAt) {
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
      lastUnlinkAttemptAt: null,
      lastUnlinkSucceededAt: null,
      lastUnlinkError: null,
    },
    update: {
      iv: enc.iv,
      ciphertext: enc.ciphertext,
      keyVersion: 1,
      // New token replaces any prior unlink audit state.
      lastUnlinkAttemptAt: null,
      lastUnlinkSucceededAt: null,
      lastUnlinkError: null,
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
  lastUnlinkAttemptAt?: string;
  lastUnlinkSucceededAt?: string;
  lastUnlinkError?: string;
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
    lastUnlinkAttemptAt: r.lastUnlinkAttemptAt?.toISOString(),
    lastUnlinkSucceededAt: r.lastUnlinkSucceededAt?.toISOString(),
    lastUnlinkError: r.lastUnlinkError ?? undefined,
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
    lastUnlinkAttemptAt: r.lastUnlinkAttemptAt?.toISOString(),
    lastUnlinkSucceededAt: r.lastUnlinkSucceededAt?.toISOString(),
    lastUnlinkError: r.lastUnlinkError ?? undefined,
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

async function resolveApsCustomerAuthForUnlink(authId: string) {
  const row = await prisma.businessApsWalletCustomerAuth.findUnique({
    where: { id: authId },
    include: {
      gateway: { select: { code: true } },
    },
  });
  if (!row) {
    throw new HttpError(404, "APS customer authorization not found.");
  }
  return row;
}

function decryptStoredAuthorizedToken(row: { iv: string; ciphertext: string }): string {
  let authorizedToken: string | null = null;
  try {
    const payload = decryptJsonPayload<StoredPayload>(row.iv, row.ciphertext);
    const token = payload.authorizedToken?.trim();
    authorizedToken = token && token.length > 0 ? token : null;
  } catch {
    authorizedToken = null;
  }
  if (!authorizedToken) {
    throw new HttpError(400, "Stored APS customer authorization token is missing or invalid.");
  }
  return authorizedToken;
}

async function unlinkApsCustomerAuthRow(row: {
  id: string;
  businessId: string;
  iv: string;
  ciphertext: string;
  merchantScope: ApsWalletCustomerAuthMerchantScope;
  gateway: { code: string };
}): Promise<void> {
  const authorizedToken = decryptStoredAuthorizedToken(row);

  if (row.merchantScope === ApsWalletCustomerAuthMerchantScope.PLATFORM_SUBSCRIPTION) {
    await apsWalletUnlinkCustomer(authorizedToken);
    return;
  }

  const gatewayCode = row.gateway.code?.trim().toLowerCase();
  if (!gatewayCode) {
    throw new HttpError(400, "Gateway code is missing for this APS customer authorization.");
  }

  const secrets = await getDecryptedGatewaySecrets<ApsGatewaySecrets>(row.businessId, gatewayCode);
  if (!secrets?.username?.trim() || !secrets.password?.trim()) {
    throw new HttpError(
      400,
      "APS merchant credentials are not configured for this business gateway. Cannot unlink customer from APS.",
    );
  }

  const merchantCtx = apsWalletBusinessMerchantContext({
    businessId: row.businessId,
    gatewayCode,
    username: secrets.username.trim(),
    password: secrets.password,
  });
  await apsWalletUnlinkCustomer(authorizedToken, merchantCtx);
}

export async function recordApsCustomerAuthUnlinkAttemptById(input: {
  authId: string;
  ok: boolean;
  error?: string;
}): Promise<void> {
  const now = new Date();
  await prisma.businessApsWalletCustomerAuth.updateMany({
    where: { id: input.authId },
    data: {
      lastUnlinkAttemptAt: now,
      lastUnlinkSucceededAt: input.ok ? now : null,
      lastUnlinkError: input.ok ? null : (input.error ?? "APS unlink failed."),
    },
  });
}

export async function recordApsCustomerAuthUnlinkAttempt(input: {
  businessId: string;
  gatewayId: string;
  customerMobileNormalized: string;
  merchantScope: ApsWalletCustomerAuthMerchantScope;
  ok: boolean;
  error?: string;
}): Promise<void> {
  const mobile = input.customerMobileNormalized.trim();
  if (!mobile) {
    return;
  }
  const now = new Date();
  await prisma.businessApsWalletCustomerAuth.updateMany({
    where: {
      businessId: input.businessId,
      gatewayId: input.gatewayId,
      customerMobileNormalized: mobile,
      merchantScope: input.merchantScope,
    },
    data: {
      lastUnlinkAttemptAt: now,
      lastUnlinkSucceededAt: input.ok ? now : null,
      lastUnlinkError: input.ok ? null : (input.error ?? "APS unlink failed."),
    },
  });
}

export async function unlinkPlatformApsWalletCustomerAuth(authId: string): Promise<void> {
  const row = await resolveApsCustomerAuthForUnlink(authId);
  try {
    await unlinkApsCustomerAuthRow(row);
    await recordApsCustomerAuthUnlinkAttemptById({ authId, ok: true });
  } catch (e) {
    await recordApsCustomerAuthUnlinkAttemptById({
      authId,
      ok: false,
      error: e instanceof Error ? e.message : "APS unlink failed.",
    });
    throw e;
  }
}

export async function unlinkBusinessApsWalletCustomerAuth(
  businessId: string,
  authId: string,
): Promise<void> {
  const row = await resolveApsCustomerAuthForUnlink(authId);
  if (row.businessId !== businessId) {
    throw new HttpError(404, "APS customer authorization not found.");
  }
  try {
    await unlinkApsCustomerAuthRow(row);
    await recordApsCustomerAuthUnlinkAttemptById({ authId, ok: true });
  } catch (e) {
    await recordApsCustomerAuthUnlinkAttemptById({
      authId,
      ok: false,
      error: e instanceof Error ? e.message : "APS unlink failed.",
    });
    throw e;
  }
}
