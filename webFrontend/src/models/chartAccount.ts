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
  'Liabilities',
  'Equity',
  'Revenue',
  'Expenses',
] as const

export type ChartAccountTypeGroup = (typeof CHART_ACCOUNT_TYPE_GROUPS)[number]

/** Where this type appears on standard reports (matches the P&amp;L / balance sheet diagram). */
export type FinancialStatement = 'profitAndLoss' | 'balanceSheet'

export type ReportSectionKey =
  | 'bs_current_assets'
  | 'bs_fixed_assets'
  | 'bs_non_current_assets'
  | 'bs_current_liabilities'
  | 'bs_long_term_liabilities'
  | 'bs_equity'
  | 'pnl_income'
  | 'pnl_cost_of_sales'
  | 'pnl_other_income'
  | 'pnl_operating_expenses'

export const REPORT_SECTION_META: Record<
  ReportSectionKey,
  { statement: FinancialStatement; headline: string; diagramLabel: string }
> = {
  pnl_income: {
    statement: 'profitAndLoss',
    headline: 'Revenue or sales',
    diagramLabel: 'Trading income',
  },
  pnl_cost_of_sales: {
    statement: 'profitAndLoss',
    headline: 'Cost of sales',
    diagramLabel: 'Direct costs',
  },
  pnl_other_income: {
    statement: 'profitAndLoss',
    headline: 'Other income',
    diagramLabel: 'Other income',
  },
  pnl_operating_expenses: {
    statement: 'profitAndLoss',
    headline: 'Expenses',
    diagramLabel: 'Operating expenses, depreciation and overheads',
  },
  bs_current_assets: {
    statement: 'balanceSheet',
    headline: 'Current assets',
    diagramLabel: 'Receivables, inventory, prepayments, cash',
  },
  bs_fixed_assets: {
    statement: 'balanceSheet',
    headline: 'Fixed assets',
    diagramLabel: 'Property, plant & equipment',
  },
  bs_non_current_assets: {
    statement: 'balanceSheet',
    headline: 'Non-current assets',
    diagramLabel: 'Long-term assets',
  },
  bs_current_liabilities: {
    statement: 'balanceSheet',
    headline: 'Current liabilities',
    diagramLabel: 'Payables, tax, and amounts due within a year',
  },
  bs_long_term_liabilities: {
    statement: 'balanceSheet',
    headline: 'Long-term liabilities',
    diagramLabel: 'Loans and amounts due after a year',
  },
  bs_equity: {
    statement: 'balanceSheet',
    headline: 'Capital or equity',
    diagramLabel: 'Capital and retained results',
  },
}

/** Bank accounts are stored as assets; they sit with cash at bank under current assets. */
export const BANK_ACCOUNT_REPORT_NOTE =
  'Bank accounts (Account kind: Bank account) appear as cash at bank under current assets.'

/** Stored on the chart account and used to place it on the balance sheet or profit and loss. */
export type ChartAccountType =
  | 'CURRENT_ASSET'
  | 'FIXED_ASSET'
  | 'INVENTORY'
  | 'NON_CURRENT_ASSET'
  | 'PREPAYMENT'
  | 'CURRENT_LIABILITY'
  | 'LONG_TERM_LIABILITY'
  | 'CAPITAL_EQUITY'
  | 'EXPENSE'
  | 'DIRECT_COST'
  | 'DEPRECIATION'
  | 'OVERHEAD'
  | 'REVENUE'
  | 'SALES'
  | 'OTHER_INCOME'

export type ChartAccountTypeOption = {
  key: string
  group: ChartAccountTypeGroup
  label: string
  category: ChartAccountCategory
  accountType: ChartAccountType
  searchText: string
  reportSection: ReportSectionKey
}

