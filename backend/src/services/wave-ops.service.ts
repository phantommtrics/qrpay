import { randomUUID } from "crypto";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  isPlatformWaveCheckoutConfigured,
  waveServiceFromEnv,
} from "./wave-client-env.js";
import {
  WAVE_UNASSIGNED_MERCHANT_ID,
  collectAllWaveOpsTransactions,
  collectWaveOpsTransactionPage,
  decodeWaveOpsTxCursor,
  resolveWaveOpsTxRange,
  waveOpsDatesForRange,
} from "./wave-ops-transactions.util.js";
import type { WavePayout, WavePayoutRequest, WaveTransaction } from "./wave-payment.service.js";

/** Normalize to E.164-ish mobile for Wave (`+` prefix required). */
export function normalizeWaveMobile(input: string): string | null {
  let s = input.trim().replace(/[\s()-]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) {
    s = `+${s.slice(2)}`;
  } else if (!s.startsWith("+")) {
    if (/^\d{7,15}$/.test(s)) {
      s = `+${s}`;
    } else {
      return null;
    }
  }
  if (!/^\+\d{7,15}$/.test(s)) return null;
  return s;
}

const WAVE_OPS_PAYOUT_INCLUDE = {
  supplier: { select: { id: true, name: true, phone: true } },
  bill: { select: { id: true, publicCode: true } },
  batch: { select: { id: true, waveBatchId: true, status: true } },
  business: { select: { id: true, name: true } },
} as const;

function parseAmount(raw: string | number): string {
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new HttpError(400, "Amount must be a positive number.");
  }
  return String(Math.round(n * 100) / 100);
}

function mapWavePayoutFields(p: WavePayout) {
  return {
    wavePayoutId: p.id,
    status: p.status,
    currency: p.currency,
    receiveAmount: p.receive_amount,
    fee: p.fee ?? null,
    mobile: p.mobile,
    name: p.name,
    clientReference: p.client_reference ?? null,
    errorCode: p.payout_error?.error_code ?? null,
    errorMessage: p.payout_error?.error_message ?? null,
    waveTimestamp: p.timestamp ? new Date(p.timestamp) : null,
  };
}

function formatPayoutRow(row: {
  id: string;
  wavePayoutId: string | null;
  batchId: string | null;
  status: string;
  currency: string;
  receiveAmount: string;
  fee: string | null;
  mobile: string;
  name: string;
  clientReference: string | null;
  idempotencyKey: string;
  platformSupplierId: string | null;
  platformBillId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  waveTimestamp: Date | null;
  reversedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  supplier?: { id: string; name: string; phone: string | null } | null;
  bill?: { id: string; publicCode: string } | null;
  batch?: { id: string; waveBatchId: string | null; status: string } | null;
  business?: { id: string; name: string } | null;
}) {
  const reverseDeadlineMs = row.waveTimestamp
    ? row.waveTimestamp.getTime() + 3 * 24 * 60 * 60 * 1000
    : row.createdAt.getTime() + 3 * 24 * 60 * 60 * 1000;
  const canReverse =
    row.status === "succeeded" &&
    !row.reversedAt &&
    Boolean(row.wavePayoutId) &&
    !row.business &&
    Date.now() < reverseDeadlineMs;

  return {
    id: row.id,
    wavePayoutId: row.wavePayoutId,
    batchId: row.batchId,
    status: row.status,
    currency: row.currency,
    receiveAmount: row.receiveAmount,
    fee: row.fee,
    mobile: row.mobile,
    name: row.name,
    clientReference: row.clientReference,
    idempotencyKey: row.idempotencyKey,
    platformSupplierId: row.platformSupplierId,
    platformBillId: row.platformBillId,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    waveTimestamp: row.waveTimestamp?.toISOString() ?? null,
    reversedAt: row.reversedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canReverse,
    reverseDeadline: new Date(reverseDeadlineMs).toISOString(),
    supplier: row.supplier
      ? { id: row.supplier.id, name: row.supplier.name, phone: row.supplier.phone }
      : null,
    bill: row.bill
      ? { id: row.bill.id, publicCode: row.bill.publicCode }
      : null,
    batch: row.batch
      ? {
          id: row.batch.id,
          waveBatchId: row.batch.waveBatchId,
          status: row.batch.status,
        }
      : null,
    business: row.business
      ? { id: row.business.id, name: row.business.name }
      : null,
    kind: row.business ? ("self_settlement" as const) : ("ops" as const),
  };
}

