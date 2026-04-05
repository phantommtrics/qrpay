import { apiRequest } from './salesApi'

export type ChartAccountKind = 'LEDGER' | 'BANK'

export type AccountingAccountRow = {
  id: string
  code: string
  name: string
  description: string | null
  category: string
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
  description?: string | null
  kind?: ChartAccountKind
  bankAccountNumber?: string | null
  bankName?: string | null
  bankDetails?: string | null
}

export type CreatedChartAccount = {
  id: string
  code: string
  name: string
  description: string | null
  category: string
  kind: ChartAccountKind
  bankAccountNumber: string | null
  bankName: string | null
  bankDetails: string | null
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

export function trendWithGrossProfit(points: AccountingTrendPoint[]) {
  return points.map((p) => ({
    ...p,
    grossProfit: p.income - p.expenses,
  }))
}
