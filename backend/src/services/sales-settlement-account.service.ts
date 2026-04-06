import { ChartAccountCategory, ChartAccountKind } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

/** First asset bank account — used when recording wallet receipt for guest invoice pay. */
export async function resolveDefaultBankSettlementAccountId(businessId: string): Promise<string> {
  const row = await prisma.chartOfAccount.findFirst({
    where: {
      businessId,
      category: ChartAccountCategory.ASSET,
      kind: ChartAccountKind.BANK,
    },
    orderBy: { code: "asc" },
    select: { id: true },
  });
  if (!row) {
    throw new HttpError(
      503,
      "No bank/cash account on the chart of accounts. Add a bank account (asset, bank kind) before customers can pay invoices online.",
    );
  }
  return row.id;
}
