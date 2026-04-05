import { ChartAccountCategory, ChartAccountKind, type Prisma } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

/** Primary sales revenue account (customer sale journals credit this). */
export const CHART_CODE_SALES = "200";

/**
 * Clearing asset: QR wallet / card rails — cash in transit until settled to the bank.
 * Debit on digital sale; pair with Cr Sales revenue.
 */
export const CHART_CODE_MERCHANT_WALLET_CLEARING = "MERCHANT_WALLET_CLEARING";

/** Physical cash and immediate counter collections (POS cash, upfront pay). */
export const CHART_CODE_CASH_ON_HAND = "CASH_ON_HAND";

const DEFAULT_ACCOUNTS: Array<{
  code: string;
  name: string;
  description: string;
  category: ChartAccountCategory;
  isSystem: boolean;
}> = [
  {
    code: CHART_CODE_CASH_ON_HAND,
    name: "Cash on hand — POS & counter",
    description:
      "Physical cash and till takings. Use for counter sales recorded as cash or upfront pay at checkout.",
    category: ChartAccountCategory.ASSET,
    isSystem: true,
  },
  {
    code: CHART_CODE_MERCHANT_WALLET_CLEARING,
    name: "Digital payments clearing (wallet / card in transit)",
    description:
      "Wallet and card sales before the provider settles to your bank. Easypay debits this when customers pay by QR or card; clear to your bank account when money arrives.",
    category: ChartAccountCategory.ASSET,
    isSystem: true,
  },
  {
    code: "620",
    name: "prepayments",
    description:
      "Amounts paid in advance for goods or services not yet received (e.g. annual subscriptions, deposits to suppliers).",
    category: ChartAccountCategory.ASSET,
    isSystem: true,
  },
  {
    code: "803",
    name: "wages payable",
    description:
      "Salaries and wages owed to staff but not yet paid. Credit when payroll is accrued; debit when paid.",
    category: ChartAccountCategory.LIABILITY,
    isSystem: true,
  },
  {
    code: "880",
    name: "Owner a drawing",
    description:
      "Personal withdrawals by the owner (cash or goods for private use). Reduces equity; not a business expense.",
    category: ChartAccountCategory.LIABILITY,
    isSystem: true,
  },
  {
    code: "881",
    name: "Owner a fund introduce",
    description:
      "Money or assets the owner puts into the business. Increases equity; use when injecting capital or repaying a director loan.",
    category: ChartAccountCategory.LIABILITY,
    isSystem: true,
  },
  {
    code: "970",
    name: "Owner a share capital",
    description:
      "Nominal equity from issued share capital or formal owner investment at incorporation.",
    category: ChartAccountCategory.EQUITY,
    isSystem: true,
  },
  {
    code: CHART_CODE_SALES,
    name: "sales",
    description:
      "Retail and POS turnover. Easypay credits this automatically when a sale is paid (cash or wallet).",
    category: ChartAccountCategory.REVENUE,
    isSystem: true,
  },
  {
    code: "260",
    name: "other Revenue",
    description:
      "Income outside normal product sales: interest received, scrap sales, grants, or one-off items.",
    category: ChartAccountCategory.REVENUE,
    isSystem: true,
  },
  {
    code: "310",
    name: "Cost of goods sold",
    description:
      "Direct cost of inventory sold (purchase price, inbound freight). Pairs with sales for gross margin.",
    category: ChartAccountCategory.EXPENSE,
    isSystem: true,
  },
  {
    code: "404",
    name: "Bank Fees",
    description:
      "Charges from your bank or payment processors: account fees, wire charges, card processing not netted in sales.",
    category: ChartAccountCategory.EXPENSE,
    isSystem: true,
  },
  {
    code: "429",
    name: "General Expense",
    description:
      "Day-to-day overheads that do not fit a specific category (small supplies, minor repairs, miscellaneous).",
    category: ChartAccountCategory.EXPENSE,
    isSystem: true,
  },
  {
    code: "445",
    name: "light, power, heating",
    description:
      "Utilities for business premises: electricity, water, gas, and similar recurring utility bills.",
    category: ChartAccountCategory.EXPENSE,
    isSystem: true,
  },
  {
    code: "469",
    name: "Rent",
    description:
      "Lease or rental cost for shops, offices, warehouses, or equipment rentals treated as operating rent.",
    category: ChartAccountCategory.EXPENSE,
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
        description: def.description,
        category: def.category,
        isSystem: def.isSystem,
      },
      update: {
        name: def.name,
        description: def.description,
      },
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

export async function createChartOfAccountForBusiness(
  businessId: string,
  input: {
    code: string;
    name: string;
    category: ChartAccountCategory;
    description?: string | null;
    kind?: ChartAccountKind;
    bankAccountNumber?: string | null;
    bankName?: string | null;
    bankDetails?: string | null;
  },
) {
  await ensureDefaultChartOfAccountsForBusiness(prisma, businessId);
  const code = input.code.trim();
  const name = input.name.trim();
  const description = input.description?.trim() || null;
  const kind = input.kind ?? ChartAccountKind.LEDGER;

  if (!code) {
    throw new HttpError(400, "Account code is required.");
  }
  if (!name) {
    throw new HttpError(400, "Account name is required.");
  }
  if (code.length > 64) {
    throw new HttpError(400, "Account code is too long.");
  }
  if (name.length > 200) {
    throw new HttpError(400, "Account name is too long.");
  }
  if (description && description.length > 4000) {
    throw new HttpError(400, "Description is too long.");
  }

  const exists = await prisma.chartOfAccount.findUnique({
    where: { businessId_code: { businessId, code } },
  });
  if (exists) {
    throw new HttpError(409, "An account with this code already exists.");
  }

  if (kind === ChartAccountKind.BANK) {
    const bankName = input.bankName?.trim() ?? "";
    const bankAccountNumber = input.bankAccountNumber?.trim() ?? "";
    const bankDetails = input.bankDetails?.trim() || null;
    if (!bankName) {
      throw new HttpError(400, "Bank name is required for a bank account.");
    }
    if (!bankAccountNumber) {
      throw new HttpError(400, "Account number is required for a bank account.");
    }
    if (bankName.length > 200) {
      throw new HttpError(400, "Bank name is too long.");
    }
    if (bankAccountNumber.length > 64) {
      throw new HttpError(400, "Account number is too long.");
    }
    if (bankDetails && bankDetails.length > 4000) {
      throw new HttpError(400, "Bank details are too long.");
    }

    return prisma.chartOfAccount.create({
      data: {
        businessId,
        code,
        name,
        description,
        category: ChartAccountCategory.ASSET,
        kind: ChartAccountKind.BANK,
        bankName,
        bankAccountNumber,
        bankDetails,
        isSystem: false,
      },
    });
  }

  return prisma.chartOfAccount.create({
    data: {
      businessId,
      code,
      name,
      description,
      category: input.category,
      kind: ChartAccountKind.LEDGER,
      bankAccountNumber: null,
      bankName: null,
      bankDetails: null,
      isSystem: false,
    },
  });
}
