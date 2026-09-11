import { PlatformJournalSourceType, Prisma } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { notifyBusinessOwnersOfFundTransfer } from "./business-owner-push.service.js";
import { ensureDefaultChartOfAccountsForBusiness } from "./chart-of-accounts.service.js";
import {
  postMerchantJournalForPlatformFundTransfer,
} from "./merchant-payout-journal.service.js";
import {
  ensureDefaultPlatformChartAccounts,
  PLATFORM_CHART_MERCHANT_FUND_TRANSFERS,
} from "./platform-chart-of-accounts.service.js";

function money(raw: number | string): Prisma.Decimal {
  const d = new Prisma.Decimal(String(raw ?? 0));
  if (!d.isFinite() || d.lte(0)) {
    return new Prisma.Decimal(0);
  }
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export async function createPlatformMerchantFundTransfer(input: {
  businessId: string;
  amount: number;
  currency?: string;
  postedAt: string;
  memo?: string | null;
  reference?: string | null;
  platformCreditAccountId: string;
}) {
  const businessId = input.businessId.trim();
  if (!businessId) {
    throw new HttpError(400, "Merchant is required.");
  }
  const amount = money(input.amount);
  if (amount.lte(0)) {
    throw new HttpError(400, "Amount must be a positive number.");
  }
  const currency = (input.currency || "GMD").trim().toUpperCase() || "GMD";
  const postedAt = new Date(`${input.postedAt.trim()}T12:00:00.000Z`);
  if (Number.isNaN(postedAt.getTime())) {
    throw new HttpError(400, "Invalid posted date.");
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true },
  });
  if (!business) {
    throw new HttpError(404, "Merchant not found.");
  }

  await ensureDefaultPlatformChartAccounts(prisma);
  await ensureDefaultChartOfAccountsForBusiness(prisma, businessId);

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

  const merchantName = business.name.trim() || business.id;
  const memo =
    input.memo?.trim() ||
    `Bank / manual settlement to ${merchantName} (${currency} ${amount.toFixed(2)})`;
  const reference = input.reference?.trim() || null;
  const zero = new Prisma.Decimal(0);

  const result = await prisma.$transaction(async (tx) => {
    const platformJournal = await tx.platformJournalEntry.create({
      data: {
        postedAt,
        memo,
        reference,
        sourceType: PlatformJournalSourceType.MERCHANT_FUND_TRANSFER,
        businessId,
        lines: {
          create: [
            {
              chartOfAccountId: expenseAccount.id,
              debitAmount: amount,
              creditAmount: zero,
              description: `Settlement to ${merchantName}`,
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

    const merchantJournal = await postMerchantJournalForPlatformFundTransfer(
      tx,
      {
        platformJournalId: platformJournal.id,
        businessId,
        currency,
        amount,
        memo,
        reference,
      },
      postedAt,
    );
    if (!merchantJournal) {
      throw new HttpError(500, "Could not post the merchant settlement journal.");
    }

    await tx.platformJournalEntry.update({
      where: { id: platformJournal.id },
      data: { sourceId: merchantJournal.id },
    });

    return {
      platformJournal: { ...platformJournal, sourceId: merchantJournal.id },
      merchantJournalId: merchantJournal.id,
    };
  });

  void notifyBusinessOwnersOfFundTransfer({
    businessId,
    transferId: result.platformJournal.id,
    amount,
    currency,
  });

  return result;
}
