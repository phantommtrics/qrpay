import { ChartAccountCategory, ChartAccountKind, ChartAccountType } from "@prisma/client";

/** Built-in catalog codes → statement type. Used when `accountType` was never stored. */
const CODE_ACCOUNT_TYPE: Record<string, ChartAccountType> = {
  CASH_ON_HAND: ChartAccountType.CURRENT_ASSET,
  MERCHANT_WALLET_CLEARING: ChartAccountType.CURRENT_ASSET,
  MOBILE_MONEY: ChartAccountType.CURRENT_ASSET,
  WAVE_MERCHANT_PAYOUTS: ChartAccountType.CURRENT_ASSET,
  PLATFORM_FUND_TRANSFERS: ChartAccountType.CURRENT_ASSET,
  QR_WALLET_FEES: ChartAccountType.EXPENSE,
  "620": ChartAccountType.PREPAYMENT,
  "803": ChartAccountType.CURRENT_LIABILITY,
  "880": ChartAccountType.CURRENT_LIABILITY,
  "881": ChartAccountType.CURRENT_LIABILITY,
  "970": ChartAccountType.CAPITAL_EQUITY,
  "200": ChartAccountType.SALES,
  "260": ChartAccountType.OTHER_INCOME,
  "310": ChartAccountType.DIRECT_COST,
  "404": ChartAccountType.EXPENSE,
  "429": ChartAccountType.EXPENSE,
  "445": ChartAccountType.EXPENSE,
  "469": ChartAccountType.EXPENSE,
};

export function categoryForChartAccountType(accountType: ChartAccountType): ChartAccountCategory {
  switch (accountType) {
    case ChartAccountType.CURRENT_ASSET:
    case ChartAccountType.FIXED_ASSET:
    case ChartAccountType.INVENTORY:
    case ChartAccountType.NON_CURRENT_ASSET:
    case ChartAccountType.PREPAYMENT:
      return ChartAccountCategory.ASSET;
    case ChartAccountType.CURRENT_LIABILITY:
    case ChartAccountType.LONG_TERM_LIABILITY:
      return ChartAccountCategory.LIABILITY;
    case ChartAccountType.CAPITAL_EQUITY:
      return ChartAccountCategory.EQUITY;
    case ChartAccountType.REVENUE:
    case ChartAccountType.SALES:
    case ChartAccountType.OTHER_INCOME:
      return ChartAccountCategory.REVENUE;
    case ChartAccountType.EXPENSE:
    case ChartAccountType.DIRECT_COST:
    case ChartAccountType.DEPRECIATION:
    case ChartAccountType.OVERHEAD:
      return ChartAccountCategory.EXPENSE;
  }
}

export function defaultChartAccountTypeForCategory(
  category: ChartAccountCategory,
): ChartAccountType {
  switch (category) {
    case ChartAccountCategory.ASSET:
      return ChartAccountType.CURRENT_ASSET;
    case ChartAccountCategory.LIABILITY:
      return ChartAccountType.CURRENT_LIABILITY;
    case ChartAccountCategory.EQUITY:
      return ChartAccountType.CAPITAL_EQUITY;
    case ChartAccountCategory.REVENUE:
      return ChartAccountType.REVENUE;
    case ChartAccountCategory.EXPENSE:
      return ChartAccountType.EXPENSE;
  }
}

export type BalanceSheetSection =
  | "currentAssets"
  | "fixedAssets"
  | "nonCurrentAssets"
  | "currentLiabilities"
  | "longTermLiabilities"
  | "equity";

export function balanceSheetSectionForType(
  accountType: ChartAccountType,
): BalanceSheetSection | null {
  switch (accountType) {
    case ChartAccountType.CURRENT_ASSET:
    case ChartAccountType.INVENTORY:
    case ChartAccountType.PREPAYMENT:
      return "currentAssets";
    case ChartAccountType.FIXED_ASSET:
      return "fixedAssets";
    case ChartAccountType.NON_CURRENT_ASSET:
      return "nonCurrentAssets";
    case ChartAccountType.CURRENT_LIABILITY:
      return "currentLiabilities";
    case ChartAccountType.LONG_TERM_LIABILITY:
      return "longTermLiabilities";
    case ChartAccountType.CAPITAL_EQUITY:
      return "equity";
    default:
      return null;
  }
}