export const CHART_ACCOUNT_TYPE_OPTIONS: ChartAccountTypeOption[] = [
  {
    key: 'asset-current',
    group: 'Assets',
    label: 'Current assets',
    category: 'ASSET',
    accountType: 'CURRENT_ASSET',
    searchText: 'current assets receivable cash bank',
    reportSection: 'bs_current_assets',
  },
  {
    key: 'asset-fixed',
    group: 'Assets',
    label: 'Fixed assets',
    category: 'ASSET',
    accountType: 'FIXED_ASSET',
    searchText: 'fixed assets ppe property plant equipment',
    reportSection: 'bs_fixed_assets',
  },
  {
    key: 'asset-inventory',
    group: 'Assets',
    label: 'Inventory',
    category: 'ASSET',
    accountType: 'INVENTORY',
    searchText: 'inventory stock current assets',
    reportSection: 'bs_current_assets',
  },
  {
    key: 'asset-non-current',
    group: 'Assets',
    label: 'Non-current asset',
    category: 'ASSET',
    accountType: 'NON_CURRENT_ASSET',
    searchText: 'non-current asset long term asset',
    reportSection: 'bs_non_current_assets',
  },
  {
    key: 'asset-prepayment',
    group: 'Assets',
    label: 'Prepayment',
    category: 'ASSET',
    accountType: 'PREPAYMENT',
    searchText: 'prepayment prepaid deferral current assets',
    reportSection: 'bs_current_assets',
  },
  {
    key: 'liability-current',
    group: 'Liabilities',
    label: 'Current liability',
    category: 'LIABILITY',
    accountType: 'CURRENT_LIABILITY',
    searchText: 'current liability payable short term',
    reportSection: 'bs_current_liabilities',
  },
  {
    key: 'liability-long-term',
    group: 'Liabilities',
    label: 'Long-term liability',
    category: 'LIABILITY',
    accountType: 'LONG_TERM_LIABILITY',
    searchText: 'long term liability long-term non-current loan',
    reportSection: 'bs_long_term_liabilities',
  },
  {
    key: 'equity-capital',
    group: 'Equity',
    label: 'Capital or equity',
    category: 'EQUITY',
    accountType: 'CAPITAL_EQUITY',
    searchText: 'capital equity retained owner share',
    reportSection: 'bs_equity',
  },
  {
    key: 'revenue-revenue',
    group: 'Revenue',
    label: 'Revenue',
    category: 'REVENUE',
    accountType: 'REVENUE',
    searchText: 'revenue sales income turnover',
    reportSection: 'pnl_income',
  },
  {
    key: 'revenue-sales',
    group: 'Revenue',
    label: 'Sales',
    category: 'REVENUE',
    accountType: 'SALES',
    searchText: 'revenue sales turnover income',
    reportSection: 'pnl_income',
  },
  {
    key: 'revenue-other-income',
    group: 'Revenue',
    label: 'Other income',
    category: 'REVENUE',
    accountType: 'OTHER_INCOME',
    searchText: 'other income miscellaneous revenue',
    reportSection: 'pnl_other_income',
  },
  {
    key: 'expense-expense',
    group: 'Expenses',
    label: 'Expenses',
    category: 'EXPENSE',
    accountType: 'EXPENSE',
    searchText: 'expenses expense operating opex',
    reportSection: 'pnl_operating_expenses',
  },
  {
    key: 'expense-direct-cost',
    group: 'Expenses',
    label: 'Direct cost',
    category: 'EXPENSE',
    accountType: 'DIRECT_COST',
    searchText: 'direct cost cogs cost of sales expenses',
    reportSection: 'pnl_cost_of_sales',
  },
  {
    key: 'expense-depreciation',
    group: 'Expenses',
    label: 'Depreciation',
    category: 'EXPENSE',
    accountType: 'DEPRECIATION',
    searchText: 'depreciation amortization expenses',
    reportSection: 'pnl_operating_expenses',
  },
  {
    key: 'expense-overhead',
    group: 'Expenses',
    label: 'Overhead',
    category: 'EXPENSE',
    accountType: 'OVERHEAD',
    searchText: 'overhead indirect admin expenses',
    reportSection: 'pnl_operating_expenses',
  },
]

export const DEFAULT_CHART_ACCOUNT_TYPE_KEY = 'expense-expense'

const TYPE_KEY_TO_CATEGORY = new Map(
  CHART_ACCOUNT_TYPE_OPTIONS.map((o) => [o.key, o.category] as const),
)

export function chartAccountCategoryForTypeKey(key: string): ChartAccountCategory {
  return TYPE_KEY_TO_CATEGORY.get(key) ?? 'EXPENSE'
}

export const REPORT_SECTION_ORDER: ReportSectionKey[] = [
  'bs_current_assets',
  'bs_fixed_assets',
  'bs_non_current_assets',
  'bs_current_liabilities',
  'bs_long_term_liabilities',
  'bs_equity',
  'pnl_income',
  'pnl_cost_of_sales',
  'pnl_operating_expenses',
  'pnl_other_income',
]

const CATEGORY_TYPE_FALLBACK: Record<string, ChartAccountType> = {
  ASSET: 'CURRENT_ASSET',
  LIABILITY: 'CURRENT_LIABILITY',
  EQUITY: 'CAPITAL_EQUITY',
  REVENUE: 'REVENUE',
  EXPENSE: 'EXPENSE',
}

