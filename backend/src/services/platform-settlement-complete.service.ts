import {
  MerchantSettlementRequestStatus,
  PlatformJournalSourceType,
  Prisma,
} from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { notifyBusinessOwnersOfFundTransfer } from "./business-owner-push.service.js";
import { ensureDefaultChartOfAccountsForBusiness } from "./chart-of-accounts.service.js";
import { getMerchantSettlementSummary } from "./merchant-settlement.service.js";
import { postMerchantJournalForClearingSettlement } from "./merchant-payout-journal.service.js";
import {
  ensureDefaultPlatformChartAccounts,
  PLATFORM_CHART_MERCHANT_FUND_TRANSFERS,
} from "./platform-chart-of-accounts.service.js";

function money(raw: number | string | Prisma.Decimal): Prisma.Decimal {
  const d = new Prisma.Decimal(String(raw ?? 0));
  if (!d.isFinite() || d.lte(0)) {
    return new Prisma.Decimal(0);
  }
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export type PlatformSettlementRequestRow = {
  id: string;
  businessId: string;
  businessName: string;
  amount: number;
  currency: string;
  note: string | null;
  status: MerchantSettlementRequestStatus;
  ticketingRef: string | null;
  ticketingTicketId: string | null;
  requestedByName: string | null;
  createdAt: string;
  completedAt: string | null;
  platformJournalId: string | null;
  clearingBalance: number | null;
};

export async function listPlatformSettlementRequests(options: {
  status?: MerchantSettlementRequestStatus | "ALL";
  take?: number;
}): Promise<PlatformSettlementRequestRow[]> {
  const filterStatus = options.status ?? MerchantSettlementRequestStatus.OPEN;
  const take = Math.min(Math.max(options.take ?? 100, 1), 500);

  const rows = await prisma.merchantSettlementRequest.findMany({
    where: filterStatus === "ALL" ? {} : { status: filterStatus },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      business: { select: { id: true, name: true } },
      requestedBy: { select: { name: true } },
    },
  });

  const summaryByBusiness = new Map<string, number>();
  if (filterStatus === MerchantSettlementRequestStatus.OPEN || filterStatus === "ALL") {
    const businessIds = [...new Set(rows.map((r) => r.businessId))];
    await Promise.all(
      businessIds.map(async (businessId) => {
        const summary = await getMerchantSettlementSummary(businessId);
        summaryByBusiness.set(businessId, summary.clearingBalance);
      }),
    );
  }

  return rows.map((row) => ({
    id: row.id,
    businessId: row.businessId,
    businessName: row.business.name,
    amount: Number(row.amount),
    currency: row.currency,
    note: row.note,
    status: row.status,
    ticketingRef: row.ticketingRef,
    ticketingTicketId: row.ticketingTicketId,
    requestedByName: row.requestedBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    platformJournalId: row.platformJournalId,
    clearingBalance: summaryByBusiness.get(row.businessId) ?? null,
  }));
}

/**
 * Platform admin completes a merchant settlement request:
 * platform fund transfer expense + merchant Dr PLATFORM_FUND_TRANSFERS / Cr MERCHANT_WALLET_CLEARING,
 * then marks the request COMPLETED.
 */
