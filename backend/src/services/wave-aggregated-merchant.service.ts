import {
  Prisma,
  WaveAggregatedMerchantProvisionOperation,
  WaveAggregatedMerchantProvisionStatus,
  WaveAggregatedMerchantProvisionTrigger,
} from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  parseExistingWave,
  type WaveGatewaySecrets,
} from "./business-gateway-credential.service.js";
import { decryptJsonPayload, encryptJsonPayload } from "../utils/field-encryption.js";
import { GATEWAY_CODE_WAVE_GAMBIA, getPaymentGatewayByCode } from "./payment-gateway.service.js";
import { waveServiceFromEnv, isPlatformWaveCheckoutConfigured } from "./wave-client-env.js";
import type {
  WaveAggregatedMerchant,
  WaveAggregatedMerchantRequest,
} from "./wave-payment.service.js";

function trimOrNull(v: string | undefined): string | null {
  const t = v?.trim();
  return t && t.length > 0 ? t : null;
}

export function defaultAggregatedMerchantName(business: { name: string }): string {
  const base = business.name.trim();
  return base.length <= 255 ? base : base.slice(0, 255);
}

function waveMerchantToUpdateRequest(
  merchant: WaveAggregatedMerchant,
  overrides: Partial<WaveAggregatedMerchantRequest> = {},
): WaveAggregatedMerchantRequest {
  return {
    name: overrides.name ?? merchant.name,
    business_description: merchant.business_description,
    business_type: merchant.business_type,
    business_registration_identifier: merchant.business_registration_id ?? null,
    business_sector: merchant.business_sector ?? null,
    website_url: merchant.website_url ?? null,
    manager_name: merchant.manager_name ?? null,
  };
}

function buildDefaultWaveAggregatedMerchantRequest(business: {
  name: string;
  slug: string;
  industry: string | null;
  ownerName: string;
}): WaveAggregatedMerchantRequest {
  return {
    name: defaultAggregatedMerchantName(business),
    business_description: `Payments for ${business.name}`,
    business_type: "other",
    business_sector: trimOrNull(business.industry ?? undefined),
    business_registration_identifier: null,
    website_url: null,
    manager_name: trimOrNull(business.ownerName),
  };
}

async function writeProvisionLog(input: {
  businessId: string;
  trigger: WaveAggregatedMerchantProvisionTrigger;
  operation: WaveAggregatedMerchantProvisionOperation | null;
  status: WaveAggregatedMerchantProvisionStatus;
  requestedName?: string | null;
  requestPayload?: WaveAggregatedMerchantRequest | null;
  aggregatedMerchantId?: string | null;
  errorMessage?: string | null;
}) {
  await prisma.waveAggregatedMerchantProvisionLog.create({
    data: {
      businessId: input.businessId,
      trigger: input.trigger,
      operation: input.operation,
      status: input.status,
      requestedName: input.requestedName ?? null,
      requestPayload: (input.requestPayload ?? undefined) as Prisma.InputJsonValue | undefined,
      aggregatedMerchantId: input.aggregatedMerchantId ?? null,
      errorMessage: input.errorMessage?.slice(0, 4000) ?? null,
    },
  });
}

function errorMessageFromUnknown(e: unknown): string {
  if (e instanceof HttpError) {
    return e.message;
  }
  if (e instanceof Error) {
    return e.message;
  }
  return "Unknown error";
}

export type ProvisionWaveAggregatedMerchantResult = {
  status: "succeeded" | "skipped" | "failed";
  aggregatedMerchantId?: string;
  message?: string;
};

/**
 * Provisions (or re-provisions) Wave sales checkout for a business using the platform parent bearer.
 * Subscription billing is unchanged and still uses env credentials only.
 */
