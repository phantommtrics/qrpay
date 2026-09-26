import type { ChartAccountType } from '../models/chartAccount'
import { apiRequest } from './salesApi'

export type ChartAccountKind = 'LEDGER' | 'BANK'

export type AccountingAccountRow = {
  id: string
  code: string
  name: string
  description: string | null
  category: string
  /** Statement subtype. Omitted on older API responses; the chart infers one from category. */
  accountType?: ChartAccountType | null
  balance: number
  /** Seeded / required for automation; not user-created. Omitted on older API responses. */
  isSystem?: boolean
  /** Defaults to LEDGER when omitted (older API). */
  kind?: ChartAccountKind
  bankAccountNumber?: string | null
  bankName?: string | null
  bankDetails?: string | null
}

export type AccountingPnl = {
  income: number
  tradingIncome?: number
  otherIncome?: number
  costOfSales: number
  operatingExpenses: number
  grossProfit: number
  netProfit: number
}

export type AccountingTrendPoint = {
  period: string
  income: number
  expenses: number
}

export type AccountingSummary = {
  accounts: AccountingAccountRow[]
  cashPositions: AccountingAccountRow[]
  cashTotal: number
  pnl: AccountingPnl
  trend: AccountingTrendPoint[]
  incomeAccounts: AccountingAccountRow[]
  otherIncomeAccounts?: AccountingAccountRow[]
  costOfGoodsSoldAccounts: AccountingAccountRow[]
  operatingExpenseAccounts: AccountingAccountRow[]
}

export async function fetchAccountingSummary(businessId: string): Promise<AccountingSummary> {
  const res = await apiRequest<{ data: AccountingSummary }>(
    `/businesses/${businessId}/accounting/summary`,
    { method: 'GET', businessId },
  )
  return res.data
}

export type ChartAccountCategory = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'

export type CreateChartAccountBody = {
  code: string
  name: string
  category: ChartAccountCategory
  accountType?: ChartAccountType | null
  description?: string | null
  kind?: ChartAccountKind
  bankAccountNumber?: string | null
  bankName?: string | null
  bankDetails?: string | null
  openingBalance?: number | null
  offsetChartOfAccountId?: string | null
  openingBalancePostedAt?: string | null
  openingBalanceMemo?: string | null
  openingBalanceReference?: string | null
}

export type CreatedChartAccount = {
  id: string
  code: string
  name: string
  description: string | null
  category: string
  accountType?: ChartAccountType | null
  kind: ChartAccountKind
  bankAccountNumber: string | null
  bankName: string | null
  bankDetails: string | null
  openingJournalEntryId?: string | null
}

export async function createChartAccount(
  businessId: string,
  body: CreateChartAccountBody,
): Promise<CreatedChartAccount> {
  const res = await apiRequest<{ data: CreatedChartAccount }>(
    `/businesses/${businessId}/chart-of-accounts`,
    {
      method: 'POST',
      businessId,
      body: JSON.stringify(body),
    },
  )
  return res.data
}

export type OpeningBalanceBody = {
  amount: number
  offsetChartOfAccountId?: string | null
  postedAt?: string | null
  memo?: string | null
  reference?: string | null
}

export type OpeningBalanceResult = {
  journalEntryId: string
  postedAt: string
  memo: string | null
  approvedAt: string | null
}

/** Default offset account for migration opening balances. */
export const OPENING_BALANCE_DEFAULT_EQUITY_CODE = '970'

export async function postOpeningBalance(
  businessId: string,
  accountId: string,
  body: OpeningBalanceBody,
): Promise<OpeningBalanceResult> {
  const res = await apiRequest<{ data: OpeningBalanceResult }>(
    `/businesses/${businessId}/chart-of-accounts/${accountId}/opening-balance`,
    {
      method: 'POST',
      businessId,
      body: JSON.stringify(body),
    },
  )
  return res.data
}

export function trendWithGrossProfit(points: AccountingTrendPoint[]) {
  return points.map((p) => ({
    ...p,
    grossProfit: p.income - p.expenses,
  }))
}
