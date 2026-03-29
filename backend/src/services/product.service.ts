import { randomBytes, randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { inferBarcodeType } from "./barcode-type.service.js";

const BARCODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeIndustryLabel(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isRetailOrWholesaleIndustry(industry: string | null | undefined): boolean {
  const normalized = normalizeIndustryLabel(industry);
  return normalized === "retail" || normalized === "wholesale";
}

function productPublicPath(productId: string): string {
  return `/p/${productId}`;
}

export function buildProductQrUrl(productId: string): string {
  const base = (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");
  return `${base}${productPublicPath(productId)}`;
}

export function generateAlphanumericBarcode(length = 12): string {
  const bytes = randomBytes(length);
  let value = "";
  for (let i = 0; i < length; i++) {
    value += BARCODE_ALPHABET[bytes[i]! % BARCODE_ALPHABET.length];
  }
  return value;
}

async function generateUniqueBarcode(businessId: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generateAlphanumericBarcode(12);
    const existing = await prisma.product.findFirst({
      where: { businessId, barcodeValue: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }
  throw new HttpError(500, "Could not allocate a unique barcode. Try again.");
}

async function assertWithinProductLimit(businessId: string): Promise<void> {
  const subscription = await prisma.subscription.findFirst({
    where: { businessId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });

  if (!subscription) {
    return;
  }

  const count = await prisma.product.count({ where: { businessId } });
  if (count >= subscription.plan.productLimit) {
    throw new HttpError(
      403,
      `This plan allows up to ${subscription.plan.productLimit} products.`,
    );
  }
}

export type CreateProductInput = {
  businessId: string;
  name: string;
  category: string;
  description?: string | null;
  price: number;
  stock: number;
  barcodeValue?: string | null;
  qrUrl?: string | null;
  imageUrl?: string | null;
  imageColor?: string | null;
  imageEmoji?: string | null;
};

/** Strips emoji so values fit legacy PostgreSQL encodings (e.g. WIN1252). Display fallback lives in the UI. */
function normalizeStoredImageEmoji(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/\p{Extended_Pictographic}/gu, "").trim();
}

function normalizeOptionalHttpsImageUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new HttpError(400, "Image URL must be a valid URL.");
  }

  const isLocalHttp =
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]");

  if (parsed.protocol !== "https:" && !isLocalHttp) {
    throw new HttpError(400, "Image URL must use https:// (or http:// for localhost).");
  }

  return trimmed;
}

export async function createProduct(input: CreateProductInput) {
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
  });

  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

  if (!isRetailOrWholesaleIndustry(business.industry)) {
    throw new HttpError(
      403,
      "Products with barcodes are only available for Retail or Wholesale businesses in this phase.",
    );
  }

  await assertWithinProductLimit(input.businessId);

  const trimmedBarcode = input.barcodeValue?.trim();
  if (trimmedBarcode && !/^[A-Za-z0-9]{4,48}$/.test(trimmedBarcode)) {
    throw new HttpError(400, "Barcode must be 4–48 alphanumeric characters (A–Z, a–z, 0–9).");
  }

  const barcodeValue = trimmedBarcode || (await generateUniqueBarcode(input.businessId));

  const existingBarcode = await prisma.product.findFirst({
    where: { businessId: input.businessId, barcodeValue },
    select: { id: true },
  });
  if (existingBarcode) {
    throw new HttpError(409, "This barcode is already used for another product in this business.");
  }

  const productId = randomUUID();

  let qrUrl: string;
  if (input.qrUrl?.trim()) {
    qrUrl = input.qrUrl.trim();
    if (!/^https?:\/\//i.test(qrUrl)) {
      throw new HttpError(400, "QR URL must start with http:// or https://");
    }
  } else {
    qrUrl = buildProductQrUrl(productId);
  }

  const existingQr = await prisma.product.findFirst({
    where: { businessId: input.businessId, qrUrl },
    select: { id: true },
  });
  if (existingQr) {
    throw new HttpError(409, "This QR URL is already used for another product in this business.");
  }

  const imageUrl = normalizeOptionalHttpsImageUrl(input.imageUrl);

  const product = await prisma.product.create({
    data: {
      id: productId,
      businessId: input.businessId,
      name: input.name.trim(),
      category: input.category.trim(),
      description: input.description?.trim() || null,
      price: new Prisma.Decimal(input.price),
      stock: input.stock,
      barcodeType: inferBarcodeType(barcodeValue),
      barcodeValue,
      qrUrl,
      imageUrl,
      imageColor: input.imageColor?.trim() || "bg-slate-100",
      imageEmoji: normalizeStoredImageEmoji(input.imageEmoji),
    },
  });

  return product;
}

