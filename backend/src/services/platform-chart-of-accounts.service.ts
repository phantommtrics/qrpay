import {
  ChartAccountCategory,
  ChartAccountKind,
  type PlatformChartOfAccount,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

export const PLATFORM_CHART_SUBSCRIPTION_CLEARING = "P-1000";
export const PLATFORM_CHART_SUBSCRIPTION_AR_PENDING = "P-1130";
export const PLATFORM_CHART_DEFERRED_SUBSCRIPTION_REVENUE = "P-2430";
export const PLATFORM_CHART_SUBSCRIPTION_REVENUE = "P-4000";
export const PLATFORM_CHART_SUBSCRIPTION_REFUNDS = "P-4900";
/** Wallet/processor fees on subscription checkouts (Wave, Yonna, etc.). Same code as legacy name below. */
export const PLATFORM_CHART_WALLET_FEES_SUBSCRIPTIONS = "P-4910";
/** @deprecated Use PLATFORM_CHART_WALLET_FEES_SUBSCRIPTIONS — same account code P-4910. */
export const PLATFORM_CHART_WAVE_WALLET_FEES_SUBSCRIPTIONS = PLATFORM_CHART_WALLET_FEES_SUBSCRIPTIONS;
export const PLATFORM_CHART_HOSTING = "P-5100";
export const PLATFORM_CHART_EMAIL_SERVICES = "P-5110";
export const PLATFORM_CHART_DOMAIN = "P-5120";

type Db = PrismaClient | Prisma.TransactionClient;

const DEFAULT_PLATFORM_ACCOUNTS: Array<{
  code: string;
  name: string;
  description: string;
  category: ChartAccountCategory;
  isSystem: boolean;
}> = [
  {
    code: PLATFORM_CHART_SUBSCRIPTION_CLEARING,
    name: "Subscription collections clearing",
    description:
      "Debit when a merchant pays a DirectPay subscription invoice (cash in transit to platform bank). Pair with subscription revenue.",
    category: ChartAccountCategory.ASSET,
    isSystem: true,
  },
  {
    code: PLATFORM_CHART_SUBSCRIPTION_REVENUE,
    name: "Merchant subscription revenue",
    description: "SaaS income from business plans (PRO, Business Pro, etc.). Credited when subscription invoices are paid.",
    category: ChartAccountCategory.REVENUE,
    isSystem: true,
  },
  {
    code: PLATFORM_CHART_SUBSCRIPTION_AR_PENDING,
    name: "Subscription receivable — checkout pending",
    description:
      "Amount due while a merchant subscription checkout (Wave, Yonna, etc.) is in progress. Cleared when payment succeeds or reversed if checkout is cancelled.",
    category: ChartAccountCategory.ASSET,
    isSystem: true,
  },
  {
    code: PLATFORM_CHART_DEFERRED_SUBSCRIPTION_REVENUE,
    name: "Deferred subscription revenue (checkout)",
    description:
      "Liability for subscription cash not yet earned while checkout is pending. Recognized to revenue when the invoice is paid.",
    category: ChartAccountCategory.LIABILITY,
    isSystem: true,
  },
  {
    code: PLATFORM_CHART_SUBSCRIPTION_REFUNDS,
    name: "Merchant subscription refunds",
    description:
      "Refunds and credits back to merchants (e.g. plan changes, approved refund cases). Reduces net subscription income.",
    category: ChartAccountCategory.EXPENSE,
    isSystem: true,
  },
  {
    code: PLATFORM_CHART_WALLET_FEES_SUBSCRIPTIONS,
    name: "Wallet fees — subscription checkouts",
    description:
      "Wallet or payment-rail fees on merchant subscription invoices (e.g. Wave ~1%; Yonna when applicable). Reduces net subscription clearing.",
    category: ChartAccountCategory.EXPENSE,
    isSystem: true,
  },
  {
    code: PLATFORM_CHART_HOSTING,
    name: "Hosting & infrastructure",
    description: "Servers, cloud, payment rails, and core platform infrastructure.",
    category: ChartAccountCategory.EXPENSE,
    isSystem: true,
  },
  {
    code: PLATFORM_CHART_EMAIL_SERVICES,
    name: "Email & communications",
    description: "Transactional email, marketing tools, and messaging providers.",
    category: ChartAccountCategory.EXPENSE,
    isSystem: true,
  },
  {
    code: PLATFORM_CHART_DOMAIN,
    name: "Domain & DNS",
    description: "Domain registration, SSL, and DNS services for DirectPay.",
    category: ChartAccountCategory.EXPENSE,
    isSystem: true,
  },
];

export async function listPlatformChartAccounts(): Promise<PlatformChartOfAccount[]> {
  await ensureDefaultPlatformChartAccounts(prisma);
  return prisma.platformChartOfAccount.findMany({
    orderBy: [{ category: "asc" }, { code: "asc" }],
  });
}

export async function ensureDefaultPlatformChartAccounts(db: Db): Promise<void> {
  for (const a of DEFAULT_PLATFORM_ACCOUNTS) {
    await db.platformChartOfAccount.upsert({
      where: { code: a.code },
      create: {
        code: a.code,
        name: a.name,
        description: a.description,
        category: a.category,
        kind: ChartAccountKind.LEDGER,
        isSystem: a.isSystem,
      },
      update: {
        name: a.name,
        description: a.description,
        category: a.category,
        isSystem: a.isSystem,
      },
    });
  }
}

export async function createPlatformChartAccount(input: {
  code: string;
  name: string;
  category: ChartAccountCategory;
  description?: string | null;
}): Promise<PlatformChartOfAccount> {
  await ensureDefaultPlatformChartAccounts(prisma);
  const code = input.code.trim();
  const name = input.name.trim();
  const description = input.description?.trim() || null;
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
  const exists = await prisma.platformChartOfAccount.findUnique({ where: { code } });
  if (exists) {
    throw new HttpError(409, "An account with this code already exists.");
  }
  return prisma.platformChartOfAccount.create({
    data: {
      code,
      name,
      description,
      category: input.category,
      kind: ChartAccountKind.LEDGER,
      isSystem: false,
    },
  });
}

export async function updatePlatformChartAccount(
  id: string,
  input: {
    code?: string;
    name?: string;
    category?: ChartAccountCategory;
    description?: string | null;
  },
): Promise<PlatformChartOfAccount> {
  await ensureDefaultPlatformChartAccounts(prisma);
  const row = await prisma.platformChartOfAccount.findUnique({ where: { id } });
  if (!row) {
    throw new HttpError(404, "Account not found.");
  }

  const lineCount = await prisma.platformJournalLine.count({
    where: { chartOfAccountId: id },
  });

  if (row.isSystem) {
    const name = input.name?.trim();
    const description = input.description === undefined ? undefined : input.description?.trim() || null;
    if (input.code !== undefined || input.category !== undefined) {
      throw new HttpError(400, "System accounts can only change name and description.");
    }
    if (name !== undefined && !name) {
      throw new HttpError(400, "Account name is required.");
    }
    if (name !== undefined && name.length > 200) {
      throw new HttpError(400, "Account name is too long.");
    }
    if (description !== undefined && description && description.length > 4000) {
      throw new HttpError(400, "Description is too long.");
    }
    return prisma.platformChartOfAccount.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    });
  }

  const nextCode = input.code !== undefined ? input.code.trim() : undefined;
  const nextName = input.name !== undefined ? input.name.trim() : undefined;
  const nextDesc = input.description === undefined ? undefined : input.description?.trim() || null;
  const nextCat = input.category;

  if (nextCode !== undefined) {
    if (!nextCode) {
      throw new HttpError(400, "Account code is required.");
    }
    if (nextCode.length > 64) {
      throw new HttpError(400, "Account code is too long.");
    }
    if (lineCount > 0 && nextCode !== row.code) {
      throw new HttpError(409, "Cannot change code while the account has journal activity.");
    }
    const clash = await prisma.platformChartOfAccount.findFirst({
      where: { code: nextCode, NOT: { id } },
    });
    if (clash) {
      throw new HttpError(409, "An account with this code already exists.");
    }
  }
  if (nextName !== undefined) {
    if (!nextName) {
      throw new HttpError(400, "Account name is required.");
    }
    if (nextName.length > 200) {
      throw new HttpError(400, "Account name is too long.");
    }
  }
  if (nextDesc !== undefined && nextDesc && nextDesc.length > 4000) {
    throw new HttpError(400, "Description is too long.");
  }
  if (lineCount > 0 && nextCat !== undefined && nextCat !== row.category) {
    throw new HttpError(409, "Cannot change category while the account has journal activity.");
  }

  return prisma.platformChartOfAccount.update({
    where: { id },
    data: {
      ...(nextCode !== undefined ? { code: nextCode } : {}),
      ...(nextName !== undefined ? { name: nextName } : {}),
      ...(nextDesc !== undefined ? { description: nextDesc } : {}),
      ...(nextCat !== undefined ? { category: nextCat } : {}),
    },
  });
}

export async function deletePlatformChartAccount(id: string): Promise<void> {
  await ensureDefaultPlatformChartAccounts(prisma);
  const row = await prisma.platformChartOfAccount.findUnique({ where: { id } });
  if (!row) {
    throw new HttpError(404, "Account not found.");
  }
  if (row.isSystem) {
    throw new HttpError(400, "System accounts cannot be deleted.");
  }
  const lineCount = await prisma.platformJournalLine.count({
    where: { chartOfAccountId: id },
  });
  if (lineCount > 0) {
    throw new HttpError(409, "Cannot delete an account that has journal lines.");
  }
  await prisma.platformChartOfAccount.delete({ where: { id } });
}