export type PnlSection = "revenue" | "otherIncome" | "costOfSales" | "expenses";

export function pnlSectionForType(accountType: ChartAccountType): PnlSection | null {
  switch (accountType) {
    case ChartAccountType.REVENUE:
    case ChartAccountType.SALES:
      return "revenue";
    case ChartAccountType.OTHER_INCOME:
      return "otherIncome";
    case ChartAccountType.DIRECT_COST:
      return "costOfSales";
    case ChartAccountType.EXPENSE:
    case ChartAccountType.DEPRECIATION:
    case ChartAccountType.OVERHEAD:
      return "expenses";
    default:
      return null;
  }
}

function isLongTermLiability(code: string, name: string): boolean {
  const trimmed = code.trim();
  if (/^NC[_-]/i.test(trimmed)) return true;
  const t = `${code} ${name}`;
  return /\b(loan|borrowing|mortgage|term\s*loan|long[\s-]*term|debenture)\b/i.test(t);
}

function inferAccountType(input: {
  category: ChartAccountCategory;
  code: string;
  name: string;
}): ChartAccountType {
  const code = input.code.trim();
  const known = CODE_ACCOUNT_TYPE[code] ?? CODE_ACCOUNT_TYPE[code.toUpperCase()];
  if (known && categoryForChartAccountType(known) === input.category) {
    return known;
  }

  const name = input.name;
  switch (input.category) {
    case ChartAccountCategory.ASSET: {
      if (
        /\b(fixed\s+assets?|property|plant|equipment|furniture|vehicle|machinery|motor\s+vehicle|ppe)\b/i.test(
          `${code} ${name}`,
        ) ||
        /(FIXED|PPE|EQUIP|FURNITURE|VEHICLE|MACHIN)/i.test(code)
      ) {
        return ChartAccountType.FIXED_ASSET;
      }
      if (/\b(non-?current\s+assets?|long-?term\s+assets?)\b/i.test(name)) {
        return ChartAccountType.NON_CURRENT_ASSET;
      }
      if (/\bprepay/i.test(name)) return ChartAccountType.PREPAYMENT;
      if (/\b(inventory|stock)\b/i.test(name)) return ChartAccountType.INVENTORY;
      return ChartAccountType.CURRENT_ASSET;
    }
    case ChartAccountCategory.LIABILITY:
      return isLongTermLiability(code, name)
        ? ChartAccountType.LONG_TERM_LIABILITY
        : ChartAccountType.CURRENT_LIABILITY;
    case ChartAccountCategory.EQUITY:
      return ChartAccountType.CAPITAL_EQUITY;
    case ChartAccountCategory.REVENUE: {
      if (/\bother\s+(revenue|income)\b/i.test(name)) return ChartAccountType.OTHER_INCOME;
      if (/\bsales?\b/i.test(name) || /SALES/i.test(code)) return ChartAccountType.SALES;
      return ChartAccountType.REVENUE;
    }
    case ChartAccountCategory.EXPENSE: {
      const u = code.toUpperCase();
      if (
        u === "310" ||
        u === "COGS" ||
        u.startsWith("COGS_") ||
        /\b(cost of goods|cost of sales|direct cost)\b/i.test(name)
      ) {
        return ChartAccountType.DIRECT_COST;
      }
      if (/\bdepreciat/i.test(name)) return ChartAccountType.DEPRECIATION;
      if (/\boverhead\b/i.test(name)) return ChartAccountType.OVERHEAD;
      return ChartAccountType.EXPENSE;
    }
  }
}

export function resolveChartAccountType(input: {
  accountType?: ChartAccountType | null;
  category: ChartAccountCategory;
  kind?: ChartAccountKind | null;
  code: string;
  name: string;
}): ChartAccountType {
  if (input.accountType) return input.accountType;
  if (input.kind === ChartAccountKind.BANK) return ChartAccountType.CURRENT_ASSET;
  return inferAccountType(input);
}