export type UpdateProductInput = {
  businessId: string;
  productId: string;
  name?: string;
  category?: string;
  description?: string | null;
  price?: number;
  stock?: number;
  barcodeValue?: string;
  qrUrl?: string;
  imageUrl?: string | null;
  imageColor?: string | null;
  imageEmoji?: string | null;
};

export async function updateProduct(input: UpdateProductInput) {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, businessId: input.businessId },
    include: { business: true },
  });

  if (!product) {
    throw new HttpError(404, "Product not found.");
  }

  if (!isRetailOrWholesaleIndustry(product.business.industry)) {
    throw new HttpError(
      403,
      "Products are only available for Retail or Wholesale businesses in this phase.",
    );
  }

  if (input.barcodeValue !== undefined) {
    const trimmed = input.barcodeValue.trim();
    if (!/^[A-Za-z0-9]{4,48}$/.test(trimmed)) {
      throw new HttpError(400, "Barcode must be 4–48 alphanumeric characters (A–Z, a–z, 0–9).");
    }
    if (trimmed !== product.barcodeValue) {
      const clash = await prisma.product.findFirst({
        where: {
          businessId: input.businessId,
          barcodeValue: trimmed,
          NOT: { id: product.id },
        },
        select: { id: true },
      });
      if (clash) {
        throw new HttpError(409, "This barcode is already used for another product in this business.");
      }
    }
  }

  if (input.qrUrl !== undefined) {
    const q = input.qrUrl.trim();
    if (!/^https?:\/\//i.test(q)) {
      throw new HttpError(400, "QR URL must start with http:// or https://");
    }
    if (q !== product.qrUrl) {
      const clash = await prisma.product.findFirst({
        where: {
          businessId: input.businessId,
          qrUrl: q,
          NOT: { id: product.id },
        },
        select: { id: true },
      });
      if (clash) {
        throw new HttpError(409, "This QR URL is already used for another product in this business.");
      }
    }
  }

  let nextImageUrl: string | null | undefined;
  if (input.imageUrl !== undefined) {
    if (input.imageUrl === null || input.imageUrl.trim() === "") {
      nextImageUrl = null;
    } else {
      nextImageUrl = normalizeOptionalHttpsImageUrl(input.imageUrl);
    }
  }

  const data: Prisma.ProductUpdateInput = {};

  if (input.name !== undefined) {
    data.name = input.name.trim();
  }
  if (input.category !== undefined) {
    data.category = input.category.trim();
  }
  if (input.description !== undefined) {
    data.description = input.description === null ? null : input.description.trim() || null;
  }
  if (input.price !== undefined) {
    data.price = new Prisma.Decimal(input.price);
  }
  if (input.stock !== undefined) {
    data.stock = input.stock;
  }
  if (input.barcodeValue !== undefined) {
    const trimmed = input.barcodeValue.trim();
    data.barcodeValue = trimmed;
    data.barcodeType = inferBarcodeType(trimmed);
  }
  if (input.qrUrl !== undefined) {
    data.qrUrl = input.qrUrl.trim();
  }
  if (input.imageUrl !== undefined) {
    data.imageUrl = nextImageUrl ?? null;
  }
  if (input.imageColor !== undefined) {
    data.imageColor = input.imageColor?.trim() || "bg-slate-100";
  }
  if (input.imageEmoji !== undefined) {
    data.imageEmoji = normalizeStoredImageEmoji(input.imageEmoji);
  }

  return prisma.product.update({
    where: { id: product.id },
    data,
  });
}

export async function listProductsForBusiness(businessId: string) {
  return prisma.product.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPublicBusinessMenu(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

  if (!isRetailOrWholesaleIndustry(business.industry)) {
    throw new HttpError(404, "Menu not available.");
  }

  const products = await prisma.product.findMany({
    where: { businessId },
    orderBy: { name: "asc" },
  });

  return { business, products };
}

export async function getPublicProductById(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      business: {
        select: { id: true, name: true, slug: true, industry: true },
      },
    },
  });

  if (!product) {
    throw new HttpError(404, "Product not found.");
  }

  if (!isRetailOrWholesaleIndustry(product.business.industry)) {
    throw new HttpError(404, "Product not found.");
  }

  return product;
}
