import {
  ChartAccountCategory,
  ChartAccountKind,
  JournalSourceType,
  Prisma,
} from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { createBusinessContact, getBusinessContactOrThrow } from "./business-contact.service.js";

function dec(n: number | string): Prisma.Decimal {
  return new Prisma.Decimal(typeof n === "number" && !Number.isFinite(n) ? 0 : n);
}

function roundMoney(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

async function loadChartAccount(businessId: string, chartOfAccountId: string) {
  const a = await prisma.chartOfAccount.findFirst({
    where: { id: chartOfAccountId, businessId },
  });
  if (!a) {
    throw new HttpError(404, "Chart account not found.");
  }
  return a;
}

function assertAssetSettlement(a: { category: ChartAccountCategory; name: string }) {
  if (a.category !== ChartAccountCategory.ASSET) {
    throw new HttpError(
      400,
      `Settlement account must be an asset (cash or bank). "${a.name}" is not an asset account.`,
    );
  }
}

export type ManualJournalLineInput = {
  chartOfAccountId: string;
  narration: string;
  quantity: number;
  unitLabel?: string | null;
  unitAmount: number;
  taxAmount: number;
};

function lineTotal(line: ManualJournalLineInput): Prisma.Decimal {
  const qty = dec(line.quantity);
  if (qty.lte(0)) {
    throw new HttpError(400, "Each line must have quantity greater than zero.");
  }
  const unit = dec(line.unitAmount);
  const tax = dec(line.taxAmount);
  if (unit.lt(0) || tax.lt(0)) {
    throw new HttpError(400, "Unit amount and tax cannot be negative.");
  }
  return roundMoney(qty.mul(unit).add(tax));
}

async function resolveContactId(
  businessId: string,
  input: {
    contactId?: string | null;
    newContactName?: string | null;
    newContactEmail?: string | null;
    newContactPhone?: string | null;
  },
): Promise<string> {
  if (input.contactId?.trim()) {
    const c = await getBusinessContactOrThrow(businessId, input.contactId.trim());
    return c.id;
  }
  const name = input.newContactName?.trim();
  if (!name) {
    throw new HttpError(400, "Select a contact or enter a name to create a new contact.");
  }
  const created = await createBusinessContact(businessId, {
    name,
    email: input.newContactEmail ?? null,
    phone: input.newContactPhone ?? null,
  });
  return created.id;
}

/**
 * Money in: Dr settlement (cash/bank) · Cr detail lines (revenue, etc.).
 * Balances may go negative (overdraft) — no balance check.
 */
export async function postManualMoneyIn(
  businessId: string,
  input: {
    contactId?: string | null;
    newContactName?: string | null;
    newContactEmail?: string | null;
    newContactPhone?: string | null;
    postedAt: Date;
    reference?: string | null;
    settlementChartAccountId: string;
    lines: ManualJournalLineInput[];
  },
) {
  if (!input.lines.length) {
    throw new HttpError(400, "Add at least one line.");
  }

  const settlement = await loadChartAccount(businessId, input.settlementChartAccountId);
  assertAssetSettlement(settlement);

  const contactId = await resolveContactId(businessId, input);

  const lineRows: Array<{
    chartOfAccountId: string;
    creditAmount: Prisma.Decimal;
    description: string;
    quantity: Prisma.Decimal | null;
    unitLabel: string | null;
    taxAmount: Prisma.Decimal;
  }> = [];
  let creditSum = dec(0);

  for (const line of input.lines) {
    const narration = line.narration?.trim() || "Money in";
    if (narration.length > 4000) {
      throw new HttpError(400, "Narration is too long.");
    }
    await loadChartAccount(businessId, line.chartOfAccountId);
    const total = lineTotal(line);
    if (total.lte(0)) {
      throw new HttpError(400, "Each line total must be greater than zero.");
    }
    creditSum = creditSum.add(total);
    lineRows.push({
      chartOfAccountId: line.chartOfAccountId,
      creditAmount: total,
      description: narration,
      quantity: dec(line.quantity),
      unitLabel: line.unitLabel?.trim() || null,
      taxAmount: roundMoney(dec(line.taxAmount)),
    });
  }

  creditSum = roundMoney(creditSum);
  const contact = await prisma.businessContact.findUniqueOrThrow({ where: { id: contactId } });
  const memo = [
    `Money in — from ${contact.name}`,
    input.reference?.trim() ? `Ref: ${input.reference.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return prisma.journalEntry.create({
    data: {
      businessId,
      postedAt: input.postedAt,
      memo,
      reference: input.reference?.trim() || null,
      contactId,
      sourceType: JournalSourceType.MANUAL_MONEY_IN,
      sourceId: contactId,
      lines: {
        create: [
          {
            chartOfAccountId: settlement.id,
            debitAmount: creditSum,
            creditAmount: dec(0),
            description: `Receipt posted to ${settlement.name} (${settlement.code}).`,
            taxAmount: dec(0),
          },
          ...lineRows.map((r) => ({
            chartOfAccountId: r.chartOfAccountId,
            debitAmount: dec(0),
            creditAmount: r.creditAmount,
            description: r.description,
            quantity: r.quantity,
            unitLabel: r.unitLabel,
            taxAmount: r.taxAmount,
          })),
        ],
      },
    },
    include: { lines: { include: { chartOfAccount: { select: { code: true, name: true } } } } },
  });
}

/**
 * Money out: Dr detail lines (expense, etc.) · Cr settlement (cash/bank).
 */
export async function postManualMoneyOut(
  businessId: string,
  input: {
    contactId?: string | null;
    newContactName?: string | null;
    newContactEmail?: string | null;
    newContactPhone?: string | null;
    postedAt: Date;
    reference?: string | null;
    settlementChartAccountId: string;
    lines: ManualJournalLineInput[];
  },
) {
  if (!input.lines.length) {
    throw new HttpError(400, "Add at least one line.");
  }

  const settlement = await loadChartAccount(businessId, input.settlementChartAccountId);
  assertAssetSettlement(settlement);

  const contactId = await resolveContactId(businessId, input);

  const lineRows: Array<{
    chartOfAccountId: string;
    debitAmount: Prisma.Decimal;
    description: string;
    quantity: Prisma.Decimal | null;
    unitLabel: string | null;
    taxAmount: Prisma.Decimal;
  }> = [];
  let debitSum = dec(0);

  for (const line of input.lines) {
    const narration = line.narration?.trim() || "Money out";
    if (narration.length > 4000) {
      throw new HttpError(400, "Narration is too long.");
    }
    await loadChartAccount(businessId, line.chartOfAccountId);
    const total = lineTotal(line);
    if (total.lte(0)) {
      throw new HttpError(400, "Each line total must be greater than zero.");
    }
    debitSum = debitSum.add(total);
    lineRows.push({
      chartOfAccountId: line.chartOfAccountId,
      debitAmount: total,
      description: narration,
      quantity: dec(line.quantity),
      unitLabel: line.unitLabel?.trim() || null,
      taxAmount: roundMoney(dec(line.taxAmount)),
    });
  }

  debitSum = roundMoney(debitSum);
  const contact = await prisma.businessContact.findUniqueOrThrow({ where: { id: contactId } });
  const memo = [
    `Money out — to ${contact.name}`,
    input.reference?.trim() ? `Ref: ${input.reference.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return prisma.journalEntry.create({
    data: {
      businessId,
      postedAt: input.postedAt,
      memo,
      reference: input.reference?.trim() || null,
      contactId,
      sourceType: JournalSourceType.MANUAL_MONEY_OUT,
      sourceId: contactId,
      lines: {
        create: [
          ...lineRows.map((r) => ({
            chartOfAccountId: r.chartOfAccountId,
            debitAmount: r.debitAmount,
            creditAmount: dec(0),
            description: r.description,
            quantity: r.quantity,
            unitLabel: r.unitLabel,
            taxAmount: r.taxAmount,
          })),
          {
            chartOfAccountId: settlement.id,
            debitAmount: dec(0),
            creditAmount: debitSum,
            description: `Payment from ${settlement.name} (${settlement.code}).`,
            taxAmount: dec(0),
          },
        ],
      },
    },
    include: { lines: { include: { chartOfAccount: { select: { code: true, name: true } } } } },
  });
}

/**
 * Bank transfer: Dr destination bank · Cr source bank. Only `kind: BANK` accounts.
 */
export async function postManualBankTransfer(
  businessId: string,
  input: {
    fromChartAccountId: string;
    toChartAccountId: string;
    amount: number;
    postedAt: Date;
    reference?: string | null;
  },
) {
  const amt = roundMoney(dec(input.amount));
  if (amt.lte(0)) {
    throw new HttpError(400, "Amount must be greater than zero.");
  }

  const from = await loadChartAccount(businessId, input.fromChartAccountId);
  const to = await loadChartAccount(businessId, input.toChartAccountId);

  if (from.kind !== ChartAccountKind.BANK || to.kind !== ChartAccountKind.BANK) {
    throw new HttpError(400, "Both accounts must be bank-type chart accounts.");
  }
  if (from.id === to.id) {
    throw new HttpError(400, "From and to bank accounts must be different.");
  }

  const memo = [
    `Bank transfer — ${from.name} → ${to.name}`,
    input.reference?.trim() ? `Ref: ${input.reference.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return prisma.journalEntry.create({
    data: {
      businessId,
      postedAt: input.postedAt,
      memo,
      reference: input.reference?.trim() || null,
      sourceType: JournalSourceType.MANUAL_BANK_TRANSFER,
      lines: {
        create: [
          {
            chartOfAccountId: to.id,
            debitAmount: amt,
            creditAmount: dec(0),
            description: `Transfer in from ${from.name} (${from.code}).`,
            taxAmount: dec(0),
          },
          {
            chartOfAccountId: from.id,
            debitAmount: dec(0),
            creditAmount: amt,
            description: `Transfer out to ${to.name} (${to.code}).`,
            taxAmount: dec(0),
          },
        ],
      },
    },
    include: { lines: { include: { chartOfAccount: { select: { code: true, name: true } } } } },
  });
}
