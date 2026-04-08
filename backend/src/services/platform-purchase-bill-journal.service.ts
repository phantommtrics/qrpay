import { ChartAccountCategory, PlatformJournalSourceType, Prisma } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";

type Tx = Prisma.TransactionClient;

function dec(v: number | string): Prisma.Decimal {
  return new Prisma.Decimal(typeof v === "number" && !Number.isFinite(v) ? 0 : v);
}

function roundMoney(v: Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(v.toFixed(2));
}

function lineTotal(line: {
  quantity: Prisma.Decimal;
  unitAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
}): Prisma.Decimal {
  const q = line.quantity;
  const u = line.unitAmount;
  const t = line.taxAmount ?? dec(0);
  return roundMoney(q.mul(u).add(t));
}

async function loadPlatformChartAccount(tx: Tx, accountId: string) {
  const a = await tx.platformChartOfAccount.findUnique({ where: { id: accountId } });
  if (!a) {
    throw new HttpError(400, "Chart account not found.");
  }
  return a;
}

function assertAssetSettlement(a: { category: ChartAccountCategory; name: string }) {
  if (a.category !== ChartAccountCategory.ASSET) {
    throw new HttpError(400, `Settlement account must be an asset (bank/cash). Selected: ${a.name}.`);
  }
}

/**
 * Cash-basis platform GL when a platform purchase bill is paid (money out), mirroring merchant Bill posting.
 */
export async function postPlatformMoneyOutJournalForPurchaseBill(
  tx: Tx,
  input: {
    billId: string;
    postedAt: Date;
    reference: string;
    settlementChartAccountId: string;
    memo: string;
    lines: {
      chartOfAccountId: string;
      narration: string;
      quantity: Prisma.Decimal;
      unitLabel: string | null;
      unitAmount: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
    }[];
  },
) {
  if (!input.lines.length) {
    throw new HttpError(400, "Add at least one line.");
  }

  const settlement = await loadPlatformChartAccount(tx, input.settlementChartAccountId);
  assertAssetSettlement(settlement);

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
    const narration = line.narration?.trim() || "Bill line";
    await loadPlatformChartAccount(tx, line.chartOfAccountId);
    const total = lineTotal(line);
    if (total.lte(0)) {
      throw new HttpError(400, "Each line total must be greater than zero.");
    }
    debitSum = debitSum.add(total);
    lineRows.push({
      chartOfAccountId: line.chartOfAccountId,
      debitAmount: total,
      description: narration,
      quantity: line.quantity,
      unitLabel: line.unitLabel?.trim() || null,
      taxAmount: roundMoney(line.taxAmount ?? dec(0)),
    });
  }

  debitSum = roundMoney(debitSum);

  return tx.platformJournalEntry.create({
    data: {
      postedAt: input.postedAt,
      memo: input.memo,
      reference: input.reference.trim() || null,
      sourceType: PlatformJournalSourceType.PURCHASE_BILL_PAYMENT,
      sourceId: input.billId,
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
    include: {
      lines: { include: { chartOfAccount: true } },
    },
  });
}
