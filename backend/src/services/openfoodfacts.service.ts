import { HttpError } from "../lib/http-error.js";

const OFF_API = "https://world.openfoodfacts.org/api/v2/product";

function defaultUserAgent(): string {
  return (
    process.env.OPENFOODFACTS_USER_AGENT?.trim() ||
    "QRPay/1.0 (retail catalog; contact: support@qrpay.local)"
  );
}

function prettyCategoryFromTags(tags: string[] | undefined): string | null {
  if (!tags?.length) {
    return null;
  }
  const tag = tags[0]!;
  const raw = tag.replace(/^[a-z]{2}:/, "").replace(/-/g, " ");
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Barcode symbology for react-barcode / scanners (EAN-13 retail packages, etc.). */
export function inferBarcodeType(barcodeValue: string): string {
  const v = barcodeValue.trim();
  if (/^\d{13}$/.test(v)) {
    return "EAN13";
  }
  if (/^\d{12}$/.test(v)) {
    return "UPC";
  }
  if (/^\d{8}$/.test(v)) {
    return "EAN8";
  }
  if (/^\d{14}$/.test(v)) {
    return "ITF14";
  }
  return "CODE128";
}

export type OpenFoodFactsLookupResult = {
  code: string;
  name: string;
  category: string;
  description: string | null;
  imageUrl: string | null;
  barcodeType: string;
  source: "openfoodfacts";
};

type OffV2Response = {
  status: number;
  code?: string;
  product?: {
    product_name?: string;
    generic_name?: string;
    categories?: string;
    categories_tags?: string[];
    image_front_url?: string;
  };
};

/**
 * Looks up a packaged product by GTIN / EAN (digits only).
 * Uses the public Open Food Facts API (no API key; identify via User-Agent).
 */
export async function lookupOpenFoodFactsByCode(rawCode: string): Promise<OpenFoodFactsLookupResult | null> {
  const code = rawCode.replace(/\s+/g, "");
  if (!/^\d{4,14}$/.test(code)) {
    throw new HttpError(
      400,
      "Open Food Facts expects a numeric package barcode (4–14 digits), e.g. EAN-13 under the bar.",
    );
  }

  const url = `${OFF_API}/${encodeURIComponent(code)}.json`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": defaultUserAgent(),
      },
    });
  } catch {
    throw new HttpError(502, "Could not reach Open Food Facts. Check your network and try again.");
  }

  if (!res.ok) {
    throw new HttpError(502, "Open Food Facts returned an error. Try again later.");
  }

  let body: OffV2Response;
  try {
    body = (await res.json()) as OffV2Response;
  } catch {
    throw new HttpError(502, "Invalid response from Open Food Facts.");
  }

  if (body.status !== 1 || !body.product) {
    return null;
  }

  const p = body.product;
  const name = (p.product_name ?? "").trim();
  if (!name) {
    return null;
  }

  const fromTags = prettyCategoryFromTags(p.categories_tags);
  let category = fromTags ?? "Groceries";
  if (!fromTags && p.categories?.trim()) {
    const first = p.categories.split(",")[0]?.trim();
    if (first) {
      category = first.length > 80 ? `${first.slice(0, 77)}...` : first;
    }
  }

  const description = (p.generic_name ?? "").trim() || null;
  const imageUrl = (p.image_front_url ?? "").trim() || null;

  return {
    code,
    name,
    category,
    description,
    imageUrl,
    barcodeType: inferBarcodeType(code),
    source: "openfoodfacts",
  };
}
