import { ChartAccountCategory, type Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";

/** System revenue account: customer sales (per business, unique by code). */
export const CHART_CODE_SALES = "SALES";

/** Clearing asset: funds received via merchant wallet / POS rails before settlement detail. */
export const CHART_CODE_MERCHANT_WALLET_CLEARING = "MERCHANT_WALLET_CLEARING";

const DEFAULT_ACCOUNTS: Array<{
  code: string;
  name: string;
  category: ChartAccountCategory;
  isSystem: boolean;
}> = [
  {
    code: CHART_CODE_MERCHANT_WALLET_CLEARING,
    name: "Merchant wallet clearing",
    category: ChartAccountCategory.ASSET,
    isSystem: true,
  },
  {
    code: CHART_CODE_SALES,
    name: "Sales",
    category: ChartAccountCategory.REVENUE,
    isSystem: true,
  },
];

export async function ensureDefaultChartOfAccountsForBusiness(
  client: Prisma.TransactionClient | typeof prisma,
  businessId: string,
): Promise<void> {
  for (const def of DEFAULT_ACCOUNTS) {
    await client.chartOfAccount.upsert({
      where: {
        businessId_code: { businessId, code: def.code },
      },
      create: {
        businessId,
        code: def.code,
        name: def.name,
        category: def.category,
        isSystem: def.isSystem,
      },
      update: {},
    });
  }
}

export async function getChartAccountByCode(
  client: Prisma.TransactionClient | typeof prisma,
  businessId: string,
  code: string,
) {
  return client.chartOfAccount.findUnique({
    where: { businessId_code: { businessId, code } },
  });
}
