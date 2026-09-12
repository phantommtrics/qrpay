import {
  MerchantSettlementRequestStatus,
  Prisma,
  SalesLedgerEntryType,
  SalesLedgerStatus,
} from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  CHART_CODE_MERCHANT_WALLET_CLEARING,
  CHART_CODE_QR_WALLET_PROCESSING_FEES,
} from "./chart-of-accounts.service.js";
import { getAccountingSummaryForBusiness } from "./accounting-summary.service.js";
import { createTicketingTicket, getTicketingTicket, TicketingError } from "./ticketing/client.js";

function money2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toHttpError(error: unknown): never {
  if (error instanceof TicketingError) {
    throw new HttpError(error.status, error.message);
  }
  throw error;
}

export type MerchantSettlementSummary = {
  currency: string;
  clearingBalance: number;
  openRequestTotal: number;
  availableForSettlement: number;
  walletFeesIncurred: number;
  walletFeeExpenseBalance: number;
};

export type MerchantSettlementRequestRow = {
  id: string;
  amount: number;
  currency: string;
  note: string | null;
  status: MerchantSettlementRequestStatus;
  ticketingRef: string | null;
  ticketingTicketId: string | null;
  requestedByName: string | null;
  createdAt: string;
};

async function sumOpenRequests(businessId: string): Promise<number> {
  const agg = await prisma.merchantSettlementRequest.aggregate({
    where: {
      businessId,
      status: MerchantSettlementRequestStatus.OPEN,
    },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

async function sumWalletFees(businessId: string): Promise<number> {
  const agg = await prisma.salesLedgerEntry.aggregate({
    where: {
      businessId,
      status: SalesLedgerStatus.SUCCEEDED,
      // POS / guest invoice wallet fees only — not Wave auto self-settlement checkout fees.
      type: SalesLedgerEntryType.WALLET_FEE,
    },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

export async function getMerchantSettlementSummary(
  businessId: string,
): Promise<MerchantSettlementSummary> {
  const summary = await getAccountingSummaryForBusiness(businessId);
  const clearing = summary.cashPositions.find((a) => a.code === CHART_CODE_MERCHANT_WALLET_CLEARING);
  const feeExpense = summary.accounts.find(
    (a) => a.code === CHART_CODE_QR_WALLET_PROCESSING_FEES,
  );

  const clearingBalance = money2(Math.max(0, clearing?.balance ?? 0));
  const openRequestTotal = money2(await sumOpenRequests(businessId));
  const availableForSettlement = money2(Math.max(0, clearingBalance - openRequestTotal));
  const walletFeesIncurred = money2(await sumWalletFees(businessId));
  const walletFeeExpenseBalance = money2(Math.max(0, feeExpense?.balance ?? 0));

  return {
    currency: "GMD",
    clearingBalance,
    openRequestTotal,
    availableForSettlement,
    walletFeesIncurred,
    walletFeeExpenseBalance,
  };
}

function formatRequestRow(row: {
  id: string;
  amount: Prisma.Decimal;
  currency: string;
  note: string | null;
  status: MerchantSettlementRequestStatus;
  ticketingRef: string | null;
  ticketingTicketId: string | null;
  createdAt: Date;
  requestedBy: { name: string } | null;
}): MerchantSettlementRequestRow {
  return {
    id: row.id,
    amount: Number(row.amount),
    currency: row.currency,
    note: row.note,
    status: row.status,
    ticketingRef: row.ticketingRef,
    ticketingTicketId: row.ticketingTicketId,
    requestedByName: row.requestedBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listMerchantSettlementRequests(
  businessId: string,
  options: { from?: string | null; to?: string | null } = {},
): Promise<{ rows: MerchantSettlementRequestRow[]; total: number; from: string | null; to: string | null }> {
  const fromKey = options.from?.trim() || null;
  const toKey = options.to?.trim() || null;

  if (fromKey && !/^\d{4}-\d{2}-\d{2}$/.test(fromKey)) {
    throw new HttpError(400, "Invalid from date.");
  }
  if (toKey && !/^\d{4}-\d{2}-\d{2}$/.test(toKey)) {
    throw new HttpError(400, "Invalid to date.");
  }
  if (fromKey && toKey && fromKey > toKey) {
    throw new HttpError(400, "From date must be on or before to date.");
  }

  const createdAt: Prisma.DateTimeFilter = {};
  if (fromKey) {
    createdAt.gte = new Date(`${fromKey}T00:00:00.000Z`);
  }
  if (toKey) {
    createdAt.lte = new Date(`${toKey}T23:59:59.999Z`);
  }

  const where: Prisma.MerchantSettlementRequestWhereInput = {
    businessId,
    ...(fromKey || toKey ? { createdAt } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.merchantSettlementRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { requestedBy: { select: { name: true } } },
    }),
    prisma.merchantSettlementRequest.count({ where }),
  ]);

  return {
    rows: rows.map(formatRequestRow),
    total,
    from: fromKey,
    to: toKey,
  };
}

export async function createMerchantSettlementRequest(input: {
  businessId: string;
  amount: number;
  note: string | null;
  requestedByUserId: string;
}): Promise<MerchantSettlementRequestRow> {
  const amount = money2(input.amount);
  if (!(amount > 0)) {
    throw new HttpError(400, "Enter a valid amount.");
  }

  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: {
      id: true,
      name: true,
      slug: true,
      ownerName: true,
      ownerEmail: true,
    },
  });
  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

  const requester = await prisma.user.findUnique({
    where: { id: input.requestedByUserId },
    select: { id: true, name: true, email: true },
  });
  if (!requester) {
    throw new HttpError(404, "User not found.");
  }

  const settlement = await getMerchantSettlementSummary(input.businessId);
  if (amount > settlement.availableForSettlement + 0.001) {
    throw new HttpError(
      400,
      `Amount exceeds available balance (${settlement.availableForSettlement.toFixed(2)} ${settlement.currency}).`,
    );
  }

  const note = input.note?.trim() ? input.note.trim().slice(0, 2000) : null;
  const summary = `DirectPay settlement — ${business.name} — ${amount.toFixed(2)} ${settlement.currency}`;
  const description = [
    "DirectPay merchant settlement / payout request",
    "",
    `Business: ${business.name}`,
    `Business ID: ${business.id}`,
    `Slug: ${business.slug}`,
    `Owner: ${business.ownerName} <${business.ownerEmail}>`,
    "",
    `Requested amount: ${amount.toFixed(2)} ${settlement.currency}`,
    `Clearing balance: ${settlement.clearingBalance.toFixed(2)} ${settlement.currency}`,
    `Open requests: ${settlement.openRequestTotal.toFixed(2)} ${settlement.currency}`,
    `Available at request: ${settlement.availableForSettlement.toFixed(2)} ${settlement.currency}`,
    `Wallet fees incurred (ledger): ${settlement.walletFeesIncurred.toFixed(2)} ${settlement.currency}`,
    "",
    `Requested by: ${requester.name} <${requester.email}>`,
    note ? `Note: ${note}` : "Note: (none)",
  ].join("\n");

  let ticket: Awaited<ReturnType<typeof createTicketingTicket>>;
  try {
    ticket = await createTicketingTicket({
      summary,
      description,
      type: "REQUEST",
      priority: "MEDIUM",
    });
  } catch (error) {
    toHttpError(error);
  }

  const row = await prisma.merchantSettlementRequest.create({
    data: {
      businessId: input.businessId,
      amount: new Prisma.Decimal(amount.toFixed(2)),
      currency: settlement.currency,
      note,
      status: MerchantSettlementRequestStatus.OPEN,
      ticketingTicketId: ticket.id,
      ticketingRef: ticket.ref,
      requestedByUserId: input.requestedByUserId,
    },
    include: { requestedBy: { select: { name: true } } },
  });

  return formatRequestRow(row);
}

export type MerchantSettlementRequestDetail = MerchantSettlementRequestRow & {
  desklineStatus: string | null;
  desklineSummary: string | null;
  comments: Array<{
    id: string;
    body: string;
    authorName: string;
    createdAt: string;
  }>;
  statusChanges: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    actorName: string | null;
    createdAt: string;
  }>;
};

export async function getMerchantSettlementRequestDetail(
  businessId: string,
  requestId: string,
): Promise<MerchantSettlementRequestDetail> {
  const row = await prisma.merchantSettlementRequest.findFirst({
    where: { id: requestId, businessId },
    include: { requestedBy: { select: { name: true } } },
  });
  if (!row) {
    throw new HttpError(404, "Settlement request not found.");
  }

  const base = formatRequestRow(row);
  let desklineStatus: string | null = null;
  let desklineSummary: string | null = null;
  let comments: MerchantSettlementRequestDetail["comments"] = [];
  let statusChanges: MerchantSettlementRequestDetail["statusChanges"] = [];

  if (row.ticketingTicketId) {
    try {
      const live = await getTicketingTicket(row.ticketingTicketId);
      if (live) {
        desklineStatus = live.status;
        desklineSummary = live.summary || null;
        comments = live.comments;
        statusChanges = live.statusEvents;
      }
    } catch (error) {
      if (error instanceof TicketingError && error.code === "TICKETING_NOT_CONFIGURED") {
        // Local row still returned; Deskline live data unavailable.
      } else {
        console.error("[merchant-settlement] Deskline detail refresh failed", {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    ...base,
    desklineStatus,
    desklineSummary,
    comments,
    statusChanges,
  };
}
