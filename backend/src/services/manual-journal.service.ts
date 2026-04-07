import {
  ChartAccountCategory,
  ChartAccountKind,
  JournalSourceType,
  Prisma,
} from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { createBusinessContact, getBusinessContactOrThrow } from "./business-contact.service.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

function dec(n: number | string): Prisma.Decimal {
  return new Prisma.Decimal(typeof n === "number" && !Number.isFinite(n) ? 0 : n);
}

function roundMoney(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

async function loadChartAccount(
  businessId: string,
  chartOfAccountId: string,
  db: DbClient = prisma,
) {
  const a = await db.chartOfAccount.findFirst({
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

  return createMoneyInJournalEntry(businessId, {
    postedAt: input.postedAt,
    memo,
    reference: input.reference?.trim() || null,
    contactId,
    sourceType: JournalSourceType.MANUAL_MONEY_IN,
    sourceId: contactId,
    settlementChartAccountId: settlement.id,
    settlementDebitDescription: `Receipt posted to ${settlement.name} (${settlement.code}).`,
    lineRows,
    creditSum,
  });
}

type MoneyInJournalPayload = {
  postedAt: Date;
  memo: string;
  reference: string | null;
  contactId: string;
  sourceType: JournalSourceType;
  sourceId: string;
  settlementChartAccountId: string;
  settlementDebitDescription: string;
  lineRows: Array<{
    chartOfAccountId: string;
    creditAmount: Prisma.Decimal;
    description: string;
    quantity: Prisma.Decimal | null;
    unitLabel: string | null;
    taxAmount: Prisma.Decimal;
  }>;
  creditSum: Prisma.Decimal;
};

async function createMoneyInJournalEntry(
  businessId: string,
  payload: MoneyInJournalPayload,
  db: DbClient = prisma,
) {
  return db.journalEntry.create({
    data: {
      businessId,
      postedAt: payload.postedAt,
      memo: payload.memo,
      reference: payload.reference,
      contactId: payload.contactId,
      sourceType: payload.sourceType,
      sourceId: payload.sourceId,
      lines: {
        create: [
          {
            chartOfAccountId: payload.settlementChartAccountId,
            debitAmount: payload.creditSum,
            creditAmount: dec(0),
            description: payload.settlementDebitDescription,
            taxAmount: dec(0),
          },
          ...payload.lineRows.map((r) => ({
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
 * Cash-basis GL when a sales invoice is marked paid: same shape as money-in, different source.
 */
export async function postMoneyInJournalForSalesInvoice(
  businessId: string,
  input: {
    invoiceId: string;
    contactId: string;
    postedAt: Date;
    reference?: string | null;
    settlementChartAccountId: string;
    lines: ManualJournalLineInput[];
    memo: string;
  },
  db: DbClient = prisma,
) {
  if (!input.lines.length) {
    throw new HttpError(400, "Add at least one line.");
  }

  const settlement = await loadChartAccount(businessId, input.settlementChartAccountId, db);
  assertAssetSettlement(settlement);

  const lineRows: MoneyInJournalPayload["lineRows"] = [];
  let creditSum = dec(0);

  for (const line of input.lines) {
    const narration = line.narration?.trim() || "Sales invoice line";
    if (narration.length > 4000) {
      throw new HttpError(400, "Narration is too long.");
    }
    await loadChartAccount(businessId, line.chartOfAccountId, db);
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

  return createMoneyInJournalEntry(
    businessId,
    {
      postedAt: input.postedAt,
      memo: input.memo,
      reference: input.reference?.trim() || null,
      contactId: input.contactId,
      sourceType: JournalSourceType.SALES_INVOICE_PAYMENT,
      sourceId: input.invoiceId,
      settlementChartAccountId: settlement.id,
      settlementDebitDescription: `Sales invoice payment — ${settlement.name} (${settlement.code}).`,
      lineRows,
      creditSum,
    },
    db,
  );
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

export type GeneralJournalLineInput = {
  chartOfAccountId: string;
  description?: string | null;
  debit: number;
  credit: number;
};

/**
 * Balanced general journal: each line is either debit or credit; totals must match.
 * No settlement asset leg (unlike money in/out).
 */
export async function postManualGeneralJournal(
  businessId: string,
  input: {
    postedAt: Date;
    reference?: string | null;
    memo?: string | null;
    contactId?: string | null;
    newContactName?: string | null;
    newContactEmail?: string | null;
    newContactPhone?: string | null;
    lines: GeneralJournalLineInput[];
  },
) {
  if (!input.lines.length || input.lines.length < 2) {
    throw new HttpError(400, "At least two lines are required for a balanced journal.");
  }

  let dr = dec(0);
  let cr = dec(0);
  const normalized: Array<{
    chartOfAccountId: string;
    description: string;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
  }> = [];

  for (const ln of input.lines) {
    const d = roundMoney(dec(ln.debit));
    const c = roundMoney(dec(ln.credit));
    if (d.lt(0) || c.lt(0)) {
      throw new HttpError(400, "Debits and credits cannot be negative.");
    }
    if ((d.eq(0) && c.eq(0)) || (!d.eq(0) && !c.eq(0))) {
      throw new HttpError(400, "Each line must have either a debit or a credit, not both.");
    }
    dr = dr.add(d);
    cr = cr.add(c);

    const desc = ln.description?.trim() || "General journal line";
    if (desc.length > 4000) {
      throw new HttpError(400, "Description is too long.");
    }
    await loadChartAccount(businessId, ln.chartOfAccountId);
    normalized.push({
      chartOfAccountId: ln.chartOfAccountId,
      description: desc,
      debit: d,
      credit: c,
    });
  }

  dr = roundMoney(dr);
  cr = roundMoney(cr);
  if (!dr.equals(cr)) {
    throw new HttpError(400, "Total debits must equal total credits.");
  }

  let contactId: string | null = null;
  if (input.contactId?.trim() || input.newContactName?.trim()) {
    contactId = await resolveContactId(businessId, {
      contactId: input.contactId ?? null,
      newContactName: input.newContactName ?? null,
      newContactEmail: input.newContactEmail ?? null,
      newContactPhone: input.newContactPhone ?? null,
    });
  }

  const memoParts = [
    input.memo?.trim() || "General journal",
    input.reference?.trim() ? `Ref: ${input.reference.trim()}` : null,
  ].filter(Boolean);

  return prisma.journalEntry.create({
    data: {
      businessId,
      postedAt: input.postedAt,
      memo: memoParts.join(" | "),
      reference: input.reference?.trim() || null,
      contactId,
      sourceType: JournalSourceType.MANUAL_GENERAL_JOURNAL,
      sourceId: null,
      lines: {
        create: normalized.map((ln) => ({
          chartOfAccountId: ln.chartOfAccountId,
          debitAmount: ln.debit,
          creditAmount: ln.credit,
          description: ln.description,
          taxAmount: dec(0),
        })),
      },
    },
    include: { lines: { include: { chartOfAccount: { select: { code: true, name: true } } } } },
  });
}