export async function getWaveOpsBalance() {
  if (!isPlatformWaveCheckoutConfigured()) {
    throw new HttpError(503, "Wave is not configured (WAVE_CHECKOUT_BEARER).");
  }
  const wave = waveServiceFromEnv();
  const balance = await wave.getBalance();
  return {
    amount: balance.amount,
    currency: balance.currency,
    retrievedAt: new Date().toISOString(),
  };
}

export async function listWaveOpsAggregatedMerchants() {
  if (!isPlatformWaveCheckoutConfigured()) {
    throw new HttpError(503, "Wave is not configured (WAVE_CHECKOUT_BEARER).");
  }
  const wave = waveServiceFromEnv();
  const items = await wave.listAllAggregatedMerchants();
  return items
    .map((m) => ({ id: m.id, name: m.name }))
    .filter((m) => m.id.trim())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export async function listWaveOpsTransactions(input: {
  date?: string;
  from?: string;
  to?: string;
  after?: string;
  merchant?: string;
  all?: boolean;
}) {
  if (!isPlatformWaveCheckoutConfigured()) {
    throw new HttpError(503, "Wave is not configured (WAVE_CHECKOUT_BEARER).");
  }
  const { from, to } = resolveWaveOpsTxRange(input);
  const dates = waveOpsDatesForRange(from, to);
  const merchant = input.merchant?.trim() || undefined;
  const wave = waveServiceFromEnv();
  const fetchPage = (date: string, after?: string) =>
    wave.listTransactions({
      date,
      ...(after ? { after } : {}),
    });

  if (input.all) {
    const items = await collectAllWaveOpsTransactions({ dates, merchant, fetchPage });
    return formatWaveOpsTransactionsResponse({
      from,
      to,
      items,
      endCursor: null,
      hasNext: false,
    });
  }

  const cursorRaw = input.after?.trim();
  const startDate = dates[0];
  if (!startDate) {
    throw new HttpError(400, "from and to (or date) must be YYYY-MM-DD.");
  }
  const cursor = cursorRaw ? decodeWaveOpsTxCursor(cursorRaw) : { date: startDate };
  const page = await collectWaveOpsTransactionPage({
    dates,
    startDate: cursor.date,
    startAfter: cursor.after,
    merchant,
    fetchPage,
  });
  return formatWaveOpsTransactionsResponse({
    from,
    to,
    items: page.items,
    endCursor: page.endCursor,
    hasNext: page.hasNext,
  });
}

function formatWaveOpsTransactionsResponse(input: {
  from: string;
  to: string;
  items: WaveTransaction[];
  endCursor: string | null;
  hasNext: boolean;
}) {
  return {
    page_info: {
      start_cursor: null as string | null,
      end_cursor: input.endCursor,
      has_next_page: input.hasNext,
    },
    date: input.from,
    from: input.from,
    to: input.to,
    items: input.items,
    unassignedMerchantId: WAVE_UNASSIGNED_MERCHANT_ID,
  };
}

export async function refundWaveOpsTransaction(transactionId: string) {
  if (!isPlatformWaveCheckoutConfigured()) {
    throw new HttpError(503, "Wave is not configured (WAVE_CHECKOUT_BEARER).");
  }
  const id = transactionId.trim();
  if (!id) throw new HttpError(400, "transactionId is required.");
  const wave = waveServiceFromEnv();
  const idempotencyKey = randomUUID();
  await wave.refundTransaction(id, idempotencyKey);
  return { ok: true, transactionId: id, idempotencyKey };
}

async function loadSupplierOrThrow(supplierId: string) {
  const supplier = await prisma.platformSupplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new HttpError(404, "Supplier contact not found.");
  const mobile = supplier.phone ? normalizeWaveMobile(supplier.phone) : null;
  if (!mobile) {
    throw new HttpError(
      400,
      `Supplier "${supplier.name}" needs a valid international mobile number (e.g. +220…).`,
    );
  }
  return { supplier, mobile };
}

export async function createWaveOpsPayout(input: {
  supplierId: string;
  receiveAmount: string | number;
  clientReference?: string | null;
  platformBillId?: string | null;
}) {
  if (!isPlatformWaveCheckoutConfigured()) {
    throw new HttpError(503, "Wave is not configured (WAVE_CHECKOUT_BEARER).");
  }
  const { supplier, mobile } = await loadSupplierOrThrow(input.supplierId);
  const wave = waveServiceFromEnv();
  const balance = await wave.getBalance();
  const receiveAmount = parseAmount(input.receiveAmount);
  const clientReference = input.clientReference?.trim() || null;
  const idempotencyKey = randomUUID();

  const local = await prisma.waveOpsPayout.create({
    data: {
      status: "processing",
      currency: balance.currency,
      receiveAmount,
      mobile,
      name: supplier.name,
      clientReference,
      idempotencyKey,
      platformSupplierId: supplier.id,
      platformBillId: input.platformBillId?.trim() || null,
    },
  });

  const payload: WavePayoutRequest = {
    currency: balance.currency,
    receive_amount: receiveAmount,
    name: supplier.name,
    mobile,
    ...(clientReference ? { client_reference: clientReference } : {}),
  };

  try {
    const result = await wave.createPayout(payload, idempotencyKey);
    const updated = await prisma.waveOpsPayout.update({
      where: { id: local.id },
      data: mapWavePayoutFields(result),
      include: WAVE_OPS_PAYOUT_INCLUDE,
    });
    return formatPayoutRow(updated);
  } catch (e) {
    const message = e instanceof HttpError ? e.message : "Wave payout failed.";
    const updated = await prisma.waveOpsPayout.update({
      where: { id: local.id },
      data: {
        status: "failed",
        errorMessage: message,
      },
      include: WAVE_OPS_PAYOUT_INCLUDE,
    });
    if (e instanceof HttpError) throw e;
    return formatPayoutRow(updated);
  }
}

export async function createWaveOpsPayoutBulk(input: {
  items: Array<{
    supplierId: string;
    receiveAmount: string | number;
    clientReference?: string | null;
    platformBillId?: string | null;
  }>;
}) {
  if (!isPlatformWaveCheckoutConfigured()) {
    throw new HttpError(503, "Wave is not configured (WAVE_CHECKOUT_BEARER).");
  }
  if (!input.items.length) {
    throw new HttpError(400, "Add at least one payout item.");
  }
  if (input.items.length > 100) {
    throw new HttpError(400, "Bulk payouts are limited to 100 items.");
  }

  const wave = waveServiceFromEnv();
  const balance = await wave.getBalance();
  const batchIdempotencyKey = randomUUID();

  const prepared: Array<{
    supplierId: string;
    platformBillId: string | null;
    clientReference: string | null;
    receiveAmount: string;
    mobile: string;
    name: string;
    rowIdempotencyKey: string;
    payload: WavePayoutRequest;
  }> = [];

  for (const item of input.items) {
    const { supplier, mobile } = await loadSupplierOrThrow(item.supplierId);
    const receiveAmount = parseAmount(item.receiveAmount);
    const clientReference = item.clientReference?.trim() || null;
    const rowIdempotencyKey = randomUUID();
    prepared.push({
      supplierId: supplier.id,
      platformBillId: item.platformBillId?.trim() || null,
      clientReference,
      receiveAmount,
      mobile,
      name: supplier.name,
      rowIdempotencyKey,
      payload: {
        currency: balance.currency,
        receive_amount: receiveAmount,
        name: supplier.name,
        mobile,
        ...(clientReference ? { client_reference: clientReference } : {}),
      },
    });
  }

  const batch = await prisma.waveOpsPayoutBatch.create({
    data: {
      status: "processing",
      idempotencyKey: batchIdempotencyKey,
      payouts: {
        create: prepared.map((p) => ({
          status: "processing",
          currency: balance.currency,
          receiveAmount: p.receiveAmount,
          mobile: p.mobile,
          name: p.name,
          clientReference: p.clientReference,
          idempotencyKey: p.rowIdempotencyKey,
          platformSupplierId: p.supplierId,
          platformBillId: p.platformBillId,
        })),
      },
    },
    include: { payouts: true },
  });

  try {
    const waveBatch = await wave.createPayoutBatch(
      prepared.map((p) => p.payload),
      batchIdempotencyKey,
    );
    await prisma.waveOpsPayoutBatch.update({
      where: { id: batch.id },
      data: {
        waveBatchId: waveBatch.id,
        status: waveBatch.status,
      },
    });

    // Match Wave payouts to local rows by mobile+amount+order when ids arrive later via poll.
    const localRows = [...batch.payouts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const waveRows = waveBatch.payouts ?? [];
    for (let i = 0; i < localRows.length; i++) {
      const wr = waveRows[i];
      if (!wr) continue;
      await prisma.waveOpsPayout.update({
        where: { id: localRows[i].id },
        data: mapWavePayoutFields(wr),
      });
    }

    return getWaveOpsPayoutBatch(batch.id);
  } catch (e) {
    const message = e instanceof HttpError ? e.message : "Wave payout batch failed.";
    await prisma.waveOpsPayoutBatch.update({
      where: { id: batch.id },
      data: { status: "failed" },
    });
    await prisma.waveOpsPayout.updateMany({
      where: { batchId: batch.id },
      data: { status: "failed", errorMessage: message },
    });
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, message);
  }
}

export async function listWaveOpsPayouts(input?: {
  status?: string;
  supplierId?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
  const rows = await prisma.waveOpsPayout.findMany({
    where: {
      ...(input?.status?.trim() ? { status: input.status.trim() } : {}),
      ...(input?.supplierId?.trim()
        ? { platformSupplierId: input.supplierId.trim() }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: WAVE_OPS_PAYOUT_INCLUDE,
  });
  return rows.map(formatPayoutRow);
}

export async function searchWaveOpsPayoutsByClientReference(clientReference: string) {
  if (!isPlatformWaveCheckoutConfigured()) {
    throw new HttpError(503, "Wave is not configured (WAVE_CHECKOUT_BEARER).");
  }
  const ref = clientReference.trim();
  if (!ref) throw new HttpError(400, "client_reference is required.");

  const wave = waveServiceFromEnv();
  const found = await wave.searchPayouts({ client_reference: ref });

  const upserted = [];
  for (const p of found) {
    const existing = p.id
      ? await prisma.waveOpsPayout.findFirst({
          where: { OR: [{ wavePayoutId: p.id }, { clientReference: ref }] },
        })
      : null;

    const data = {
      ...mapWavePayoutFields(p),
      clientReference: p.client_reference ?? ref,
      idempotencyKey: existing?.idempotencyKey ?? `search-${p.id || randomUUID()}`,
      mobile: p.mobile,
      name: p.name,
      currency: p.currency,
      receiveAmount: p.receive_amount,
    };

    const row = existing
      ? await prisma.waveOpsPayout.update({
          where: { id: existing.id },
          data,
          include: WAVE_OPS_PAYOUT_INCLUDE,
        })
      : await prisma.waveOpsPayout.create({
          data,
          include: WAVE_OPS_PAYOUT_INCLUDE,
        });
    upserted.push(formatPayoutRow(row));
  }

  if (!upserted.length) {
    const local = await prisma.waveOpsPayout.findMany({
      where: { clientReference: ref },
      include: WAVE_OPS_PAYOUT_INCLUDE,
    });
    return local.map(formatPayoutRow);
  }

  return upserted;
}

export async function getWaveOpsPayout(id: string, opts?: { refresh?: boolean }) {
  const row = await prisma.waveOpsPayout.findUnique({
    where: { id },
    include: WAVE_OPS_PAYOUT_INCLUDE,
  });
  if (!row) throw new HttpError(404, "Payout not found.");

  if (opts?.refresh && row.wavePayoutId && isPlatformWaveCheckoutConfigured()) {
    try {
      const wave = waveServiceFromEnv();
      const remote = await wave.getPayout(row.wavePayoutId);
      const updated = await prisma.waveOpsPayout.update({
        where: { id: row.id },
        data: mapWavePayoutFields(remote),
        include: WAVE_OPS_PAYOUT_INCLUDE,
      });
      return formatPayoutRow(updated);
    } catch {
      // Return local if refresh fails.
    }
  }

  return formatPayoutRow(row);
}

export async function reverseWaveOpsPayout(id: string) {
  if (!isPlatformWaveCheckoutConfigured()) {
    throw new HttpError(503, "Wave is not configured (WAVE_CHECKOUT_BEARER).");
  }
  const row = await prisma.waveOpsPayout.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, "Payout not found.");
  if (!row.wavePayoutId) throw new HttpError(400, "Payout has no Wave id to reverse.");
  if (row.businessId) {
    throw new HttpError(400, "Self-settlement payouts cannot be reversed from Wave Operations.");
  }
  if (row.status !== "succeeded") {
    throw new HttpError(400, "Only succeeded payouts can be reversed.");
  }
  if (row.reversedAt) {
    return getWaveOpsPayout(id);
  }

  const anchor = row.waveTimestamp ?? row.createdAt;
  const deadline = anchor.getTime() + 3 * 24 * 60 * 60 * 1000;
  if (Date.now() > deadline) {
    throw new HttpError(400, "Payout reverse window (3 days) has expired.");
  }

  const wave = waveServiceFromEnv();
  const idempotencyKey = randomUUID();
  await wave.reversePayout(row.wavePayoutId, idempotencyKey);

  await prisma.waveOpsPayout.update({
    where: { id: row.id },
    data: { reversedAt: new Date(), status: "reversed" },
  });

  return getWaveOpsPayout(id);
}

export async function listWaveOpsPayoutBatches(limit = 50) {
  const take = Math.min(Math.max(limit, 1), 100);
  const batches = await prisma.waveOpsPayoutBatch.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: {
      payouts: {
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          bill: { select: { id: true, publicCode: true } },
          business: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return batches.map((b) => ({
    id: b.id,
    waveBatchId: b.waveBatchId,
    status: b.status,
    idempotencyKey: b.idempotencyKey,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    payoutCount: b.payouts.length,
    payouts: b.payouts.map((p) =>
      formatPayoutRow({
        ...p,
        batch: { id: b.id, waveBatchId: b.waveBatchId, status: b.status },
      }),
    ),
  }));
}

export async function getWaveOpsPayoutBatch(id: string) {
  const batch = await prisma.waveOpsPayoutBatch.findUnique({
    where: { id },
    include: {
      payouts: {
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          bill: { select: { id: true, publicCode: true } },
          business: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!batch) throw new HttpError(404, "Payout batch not found.");

  if (
    batch.waveBatchId &&
    batch.status !== "complete" &&
    isPlatformWaveCheckoutConfigured()
  ) {
    try {
      const wave = waveServiceFromEnv();
      const remote = await wave.getPayoutBatch(batch.waveBatchId);
      await prisma.waveOpsPayoutBatch.update({
        where: { id: batch.id },
        data: { status: remote.status },
      });

      const localRows = [...batch.payouts];
      const waveRows = remote.payouts ?? [];
      for (let i = 0; i < localRows.length; i++) {
        const wr = waveRows[i];
        if (!wr) continue;
        // Prefer match by wave id if already known
        const byId = wr.id
          ? localRows.find((r) => r.wavePayoutId === wr.id)
          : undefined;
        const target = byId ?? localRows[i];
        await prisma.waveOpsPayout.update({
          where: { id: target.id },
          data: mapWavePayoutFields(wr),
        });
      }

      return getWaveOpsPayoutBatchFresh(id);
    } catch {
      // fall through to local
    }
  }

  return {
    id: batch.id,
    waveBatchId: batch.waveBatchId,
    status: batch.status,
    idempotencyKey: batch.idempotencyKey,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    payoutCount: batch.payouts.length,
    payouts: batch.payouts.map((p) =>
      formatPayoutRow({
        ...p,
        batch: { id: batch.id, waveBatchId: batch.waveBatchId, status: batch.status },
      }),
    ),
  };
}

async function getWaveOpsPayoutBatchFresh(id: string) {
  const batch = await prisma.waveOpsPayoutBatch.findUnique({
    where: { id },
    include: {
      payouts: {
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          bill: { select: { id: true, publicCode: true } },
          business: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!batch) throw new HttpError(404, "Payout batch not found.");
  return {
    id: batch.id,
    waveBatchId: batch.waveBatchId,
    status: batch.status,
    idempotencyKey: batch.idempotencyKey,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    payoutCount: batch.payouts.length,
    payouts: batch.payouts.map((p) =>
      formatPayoutRow({
        ...p,
        batch: { id: batch.id, waveBatchId: batch.waveBatchId, status: batch.status },
      }),
    ),
  };
}

/** Used by bill bulk-pay: sync Wave single payout + optional local audit. */
export async function sendWavePayoutForBill(input: {
  supplierId: string;
  supplierName: string;
  mobile: string;
  receiveAmount: string;
  currency: string;
  platformBillId: string;
  clientReference?: string;
}): Promise<{ wavePayoutId: string; status: string }> {
  if (!isPlatformWaveCheckoutConfigured()) {
    throw new HttpError(503, "Wave is not configured (WAVE_CHECKOUT_BEARER).");
  }
  const mobile = normalizeWaveMobile(input.mobile);
  if (!mobile) {
    throw new HttpError(400, "Supplier mobile number is invalid for Wave payout.");
  }

  const wave = waveServiceFromEnv();
  const balance = await wave.getBalance();
  if (balance.currency.toUpperCase() !== input.currency.trim().toUpperCase()) {
    throw new HttpError(
      400,
      `Bill currency ${input.currency} does not match Wave wallet currency ${balance.currency}.`,
    );
  }

  const receiveAmount = parseAmount(input.receiveAmount);
  const idempotencyKey = randomUUID();
  const clientReference = input.clientReference?.trim() || null;

  const local = await prisma.waveOpsPayout.create({
    data: {
      status: "processing",
      currency: balance.currency,
      receiveAmount,
      mobile,
      name: input.supplierName,
      clientReference,
      idempotencyKey,
      platformSupplierId: input.supplierId,
      platformBillId: input.platformBillId,
    },
  });

  const result = await wave.createPayout(
    {
      currency: balance.currency,
      receive_amount: receiveAmount,
      name: input.supplierName,
      mobile,
      ...(clientReference ? { client_reference: clientReference } : {}),
    },
    idempotencyKey,
  );

  await prisma.waveOpsPayout.update({
    where: { id: local.id },
    data: mapWavePayoutFields(result),
  });

  if (result.status === "failed") {
    throw new HttpError(
      502,
      result.payout_error?.error_message || "Wave payout failed.",
    );
  }

  return { wavePayoutId: result.id, status: result.status };
}

/** Local Wave-ops copy of an aggregator self-settlement payout (same list as supplier payouts). */
export async function upsertWaveOpsPayoutForSelfSettlement(input: {
  businessId: string;
  wavePayoutId: string;
  status: string;
  currency: string;
  receiveAmount: string;
  fee: string | null;
  mobile: string;
  name: string;
  clientReference: string | null;
  idempotencyKey: string;
  waveTimestamp: Date | null;
}): Promise<string> {
  const existing = await prisma.waveOpsPayout.findFirst({
    where: {
      OR: [
        { wavePayoutId: input.wavePayoutId },
        { idempotencyKey: input.idempotencyKey },
      ],
    },
    select: { id: true },
  });
  const data = {
    wavePayoutId: input.wavePayoutId,
    status: input.status,
    currency: input.currency,
    receiveAmount: input.receiveAmount,
    fee: input.fee,
    mobile: input.mobile,
    name: input.name,
    clientReference: input.clientReference,
    businessId: input.businessId,
    waveTimestamp: input.waveTimestamp,
  };
  if (existing) {
    await prisma.waveOpsPayout.update({
      where: { id: existing.id },
      data,
    });
    return existing.id;
  }
  const created = await prisma.waveOpsPayout.create({
    data: {
      ...data,
      idempotencyKey: input.idempotencyKey,
    },
  });
  return created.id;
}
