import { HttpError } from "../lib/http-error.js";
import { waveApiBaseUrl } from "../config/payment-provider-env.js";
import { WavePaymentService } from "./wave-payment.service.js";

/** True when the single Wave portal checkout key is configured. */
export function isPlatformWaveCheckoutConfigured(): boolean {
  return Boolean((process.env.WAVE_CHECKOUT_BEARER || "").trim());
}

/**
 * Wave API client using `WAVE_CHECKOUT_BEARER` (one portal key for all checkouts).
 * Sales sessions use each tenant's aggregated merchant.
 * Platform subscription invoices use the main merchant aggregated merchant
 * ({@link resolveWavePlatformAggregatedMerchantId}) — Wave aggregator keys reject checkout without one.
 */
export function waveServiceFromEnv(): WavePaymentService {
  const baseUrl = waveApiBaseUrl();
  const bearer = (process.env.WAVE_CHECKOUT_BEARER || "").trim();
  if (!bearer) {
    throw new HttpError(503, "Online checkout is not configured (WAVE_CHECKOUT_BEARER).");
  }
  return new WavePaymentService({ baseUrl, bearerToken: bearer });
}

export function waveServiceFromBearer(bearerToken: string): WavePaymentService {
  const bearer = bearerToken.trim();
  if (!bearer) {
    throw new HttpError(503, "Wave merchant API key is missing.");
  }
  return new WavePaymentService({ baseUrl: waveApiBaseUrl(), bearerToken: bearer });
}

/**
 * Sales checkout client: the business’s own Wave API key when stored, otherwise the
 * platform aggregator (`WAVE_CHECKOUT_BEARER`). Subscription billing still uses
 * {@link waveServiceFromEnv} only.
 */
export async function waveServiceForBusiness(
  businessId: string,
  gatewayCode = "wave_gambia",
): Promise<WavePaymentService> {
  const { getDecryptedGatewaySecrets, waveOwnAccountBearer } = await import(
    "./business-gateway-credential.service.js"
  );
  const secrets = await getDecryptedGatewaySecrets<{ bearerToken?: string }>(
    businessId,
    gatewayCode,
  );
  const own = waveOwnAccountBearer(secrets);
  if (own) {
    return waveServiceFromBearer(own);
  }
  return waveServiceFromEnv();
}

function platformAggregatedMerchantDisplayName(): string {
  const platform = (process.env.PLATFORM_NAME || "DirectPay").trim() || "DirectPay";
  return `${platform} Platform`.slice(0, 255);
}

let cachedPlatformAggregatedMerchantId: string | null = null;

async function findAggregatedMerchantIdByName(
  wave: WavePaymentService,
  name: string,
): Promise<string | null> {
  let after: string | undefined;
  for (let page = 0; page < 30; page++) {
    const result = await wave.listAggregatedMerchants({ first: 50, after });
    const hit = result.items.find((item) => item.name.trim() === name);
    if (hit?.id?.trim()) {
      return hit.id.trim();
    }
    if (!result.page_info.has_next_page || !result.page_info.end_cursor) {
      return null;
    }
    after = result.page_info.end_cursor;
  }
  return null;
}

/**
 * Aggregated merchant id for the **main** EasyPay Wave merchant (platform subscription invoices).
 *
 * Wave aggregator API keys always require `aggregated_merchant_id`. This is not a tenant
 * merchant: `WAVE_PLATFORM_AGGREGATED_MERCHANT_ID`, or find/create `"<PLATFORM_NAME> Platform"`.
 */
export async function resolveWavePlatformAggregatedMerchantId(): Promise<string> {
  const fromEnv = (process.env.WAVE_PLATFORM_AGGREGATED_MERCHANT_ID || "").trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (cachedPlatformAggregatedMerchantId) {
    return cachedPlatformAggregatedMerchantId;
  }

  const wave = waveServiceFromEnv();
  const targetName = platformAggregatedMerchantDisplayName();
  const existing = await findAggregatedMerchantIdByName(wave, targetName);
  if (existing) {
    cachedPlatformAggregatedMerchantId = existing;
    return existing;
  }

  const created = await wave.createAggregatedMerchant({
    name: targetName,
    business_description: "Main merchant account for DirectPay platform subscription billing.",
    business_type: "other",
  });
  const id = created.id?.trim();
  if (!id) {
    throw new HttpError(
      502,
      "Wave did not return an aggregated merchant id for the platform (main) merchant.",
    );
  }
  cachedPlatformAggregatedMerchantId = id;
  console.info(
    `[wave] Using new platform aggregated merchant ${id} (${targetName}) for subscription checkout.`,
  );
  return id;
}