export async function provisionWaveAggregatedMerchantForBusiness(input: {
  businessId: string;
  trigger: WaveAggregatedMerchantProvisionTrigger;
  /** When true, creates a new Wave merchant even if one is already stored. */
  force?: boolean;
}): Promise<ProvisionWaveAggregatedMerchantResult> {
  const { businessId, trigger, force = false } = input;

  if (!isPlatformWaveCheckoutConfigured()) {
    await writeProvisionLog({
      businessId,
      trigger,
      operation: null,
      status: WaveAggregatedMerchantProvisionStatus.SKIPPED,
      errorMessage: "WAVE_CHECKOUT_BEARER is not configured on the server.",
    });
    return { status: "skipped", message: "Platform Wave checkout is not configured." };
  }

  const gateway = await getPaymentGatewayByCode(GATEWAY_CODE_WAVE_GAMBIA);
  if (!gateway?.isEnabled) {
    await writeProvisionLog({
      businessId,
      trigger,
      operation: null,
      status: WaveAggregatedMerchantProvisionStatus.SKIPPED,
      errorMessage: "wave_gambia payment gateway is disabled.",
    });
    return { status: "skipped", message: "Wave gateway is not enabled." };
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, slug: true, industry: true, ownerName: true },
  });
  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

  const existingRow = await prisma.businessGatewayCredential.findUnique({
    where: {
      businessId_gatewayId: { businessId, gatewayId: gateway.id },
    },
  });

  let existingSecrets: WaveGatewaySecrets | null = null;
  if (existingRow) {
    try {
      const { decryptJsonPayload } = await import("../utils/field-encryption.js");
      const raw = decryptJsonPayload<Record<string, unknown>>(
        existingRow.iv,
        existingRow.ciphertext,
      );
      existingSecrets = parseExistingWave(raw);
    } catch {
      existingSecrets = null;
    }
  }

  const existingId = existingSecrets?.aggregatedMerchantId?.trim();
  if (existingId && !force) {
    await writeProvisionLog({
      businessId,
      trigger,
      operation: null,
      status: WaveAggregatedMerchantProvisionStatus.SKIPPED,
      aggregatedMerchantId: existingId,
      errorMessage: "Aggregated merchant already provisioned.",
    });
    return {
      status: "skipped",
      aggregatedMerchantId: existingId,
      message: "Wave aggregated merchant already exists for this business.",
    };
  }

  const waveRequest = buildDefaultWaveAggregatedMerchantRequest(business);
  const operation = existingId
    ? WaveAggregatedMerchantProvisionOperation.UPDATE
    : WaveAggregatedMerchantProvisionOperation.CREATE;

  const wave = waveServiceFromEnv();

  try {
    const merchant = existingId
      ? await wave.updateAggregatedMerchant(existingId, waveRequest)
      : await wave.createAggregatedMerchant(waveRequest);

    const aggregatedMerchantId = merchant.id?.trim();
    if (!aggregatedMerchantId) {
      throw new HttpError(502, "Wave did not return an aggregated merchant id.");
    }

    const payload: WaveGatewaySecrets = {
      aggregatedMerchantId,
      customerWalletFeeRate: existingSecrets?.customerWalletFeeRate,
    };

    const enc = encryptJsonPayload(payload);
    await prisma.businessGatewayCredential.upsert({
      where: {
        businessId_gatewayId: { businessId, gatewayId: gateway.id },
      },
      create: {
        businessId,
        gatewayId: gateway.id,
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

    await writeProvisionLog({
      businessId,
      trigger,
      operation,
      status: WaveAggregatedMerchantProvisionStatus.SUCCEEDED,
      requestedName: waveRequest.name,
      requestPayload: waveRequest,
      aggregatedMerchantId,
    });

    return { status: "succeeded", aggregatedMerchantId };
  } catch (e) {
    const msg = errorMessageFromUnknown(e);
    await writeProvisionLog({
      businessId,
      trigger,
      operation,
      status: WaveAggregatedMerchantProvisionStatus.FAILED,
      requestedName: waveRequest.name,
      requestPayload: waveRequest,
      aggregatedMerchantId: existingId ?? null,
      errorMessage: msg,
    });

    if (e instanceof HttpError) {
      throw e;
    }
    throw new HttpError(502, `Wave aggregated merchant provision failed: ${msg}`);
  }
}

export async function listWaveAggregatedMerchantProvisionLogs(
  businessId: string,
  limit = 50,
) {
  const rows = await prisma.waveAggregatedMerchantProvisionLog.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return rows.map((r) => ({
    id: r.id,
    businessId: r.businessId,
    trigger: r.trigger,
    operation: r.operation,
    status: r.status,
    requestedName: r.requestedName,
    requestPayload: r.requestPayload,
    aggregatedMerchantId: r.aggregatedMerchantId,
    errorMessage: r.errorMessage,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type WaveLinkedBusiness = {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
};

/** Decrypts Wave gateway credentials and maps aggregated merchant id ↔ Easypay business. */
export async function loadWaveMerchantBusinessLinks(): Promise<{
  businessByMerchantId: Map<string, WaveLinkedBusiness>;
  merchantIdByBusinessId: Map<string, string>;
}> {
  const businessByMerchantId = new Map<string, WaveLinkedBusiness>();
  const merchantIdByBusinessId = new Map<string, string>();
  const gateway = await getPaymentGatewayByCode(GATEWAY_CODE_WAVE_GAMBIA);
  if (!gateway) {
    return { businessByMerchantId, merchantIdByBusinessId };
  }
  const credRows = await prisma.businessGatewayCredential.findMany({
    where: { gatewayId: gateway.id },
    include: {
      business: {
        select: { id: true, name: true, slug: true, ownerEmail: true },
      },
    },
  });
  for (const row of credRows) {
    try {
      const raw = decryptJsonPayload<Record<string, unknown>>(row.iv, row.ciphertext);
      const secrets = parseExistingWave(raw);
      const mid = secrets?.aggregatedMerchantId?.trim();
      if (mid) {
        businessByMerchantId.set(mid, row.business);
        merchantIdByBusinessId.set(row.business.id, mid);
      }
    } catch {
      // skip undecryptable rows
    }
  }
  return { businessByMerchantId, merchantIdByBusinessId };
}

export type PlatformWaveAggregatedMerchantRow = {
  id: string;
  name: string;
  business_sector: string | null;
  business_type: string;
  business_registration_identifier: string | null;
  website_url: string | null;
  payout_fee_structure_name?: string;
  checkout_fee_structure_name?: string;
  business_description: string;
  manager_name: string | null;
  is_locked: boolean;
  when_created: string;
  /** Easypay business linked by stored aggregated merchant id, if any. */
  business: {
    id: string;
    name: string;
    slug: string;
    ownerEmail: string;
  } | null;
  /** Latest local provision log for this merchant id (if any). */
  lastProvision: {
    status: string;
    trigger: string;
    createdAt: string;
  } | null;
};

/**
 * Lists aggregated merchants from Wave (parent account) and enriches with Easypay business links.
 */
export async function listPlatformWaveAggregatedMerchants(input: {
  first?: number;
  after?: string;
}): Promise<{
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  items: PlatformWaveAggregatedMerchantRow[];
}> {
  if (!isPlatformWaveCheckoutConfigured()) {
    throw new HttpError(
      503,
      "Wave parent checkout is not configured on the server (WAVE_CHECKOUT_BEARER).",
    );
  }

  const first = Math.min(Math.max(input.first ?? 25, 1), 100);
  const wave = waveServiceFromEnv();
  const wavePage = await wave.listAggregatedMerchants({
    first,
    after: input.after?.trim() || undefined,
  });

  const { businessByMerchantId } = await loadWaveMerchantBusinessLinks();

  const merchantIds = wavePage.items.map((m) => m.id).filter(Boolean);
  const provisionLogs =
    merchantIds.length > 0
      ? await prisma.waveAggregatedMerchantProvisionLog.findMany({
          where: { aggregatedMerchantId: { in: merchantIds } },
          orderBy: { createdAt: "desc" },
          select: {
            aggregatedMerchantId: true,
            status: true,
            trigger: true,
            createdAt: true,
          },
        })
      : [];

  const lastProvisionByMerchantId = new Map<
    string,
    { status: string; trigger: string; createdAt: string }
  >();
  for (const log of provisionLogs) {
    const mid = log.aggregatedMerchantId?.trim();
    if (mid && !lastProvisionByMerchantId.has(mid)) {
      lastProvisionByMerchantId.set(mid, {
        status: log.status,
        trigger: log.trigger,
        createdAt: log.createdAt.toISOString(),
      });
    }
  }

  const items: PlatformWaveAggregatedMerchantRow[] = wavePage.items.map((m) => ({
    id: m.id,
    name: m.name,
    business_sector: m.business_sector ?? null,
    business_type: m.business_type,
    business_registration_identifier: m.business_registration_id ?? null,
    website_url: m.website_url ?? null,
    payout_fee_structure_name: m.payout_fee_structure_name,
    checkout_fee_structure_name: m.checkout_fee_structure_name,
    business_description: m.business_description,
    manager_name: m.manager_name ?? null,
    is_locked: m.is_locked,
    when_created: m.when_created,
    business: businessByMerchantId.get(m.id) ?? null,
    lastProvision: lastProvisionByMerchantId.get(m.id) ?? null,
  }));

  return {
    pageInfo: {
      hasNextPage: Boolean(wavePage.page_info?.has_next_page),
      endCursor: wavePage.page_info?.end_cursor?.trim() || null,
    },
    items,
  };
}

async function findBusinessForAggregatedMerchantId(
  merchantId: string,
): Promise<{ id: string; name: string; slug: string; ownerEmail: string } | null> {
  const gateway = await getPaymentGatewayByCode(GATEWAY_CODE_WAVE_GAMBIA);
  if (!gateway) {
    return null;
  }
  const credRows = await prisma.businessGatewayCredential.findMany({
    where: { gatewayId: gateway.id },
    include: {
      business: {
        select: { id: true, name: true, slug: true, ownerEmail: true },
      },
    },
  });
  const target = merchantId.trim();
  for (const row of credRows) {
    try {
      const raw = decryptJsonPayload<Record<string, unknown>>(row.iv, row.ciphertext);
      const secrets = parseExistingWave(raw);
      if (secrets?.aggregatedMerchantId?.trim() === target) {
        return row.business;
      }
    } catch {
      // skip undecryptable rows
    }
  }
  return null;
}

function mapWaveAggregatedMerchantToRow(
  merchant: WaveAggregatedMerchant,
  enrich: {
    business: PlatformWaveAggregatedMerchantRow["business"];
    lastProvision: PlatformWaveAggregatedMerchantRow["lastProvision"];
  },
): PlatformWaveAggregatedMerchantRow {
  return {
    id: merchant.id,
    name: merchant.name,
    business_sector: merchant.business_sector ?? null,
    business_type: merchant.business_type,
    business_registration_identifier: merchant.business_registration_id ?? null,
    website_url: merchant.website_url ?? null,
    payout_fee_structure_name: merchant.payout_fee_structure_name,
    checkout_fee_structure_name: merchant.checkout_fee_structure_name,
    business_description: merchant.business_description,
    manager_name: merchant.manager_name ?? null,
    is_locked: merchant.is_locked,
    when_created: merchant.when_created,
    business: enrich.business,
    lastProvision: enrich.lastProvision,
  };
}

async function enrichPlatformWaveAggregatedMerchantRow(
  merchant: WaveAggregatedMerchant,
): Promise<PlatformWaveAggregatedMerchantRow> {
  const [business, lastLog] = await Promise.all([
    findBusinessForAggregatedMerchantId(merchant.id),
    prisma.waveAggregatedMerchantProvisionLog.findFirst({
      where: { aggregatedMerchantId: merchant.id },
      orderBy: { createdAt: "desc" },
      select: { status: true, trigger: true, createdAt: true },
    }),
  ]);

  return mapWaveAggregatedMerchantToRow(merchant, {
    business,
    lastProvision: lastLog
      ? {
          status: lastLog.status,
          trigger: lastLog.trigger,
          createdAt: lastLog.createdAt.toISOString(),
        }
      : null,
  });
}

/** Updates checkout display name for a Wave aggregated merchant (platform admin). */
export async function updatePlatformWaveAggregatedMerchant(input: {
  merchantId: string;
  name: string;
}): Promise<PlatformWaveAggregatedMerchantRow> {
  if (!isPlatformWaveCheckoutConfigured()) {
    throw new HttpError(
      503,
      "Wave parent checkout is not configured on the server (WAVE_CHECKOUT_BEARER).",
    );
  }

  const merchantId = input.merchantId.trim();
  if (!merchantId) {
    throw new HttpError(400, "Aggregated merchant id is required.");
  }

  const name = input.name.trim();
  if (!name) {
    throw new HttpError(400, "Business name is required.");
  }
  if (name.length > 255) {
    throw new HttpError(400, "Business name must be 255 characters or fewer.");
  }

  const wave = waveServiceFromEnv();
  const existing = await wave.getAggregatedMerchant(merchantId);
  if (existing.is_locked) {
    throw new HttpError(409, "This aggregated merchant is locked and cannot be edited.");
  }

  const updated =
    existing.name.trim() === name
      ? existing
      : await wave.updateAggregatedMerchant(
          merchantId,
          waveMerchantToUpdateRequest(existing, { name }),
        );

  if (existing.name.trim() !== name) {
    const linkedBusiness = await findBusinessForAggregatedMerchantId(merchantId);
    if (linkedBusiness) {
      await writeProvisionLog({
        businessId: linkedBusiness.id,
        trigger: WaveAggregatedMerchantProvisionTrigger.PLATFORM_MANUAL,
        operation: WaveAggregatedMerchantProvisionOperation.UPDATE,
        status: WaveAggregatedMerchantProvisionStatus.SUCCEEDED,
        requestedName: name,
        requestPayload: waveMerchantToUpdateRequest(existing, { name }),
        aggregatedMerchantId: merchantId,
      });
    }
  }

  return enrichPlatformWaveAggregatedMerchantRow(updated);
}

/** Best-effort delete of Wave aggregated merchant when removing local credentials. */
export async function deleteWaveAggregatedMerchantIfPresent(
  businessId: string,
  gatewayCode: string,
): Promise<void> {
  const { getDecryptedGatewaySecrets } = await import("./business-gateway-credential.service.js");
  const secrets = await getDecryptedGatewaySecrets<WaveGatewaySecrets>(businessId, gatewayCode);
  const id = secrets?.aggregatedMerchantId?.trim();
  if (!id || !isPlatformWaveCheckoutConfigured()) {
    return;
  }
  try {
    const wave = waveServiceFromEnv();
    await wave.deleteAggregatedMerchant(id);
  } catch (e) {
    console.error(
      `[wave] Failed to delete aggregated merchant ${id} for business ${businessId}:`,
      e,
    );
  }
}
