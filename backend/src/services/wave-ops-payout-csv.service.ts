import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  createPlatformSupplier,
  updatePlatformSupplier,
} from "./platform-bill.service.js";
import { createWaveOpsPayoutBulk, normalizeWaveMobile } from "./wave-ops.service.js";

const MAX_CSV_ROWS = 100;

const NAME_HEADERS = new Set(["name", "contact", "recipient", "supplier", "supplier_name"]);
const PHONE_HEADERS = new Set(["phone", "mobile", "number", "msisdn", "tel"]);
const AMOUNT_HEADERS = new Set(["amount", "receive_amount", "receiveamount", "payout", "value"]);
const EMAIL_HEADERS = new Set(["email", "e-mail", "mail"]);
const REF_HEADERS = new Set(["client_reference", "clientreference", "reference", "ref", "narration"]);

export type WaveOpsPayoutCsvContactAction = "create" | "update" | "match";

export type WaveOpsPayoutCsvPreviewRow = {
  line: number;
  name: string;
  phone: string;
  email: string | null;
  amount: string | null;
  clientReference: string | null;
  contactAction: WaveOpsPayoutCsvContactAction | null;
  matchedSupplierId: string | null;
  matchedSupplierName: string | null;
  error: string | null;
};

export type WaveOpsPayoutCsvPreview = {
  rows: WaveOpsPayoutCsvPreviewRow[];
  validCount: number;
  errorCount: number;
  createCount: number;
  updateCount: number;
};

function parseCsvRecords(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell.trim());
      cell = "";
      if (row.some((c) => c.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) {
    rows.push(row);
  }
  return rows;
}

function headerKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function pickColumn(headers: string[], aliases: Set<string>): number {
  return headers.findIndex((h) => aliases.has(h));
}

function parsePositiveAmount(raw: string): string | null {
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    return null;
  }
  return String(n);
}

function namesDiffer(a: string, b: string): boolean {
  return a.trim().toLowerCase() !== b.trim().toLowerCase();
}

export function previewWaveOpsPayoutCsv(csv: string, suppliers: Array<{
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}>): WaveOpsPayoutCsvPreview {
  const records = parseCsvRecords(csv);
  if (records.length < 2) {
    throw new HttpError(400, "CSV needs a header row and at least one payout row.");
  }
  const headers = records[0].map(headerKey);
  const nameIdx = pickColumn(headers, NAME_HEADERS);
  const phoneIdx = pickColumn(headers, PHONE_HEADERS);
  const amountIdx = pickColumn(headers, AMOUNT_HEADERS);
  const emailIdx = pickColumn(headers, EMAIL_HEADERS);
  const refIdx = pickColumn(headers, REF_HEADERS);
  if (nameIdx < 0 || phoneIdx < 0 || amountIdx < 0) {
    throw new HttpError(
      400,
      "CSV must include name, phone, and amount columns (optional: email, client_reference).",
    );
  }

  const byMobile = new Map<string, { id: string; name: string; email: string | null; phone: string | null }>();
  for (const s of suppliers) {
    const mobile = s.phone ? normalizeWaveMobile(s.phone) : null;
    if (mobile && !byMobile.has(mobile)) {
      byMobile.set(mobile, s);
    }
  }

  const dataRows = records.slice(1);
  if (dataRows.length > MAX_CSV_ROWS) {
    throw new HttpError(400, `CSV payouts are limited to ${MAX_CSV_ROWS} rows.`);
  }

  const rows: WaveOpsPayoutCsvPreviewRow[] = dataRows.map((cols, index) => {
    const line = index + 2;
    const name = (cols[nameIdx] ?? "").trim();
    const phoneRaw = (cols[phoneIdx] ?? "").trim();
    const email = emailIdx >= 0 ? (cols[emailIdx] ?? "").trim() || null : null;
    const amountRaw = (cols[amountIdx] ?? "").trim();
    const clientReference = refIdx >= 0 ? (cols[refIdx] ?? "").trim() || null : null;
    const amount = parsePositiveAmount(amountRaw);
    const mobile = phoneRaw ? normalizeWaveMobile(phoneRaw) : null;
    const matched = mobile ? byMobile.get(mobile) ?? null : null;

    let error: string | null = null;
    if (!name) error = "Name is required.";
    else if (!phoneRaw) error = "Phone is required.";
    else if (!mobile) error = "Phone must be an international number (e.g. +220…).";
    else if (!amount) error = "Amount must be a positive whole number (Wave does not accept decimals).";

    let contactAction: WaveOpsPayoutCsvContactAction | null = null;
    if (!error && mobile) {
      if (!matched) {
        contactAction = "create";
      } else {
        const emailIn = email?.toLowerCase() ?? "";
        const emailHad = matched.email?.trim().toLowerCase() ?? "";
        const shouldUpdate =
          namesDiffer(name, matched.name) ||
          (Boolean(email) && emailIn !== emailHad) ||
          (matched.phone ? normalizeWaveMobile(matched.phone) !== mobile : true);
        contactAction = shouldUpdate ? "update" : "match";
      }
    }

    return {
      line,
      name,
      phone: mobile ?? phoneRaw,
      email,
      amount,
      clientReference,
      contactAction,
      matchedSupplierId: matched?.id ?? null,
      matchedSupplierName: matched?.name ?? null,
      error,
    };
  });

  return {
    rows,
    validCount: rows.filter((r) => !r.error).length,
    errorCount: rows.filter((r) => r.error).length,
    createCount: rows.filter((r) => r.contactAction === "create").length,
    updateCount: rows.filter((r) => r.contactAction === "update").length,
  };
}

export async function previewWaveOpsPayoutCsvFromText(csv: string): Promise<WaveOpsPayoutCsvPreview> {
  const suppliers = await prisma.platformSupplier.findMany({
    select: { id: true, name: true, email: true, phone: true },
  });
  return previewWaveOpsPayoutCsv(csv, suppliers);
}

export async function applyWaveOpsPayoutCsv(input: {
  csv: string;
  aggregatedMerchantId?: string | null;
}) {
  const preview = await previewWaveOpsPayoutCsvFromText(input.csv);
  if (preview.rows.length === 0) {
    throw new HttpError(400, "CSV has no payout rows.");
  }
  if (preview.errorCount > 0) {
    throw new HttpError(400, "Fix CSV row errors before submitting the batch.");
  }

  const items: Array<{ supplierId: string; receiveAmount: string; clientReference: string | null }> = [];
  const createdByMobile = new Map<string, string>();
  for (const row of preview.rows) {
    if (!row.amount || !row.phone || !row.name) {
      throw new HttpError(400, `Row ${row.line} is incomplete.`);
    }
    let supplierId = row.matchedSupplierId ?? createdByMobile.get(row.phone) ?? null;
    if (!supplierId) {
      const created = await createPlatformSupplier({
        name: row.name,
        email: row.email,
        phone: row.phone,
      });
      supplierId = created.id;
      createdByMobile.set(row.phone, supplierId);
    } else if (row.contactAction === "update") {
      await updatePlatformSupplier(supplierId, {
        name: row.name,
        ...(row.email ? { email: row.email } : {}),
        phone: row.phone,
      });
    } else {
      createdByMobile.set(row.phone, supplierId);
    }
    items.push({
      supplierId,
      receiveAmount: row.amount,
      clientReference: row.clientReference,
    });
  }

  return createWaveOpsPayoutBulk({
    aggregatedMerchantId: input.aggregatedMerchantId,
    items,
  });
}