export async function completePlatformSettlementRequest(input: {
  requestId: string;
  platformCreditAccountId: string;
  postedAt: string;
  memo?: string | null;
  reference?: string | null;
  completedByUserId: string;
}) {
  const request = await prisma.merchantSettlementRequest.findUnique({
    where: { id: input.requestId },
    include: { business: { select: { id: true, name: true } } },
  });
  if (!request) {
    throw new HttpError(404, "Settlement request not found.");
  }
  if (request.status !== MerchantSettlementRequestStatus.OPEN) {
    throw new HttpError(400, "Only open settlement requests can be completed.");
  }
  if (request.platformJournalId) {
    throw new HttpError(400, "This request is already linked to a settlement journal.");
  }

  const amount = money(request.amount);
  if (amount.lte(0)) {
    throw new HttpError(400, "Settlement amount is invalid.");
  }

  const summary = await getMerchantSettlementSummary(request.businessId);
  if (amount.gt(new Prisma.Decimal(summary.clearingBalance.toFixed(2)))) {
    throw new HttpError(
      400,
      `Clearing balance (${summary.clearingBalance.toFixed(2)} ${request.currency}) is below the request amount.`,
    );
  }

  const postedAt = new Date(`${input.postedAt.trim()}T12:00:00.000Z`);
  if (Number.isNaN(postedAt.getTime())) {
    throw new HttpError(400, "Invalid posted date.");
  }

  await ensureDefaultPlatformChartAccounts(prisma);
  await ensureDefaultChartOfAccountsForBusiness(prisma, request.businessId);

  const [creditAccount, expenseAccount] = await Promise.all([
    prisma.platformChartOfAccount.findUnique({
      where: { id: input.platformCreditAccountId.trim() },
    }),
    prisma.platformChartOfAccount.findUnique({
      where: { code: PLATFORM_CHART_MERCHANT_FUND_TRANSFERS },
    }),
  ]);
  if (!creditAccount) {
    throw new HttpError(400, "Platform account to credit was not found.");
  }
  if (!expenseAccount) {
    throw new HttpError(500, "Platform settlement expense account is missing.");
  }
  if (creditAccount.id === expenseAccount.id) {
    throw new HttpError(400, "Choose a different platform account to credit.");
  }

  const merchantName = request.business.name.trim() || request.business.id;
  const ticketBit = request.ticketingRef ? ` · ${request.ticketingRef}` : "";
  const memo =
    input.memo?.trim() ||
    `Clearing settlement to ${merchantName} (${request.currency} ${amount.toFixed(2)}${ticketBit})`;
  const reference =
    input.reference?.trim() || request.ticketingRef || `settlement:${request.id}`;
  const zero = new Prisma.Decimal(0);

  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.merchantSettlementRequest.findUnique({
      where: { id: request.id },
    });
    if (!locked || locked.status !== MerchantSettlementRequestStatus.OPEN) {
      throw new HttpError(400, "Settlement request is no longer open.");
    }

    const platformJournal = await tx.platformJournalEntry.create({
      data: {
        postedAt,
        memo,
        reference,
        sourceType: PlatformJournalSourceType.MERCHANT_FUND_TRANSFER,
        businessId: request.businessId,
        lines: {
          create: [
            {
              chartOfAccountId: expenseAccount.id,
              debitAmount: amount,
              creditAmount: zero,
              description: `Clearing settlement to ${merchantName}`,
            },
            {
              chartOfAccountId: creditAccount.id,
              debitAmount: zero,
              creditAmount: amount,
              description: `Credit ${creditAccount.code} — ${merchantName}`,
            },
          ],
        },
      },
      include: {
        lines: { include: { chartOfAccount: true } },
        business: { select: { id: true, name: true } },
      },
    });

    const merchantJournal = await postMerchantJournalForClearingSettlement(
      tx,
      {
        platformJournalId: platformJournal.id,
        businessId: request.businessId,
        currency: request.currency,
        amount,
        memo,
        reference,
        settlementRequestId: request.id,
      },
      postedAt,
    );
    if (!merchantJournal) {
      throw new HttpError(500, "Could not post the merchant clearing settlement journal.");
    }

    await tx.platformJournalEntry.update({
      where: { id: platformJournal.id },
      data: { sourceId: merchantJournal.id },
    });

    const updated = await tx.merchantSettlementRequest.update({
      where: { id: request.id },
      data: {
        status: MerchantSettlementRequestStatus.COMPLETED,
        platformJournalId: platformJournal.id,
        completedAt: new Date(),
        completedByUserId: input.completedByUserId,
      },
      include: {
        business: { select: { id: true, name: true } },
        requestedBy: { select: { name: true } },
      },
    });

    return {
      platformJournal: { ...platformJournal, sourceId: merchantJournal.id },
      merchantJournalId: merchantJournal.id,
      request: updated,
    };
  });

  void notifyBusinessOwnersOfFundTransfer({
    businessId: request.businessId,
    transferId: result.platformJournal.id,
    amount,
    currency: request.currency,
  });

  return {
    platformJournalId: result.platformJournal.id,
    merchantJournalId: result.merchantJournalId,
    request: {
      id: result.request.id,
      businessId: result.request.businessId,
      businessName: result.request.business.name,
      amount: Number(result.request.amount),
      currency: result.request.currency,
      status: result.request.status,
      ticketingRef: result.request.ticketingRef,
      completedAt: result.request.completedAt?.toISOString() ?? null,
      platformJournalId: result.request.platformJournalId,
    },
  };
}

/** When a linked fund-transfer journal is reversed, reopen the settlement request. */
export async function reopenSettlementRequestForReversedJournal(
  tx: Prisma.TransactionClient,
  platformJournalId: string,
): Promise<void> {
  await tx.merchantSettlementRequest.updateMany({
    where: {
      platformJournalId,
      status: MerchantSettlementRequestStatus.COMPLETED,
    },
    data: {
      status: MerchantSettlementRequestStatus.OPEN,
      platformJournalId: null,
      completedAt: null,
      completedByUserId: null,
    },
  });
}
