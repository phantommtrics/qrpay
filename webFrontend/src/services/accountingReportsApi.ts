import { apiRequest } from './salesApi'

export type ChartAccountMini = {
  id: string
  code: string
  name: string
  category: string
}

export async function fetchAccountsForReports(businessId: string): Promise<ChartAccountMini[]> {
  const res = await apiRequest<{ data: ChartAccountMini[] }>(
    `/businesses/${businessId}/accounting/accounts-for-reports`,
    { method: 'GET', businessId },
  )
  return res.data
}

export type GlBalanceReportData = {
  asOf: string
  rows: Array<{
    chartOfAccountId: string
    code: string
    name: string
    category: string
    debitTotal: number
    creditTotal: number
    balance: number
  }>
  totalDebit: number
  totalCredit: number
  difference: number
}

export async function fetchGlBalanceReport(
  businessId: string,
  asOf: string,
): Promise<GlBalanceReportData> {
  const qs = new URLSearchParams({ asOf })
  const res = await apiRequest<{ data: GlBalanceReportData }>(
    `/businesses/${businessId}/accounting/reports/gl-balance?${qs}`,
    { method: 'GET', businessId },
  )
  return res.data
}

export type PnlLine = { chartOfAccountId: string; code: string; name: string; amount: number }

export type ProfitLossReportData = {
  from: string
  to: string
  revenue: { lines: PnlLine[]; total: number }
  costOfSales: { lines: PnlLine[]; total: number }
  operatingExpenses: { lines: PnlLine[]; total: number }
  grossProfit: number
  netProfit: number
}

export async function fetchProfitLossReport(
  businessId: string,
  from: string,
  to: string,
): Promise<ProfitLossReportData> {
  const qs = new URLSearchParams({ from, to })
  const res = await apiRequest<{ data: ProfitLossReportData }>(
    `/businesses/${businessId}/accounting/reports/profit-loss?${qs}`,
    { method: 'GET', businessId },
  )
  return res.data
}

export type AccountStatementLine = {
  id: string
  postedAt: string
  journalEntryId: string
  reference: string | null
  memo: string | null
  lineDescription: string | null
  debit: number
  credit: number
  balance: number
}

export type AccountStatementReportData = {
  account: { id: string; code: string; name: string; category: string }
  from: string
  to: string
  openingBalance: number
  closingBalance: number
  lines: AccountStatementLine[]
}

export type AccountStatementsReportPayload = {
  statements: AccountStatementReportData[]
}

export async function fetchAccountStatementReports(
  businessId: string,
  chartOfAccountIds: string[],
  from: string,
  to: string,
): Promise<AccountStatementReportData[]> {
  if (chartOfAccountIds.length === 0) return []
  const qs = new URLSearchParams({
    chartOfAccountIds: chartOfAccountIds.join(','),
    from,
    to,
  })
  const res = await apiRequest<{ data: AccountStatementsReportPayload }>(
    `/businesses/${businessId}/accounting/reports/account-statement?${qs}`,
    { method: 'GET', businessId },
  )
  return res.data.statements
}

export async function fetchAccountStatementReport(
  businessId: string,
  chartOfAccountId: string,
  from: string,
  to: string,
): Promise<AccountStatementReportData> {
  const list = await fetchAccountStatementReports(businessId, [chartOfAccountId], from, to)
  const first = list[0]
  if (!first) {
    throw new Error('Account statement not returned.')
  }
  return first
}