export function chartAccountTypeForTypeKey(key: string): ChartAccountType {
  return CHART_ACCOUNT_TYPE_OPTIONS.find((o) => o.key === key)?.accountType ?? 'EXPENSE'
}

export function chartAccountTypeOption(accountType: string | null | undefined) {
  return CHART_ACCOUNT_TYPE_OPTIONS.find((o) => o.accountType === accountType)
}

/** Effective type for display when older API rows omit `accountType`. */
export function effectiveChartAccountType(row: {
  accountType?: string | null
  category: string
  kind?: string | null
}): ChartAccountType {
  if (row.kind === 'BANK') return 'CURRENT_ASSET'
  const known = chartAccountTypeOption(row.accountType)
  if (known) return known.accountType
  return CATEGORY_TYPE_FALLBACK[row.category] ?? 'EXPENSE'
}

export function chartAccountTypeLabel(accountType: string | null | undefined): string {
  return chartAccountTypeOption(accountType)?.label ?? 'Account'
}

export function reportSectionForAccount(row: {
  accountType?: string | null
  category: string
  kind?: string | null
}): ReportSectionKey {
  const type = effectiveChartAccountType(row)
  return chartAccountTypeOption(type)?.reportSection ?? 'pnl_operating_expenses'
}

export function chartCategoryForSection(section: ReportSectionKey): ChartCategoryOrder {
  switch (section) {
    case 'bs_current_liabilities':
    case 'bs_long_term_liabilities':
      return 'LIABILITY'
    case 'bs_equity':
      return 'EQUITY'
    case 'pnl_income':
    case 'pnl_other_income':
      return 'REVENUE'
    case 'pnl_cost_of_sales':
    case 'pnl_operating_expenses':
      return 'EXPENSE'
    default:
      return 'ASSET'
  }
}

export type ChartAccountReportExplainerRow = {
  statement: FinancialStatement
  sectionKey: ReportSectionKey
  headline: string
  diagramLabel: string
  typeLabels: string[]
}

/** Rows for the in-app “how reports work” panel, in diagram order. */
export function chartAccountReportExplainerRows(): ChartAccountReportExplainerRow[] {
  const bySection = new Map<ReportSectionKey, string[]>()
  for (const o of CHART_ACCOUNT_TYPE_OPTIONS) {
    const list = bySection.get(o.reportSection) ?? []
    list.push(o.label)
    bySection.set(o.reportSection, list)
  }
  return REPORT_SECTION_ORDER.map((sectionKey) => {
    const m = REPORT_SECTION_META[sectionKey]
    const typeLabels = bySection.get(sectionKey) ?? []
    return {
      statement: m.statement,
      sectionKey,
      headline: m.headline,
      diagramLabel: m.diagramLabel,
      typeLabels,
    }
  }).filter((row) => row.typeLabels.length > 0)
}

export function chartAccountTypeOptionSearchBlob(o: ChartAccountTypeOption): string {
  const m = REPORT_SECTION_META[o.reportSection]
  return `${o.group} ${o.label} ${o.category} ${o.searchText} ${m.headline} ${m.diagramLabel}`.toLowerCase()
}

/** Match search tokens as whole words so "current" does not hit "non-current". */
export function chartAccountTypeMatchesQuery(blob: string, raw: string): boolean {
  const q = raw.trim().toLowerCase()
  if (!q) return true
  const words = blob.split(/[^a-z0-9-]+/).filter(Boolean)
  return q.split(/\s+/).filter(Boolean).every((token) =>
    words.some((word) => word === token || word.startsWith(token)),
  )
}

/** One-line hint under the account type picker when creating a ledger account. */
export function accountTypeReportHint(accountTypeKey: string): string {
  const opt = CHART_ACCOUNT_TYPE_OPTIONS.find((o) => o.key === accountTypeKey)
  if (!opt) return ''
  const m = REPORT_SECTION_META[opt.reportSection]
  const stmt = m.statement === 'profitAndLoss' ? 'Profit & Loss' : 'balance sheet'
  return `Shows on the ${stmt} under “${m.headline}” (${m.diagramLabel}).`
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
  const section = REPORT_SECTION_META[reportSectionForAccount(row)]
  const typeLabel = chartAccountTypeLabel(effectiveChartAccountType(row))
  return [
    row.code,
    row.name,
    row.description ?? '',
    row.category,
    typeLabel,
    section.headline,
    section.diagramLabel,
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
