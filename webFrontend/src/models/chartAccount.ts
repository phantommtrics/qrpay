import {
  Landmark,
  PieChart,
  Receipt,
  Scale,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

import type { AccountingAccountRow } from '../services/accountingApi'

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
