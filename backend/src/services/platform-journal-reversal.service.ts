import { PlatformJournalSourceType, Prisma, SalesLedgerEntryType } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { notifyBusinessOwnersOfFundTransfer } from "./business-owner-push.service.js";
import { reverseMerchantJournalForPlatformFundTransfer } from "./merchant-payout-journal.service.js";
import { reopenSettlementRequestForReversedJournal } from "./platform-settlement-complete.service.js";

function canReversePlatformSourceType(st: PlatformJournalSourceType | null): boolean {
  return (
    st === PlatformJournalSourceType.MANUAL ||
    st === PlatformJournalSourceType.MERCHANT_FUND_TRANSFER
  );
}

export async function getPlatformJournalEntryForReversalDetail(journalEntryId: string) {
  const row = await prisma.platformJournalEntry.findUnique({
    where: { id: journalEntryId },
    include: {
      lines: {
        orderBy: { id: "asc" },
        include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
      },
      reversedByPlatformEntry: { select: { id: true, postedAt: true } },
      billFromPayment: { select: { id: true, publicCode: true } },
    },
  });
  if (!row) {
    throw new HttpError(404, "Journal entry not found.");
  }

  let blockReason: string | null = null;
  if (row.reversesPlatformJournalEntryId) {
    blockReason = "This entry is already a reversal; reverse the original journal instead if needed.";
  } else if (row.reversedByPlatformEntry) {
    blockReason = "This journal entry has already been reversed.";
  } else if (row.billFromPayment) {
    blockReason =
      "Entries linked to a platform purchase bill payment cannot be reversed here. Use supplier bill workflows.";
  } else if (!canReversePlatformSourceType(row.sourceType)) {
    blockReason =
      "Only manual journals and merchant fund transfers can be reversed here. Automated subscription and checkout entries use other workflows.";
  }

  let dr = new Prisma.Decimal(0);
  let cr = new Prisma.Decimal(0);
  for (const ln of row.lines) {
    dr = dr.add(ln.debitAmount);
    cr = cr.add(ln.creditAmount);
  }

  return {
    id: row.id,
    postedAt: row.postedAt,
    memo: row.memo,
    reference: row.reference,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    reversesPlatformJournalEntryId: row.reversesPlatformJournalEntryId,
    lineCount: row.lines.length,
    totalDebit: Number(dr.toString()),
    totalCredit: Number(cr.toString()),
    lines: row.lines.map((ln) => ({
      id: ln.id,
      chartOfAccountId: ln.chartOfAccountId,
      code: ln.chartOfAccount.code,
      name: ln.chartOfAccount.name,
      debit: Number(ln.debitAmount.toString()),
      credit: Number(ln.creditAmount.toString()),
      description: ln.description,
    })),
    canReverse: blockReason === null,
    reversalBlockReason: blockReason,
  };
}

export async function reversePlatformJournalEntry(
  journalEntryId: string,
  input: { postedAt: string; memo?: string | null },
) {
  const postedAt = new Date(`${input.postedAt.trim()}T12:00:00.000Z`);
  if (Number.isNaN(postedAt.getTime())) {
    throw new HttpError(400, "Invalid posted date.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const original = await tx.platformJournalEntry.findUnique({
      where: { id: journalEntryId },
      include: {
        lines: { orderBy: { id: "asc" } },
        reversedByPlatformEntry: { select: { id: true } },
        billFromPayment: { select: { id: true } },
      },
    });

    if (!original) {
      throw new HttpError(404, "Journal entry not found.");
    }

    if (original.reversesPlatformJournalEntryId) {
      throw new HttpError(400, "This entry is already a reversal; reverse the original journal instead.");
    }
    if (original.reversedByPlatformEntry) {
      throw new HttpError(400, "This journal entry has already been reversed.");
    }
    if (original.billFromPayment) {
      throw new HttpError(
        400,
        "Entries linked to a platform purchase bill payment cannot be reversed here.",
      );
    }
    if (!canReversePlatformSourceType(original.sourceType)) {
      throw new HttpError(400, "Only manual journals and merchant fund transfers can be reversed here.");
    }

    const existingReversal = await tx.platformJournalEntry.findFirst({
      where: { reversesPlatformJournalEntryId: original.id },
      select: { id: true },
    });
    if (existingReversal) {
      throw new HttpError(400, "This journal entry has already been reversed.");
    }

    if (!original.lines.length) {
      throw new HttpError(400, "Journal has no lines to reverse.");
    }

    const memoParts = [
      input.memo?.trim() || `Reversal of platform journal ${original.id.slice(0, 8)}…`,
      original.memo?.trim() ? `Original memo: ${original.memo.trim()}` : null,
    ].filter(Boolean);

    const isFundTransfer =
      original.sourceType === PlatformJournalSourceType.MERCHANT_FUND_TRANSFER;
    const reversal = await tx.platformJournalEntry.create({
      data: {
        postedAt,
        memo: memoParts.join(" | "),
        reference: original.reference?.trim() || null,
        sourceType: isFundTransfer
          ? PlatformJournalSourceType.MERCHANT_FUND_TRANSFER_REVERSAL
          : PlatformJournalSourceType.MANUAL_JOURNAL_REVERSAL,
        sourceId: original.id,
        businessId: original.businessId,
        reversesPlatformJournalEntryId: original.id,
        lines: {
          create: original.lines.map((ln) => {
            const desc = ln.description?.trim()
              ? `Reversal: ${ln.description.trim()}`
              : "Reversal of journal line";
            return {
              chartOfAccountId: ln.chartOfAccountId,
              debitAmount: ln.creditAmount,
              creditAmount: ln.debitAmount,
              description: desc.length > 4000 ? desc.slice(0, 4000) : desc,
              quantity: ln.quantity,
              unitLabel: ln.unitLabel,
              taxAmount: ln.taxAmount,
            };
          }),
        },
      },
      include: {
        lines: {
          include: { chartOfAccount: { select: { id: true, code: true, name: true } } },
        },
      },
    });

    if (isFundTransfer) {
      await reverseMerchantJournalForPlatformFundTransfer(tx, original.id, postedAt);
      await reopenSettlementRequestForReversedJournal(tx, original.id);
    }

    const transferAmount = original.lines.reduce((max, ln) => {
      return ln.debitAmount.gt(max) ? ln.debitAmount : max;
    }, new Prisma.Decimal(0));

    return {
      reversal,
      fundTransferNotify:
        isFundTransfer && original.businessId
          ? { businessId: original.businessId, amount: transferAmount, originalId: original.id }
          : null,
    };
  });

  if (result.fundTransferNotify) {
    const ledger = await prisma.salesLedgerEntry.findFirst({
      where: {
        businessId: result.fundTransferNotify.businessId,
        type: SalesLedgerEntryType.PLATFORM_FUND_TRANSFER,
        providerPaymentRef: result.fundTransferNotify.originalId,
      },
      select: { amount: true, currency: true },
    });
    void notifyBusinessOwnersOfFundTransfer({
      businessId: result.fundTransferNotify.businessId,
      transferId: result.reversal.id,
      amount: ledger?.amount ?? result.fundTransferNotify.amount,
      currency: ledger?.currency ?? "GMD",
      kind: "reversed",
    });
  }

  return result.reversal;
}
