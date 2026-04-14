import {
  Landmark,
  PieChart,
  Receipt,
  Scale,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

import type { AccountingAccountRow } from '../services/accountingApi'
import type { ChartAccountCategory } from '../services/accountingApi'

/** Grouped “account type” choices when creating a ledger line; each maps to a `ChartAccountCategory` for the API. */
export const CHART_ACCOUNT_TYPE_GROUPS = [
  'Assets',
  'Equity',
  'Expense',
  'Liabilities',
  'Revenue',
] as const

export type ChartAccountTypeGroup = (typeof CHART_ACCOUNT_TYPE_GROUPS)[number]

export type ChartAccountTypeOption = {
  key: string
  group: ChartAccountTypeGroup
  label: string
  category: ChartAccountCategory
  searchText: string
}

export const CHART_ACCOUNT_TYPE_OPTIONS: ChartAccountTypeOption[] = [
  {
    key: 'asset-current',
    group: 'Assets',
    label: 'current asset',
    category: 'ASSET',
    searchText: 'asset current receivable cash bank',
  },
  {
    key: 'asset-fixed',
    group: 'Assets',
    label: 'fixed asset',
    category: 'ASSET',
    searchText: 'asset fixed ppe property plant equipment',
  },
  {
    key: 'asset-inventory',
    group: 'Assets',
    label: 'inventory',
    category: 'ASSET',
    searchText: 'asset inventory stock',
  },
  {
    key: 'asset-non-current',
    group: 'Assets',
    label: 'non-current Asset',
    category: 'ASSET',
    searchText: 'asset non-current long term',
  },
  {
    key: 'asset-prepayment',
    group: 'Assets',
    label: 'Prepayment',
    category: 'ASSET',
    searchText: 'asset prepayment prepaid deferral',
  },
  {
    key: 'equity-equity',
    group: 'Equity',
    label: 'Equity',
    category: 'EQUITY',
    searchText: 'equity capital retained owner',
  },
  {
    key: 'expense-depreciation',
    group: 'Expense',
    label: 'Depreciation',
    category: 'EXPENSE',
    searchText: 'expense depreciation amortization',
  },
  {
    key: 'expense-direct-cost',
    group: 'Expense',
    label: 'Direct cost',
    category: 'EXPENSE',
    searchText: 'expense direct cost cogs cos',
  },
  {
    key: 'expense-expense',
    group: 'Expense',
    label: 'expense',
    category: 'EXPENSE',
    searchText: 'expense operating opex',
  },
  {
    key: 'expense-overhead',
    group: 'Expense',
    label: 'overhead',
    category: 'EXPENSE',
    searchText: 'expense overhead indirect admin',
  },
  {
    key: 'liability-non-current',
    group: 'Liabilities',
    label: 'non-current liability',
    category: 'LIABILITY',
    searchText: 'liability non-current long term loan',
  },
  {
    key: 'revenue-other-income',
    group: 'Revenue',
    label: 'other income',
    category: 'REVENUE',
    searchText: 'revenue other income miscellaneous',
  },
  {
    key: 'revenue-revenue',
    group: 'Revenue',
    label: 'Revenue',
    category: 'REVENUE',
    searchText: 'revenue income',
  },
  {
    key: 'revenue-sales',
    group: 'Revenue',
    label: 'sales',
    category: 'REVENUE',
    searchText: 'revenue sales turnover',
  },
]

export const DEFAULT_CHART_ACCOUNT_TYPE_KEY = 'expense-expense'

const TYPE_KEY_TO_CATEGORY = new Map(
  CHART_ACCOUNT_TYPE_OPTIONS.map((o) => [o.key, o.category] as const),
)

export function chartAccountCategoryForTypeKey(key: string): ChartAccountCategory {
  return TYPE_KEY_TO_CATEGORY.get(key) ?? 'EXPENSE'
}

/** Canonical ordering for statement-style presentation. */
export const CHART_CATEGORY_ORDER = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
] as const

export type ChartCategoryOrder = (typeof CHART_CATEGORY_ORDER)[number]

export type ChartAccountView = AccountingAccountRow & {
  /** Normalized category for grouping (API may widen `category` to string). */
  categoryKey: ChartCategoryOrder
}

export type ChartCategoryMeta = {
  Icon: LucideIcon
  label: string
  /** Short explainer shown in the section header. */
  hint: string
  stripeClass: string
  iconWrapClass: string
}

export const CHART_CATEGORY_META: Record<ChartCategoryOrder, ChartCategoryMeta> = {
  ASSET: {
    Icon: Landmark,
    label: 'Assets',
    hint: 'What the business owns — cash, bank accounts, clearing, receivables, inventory.',
    stripeClass: 'border-l-teal-500',
    iconWrapClass: 'bg-teal-50 text-teal-700',
  },
  LIABILITY: {
    Icon: Scale,
    label: 'Liabilities',
    hint: 'Amounts owed — customer prepayments, tax payable, loans.',
    stripeClass: 'border-l-amber-500',
    iconWrapClass: 'bg-amber-50 text-amber-800',
  },
  EQUITY: {
    Icon: PieChart,
    label: 'Equity',
    hint: 'Owner stake and retained results after revenue and expenses.',
    stripeClass: 'border-l-violet-500',
    iconWrapClass: 'bg-violet-50 text-violet-700',
  },
  REVENUE: {
    Icon: TrendingUp,
    label: 'Revenue',
    hint: 'Sales and other income recognized when you earn it.',
    stripeClass: 'border-l-emerald-500',
    iconWrapClass: 'bg-emerald-50 text-emerald-800',
  },
  EXPENSE: {
    Icon: Receipt,
    label: 'Expenses',
    hint: 'Costs of goods sold and operating spend.',
    stripeClass: 'border-l-rose-500',
    iconWrapClass: 'bg-rose-50 text-rose-800',
  },
}

const ORDER_INDEX: Record<ChartCategoryOrder, number> = {
  ASSET: 0,
  LIABILITY: 1,
  EQUITY: 2,
  REVENUE: 3,
  EXPENSE: 4,
}

function asCategoryKey(category: string): ChartCategoryOrder {
  if (category in ORDER_INDEX) return category as ChartCategoryOrder
  return 'EXPENSE'
}

export function toChartAccountView(row: AccountingAccountRow): ChartAccountView {
  return {
    ...row,
    categoryKey: asCategoryKey(row.category),
  }
}

export function chartAccountSearchBlob(row: AccountingAccountRow): string {
  return [
    row.code,
    row.name,
    row.description ?? '',
    row.category,
    row.bankName ?? '',
    row.bankAccountNumber ?? '',
    row.bankDetails ?? '',
    row.kind === 'BANK' ? 'bank' : '',
  ]
    .join(' ')
    .toLowerCase()
}

export function chartAccountsMatchQuery(row: AccountingAccountRow, raw: string): boolean {
  const q = raw.trim().toLowerCase()
  if (!q) return true
  const blob = chartAccountSearchBlob(row)
  const tokens = q.split(/\s+/).filter(Boolean)
  return tokens.every((t) => blob.includes(t))
}

export function compareChartAccountCodes(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true })
}
