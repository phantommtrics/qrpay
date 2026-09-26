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
    accountType?: string
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

export type BalanceSheetLine = {
  chartOfAccountId: string
  code: string
  name: string
  amount: number
}

export type BalanceSheetGroup = {
  key: string
  label: string
  lines: BalanceSheetLine[]
  subtotal: number
}

export type BalanceSheetReportData = {
  asOf: string
  assets: {
    current: BalanceSheetGroup
    fixed: BalanceSheetGroup
    nonCurrent: BalanceSheetGroup
    total: number
  }
  liabilities: {
    current: BalanceSheetGroup
    longTerm: BalanceSheetGroup
    total: number
  }
  netAssets: number
  equity: {
    glLines: BalanceSheetLine[]
    equityFromGl: number
    ytdNetIncome: number
    retainedAndOtherEquity: number
    total: number
    ytdRange: { from: string; to: string }
  }
  checks: {
    netAssetsEqualsEquity: boolean
    equationResidual: number
  }
}

function emptyGroup(key: string, label: string): BalanceSheetGroup {
  return { key, label, lines: [], subtotal: 0 }
}

function coerceGroup(
  group: Partial<BalanceSheetGroup> | undefined,
  key: string,
  label: string,
): BalanceSheetGroup {
  if (!group) return emptyGroup(key, label)
  const lines = Array.isArray(group.lines) ? group.lines : []
  const subtotal = Number(group.subtotal)
  return {
    key: group.key || key,
    label: group.label || label,
    lines,
    subtotal: Number.isFinite(subtotal) ? subtotal : 0,
  }
}

/** Accepts the current report and the previous bank / other-current-assets payload. */
export function normalizeBalanceSheetReport(raw: BalanceSheetReportData): BalanceSheetReportData {
  const assets = raw?.assets as BalanceSheetReportData['assets'] & {
    bank?: BalanceSheetGroup
    otherCurrentAssets?: BalanceSheetGroup
  }
  const liabilities = raw?.liabilities as BalanceSheetReportData['liabilities'] & {
    nonCurrent?: BalanceSheetGroup
  }

  const current = assets?.current
    ? coerceGroup(assets.current, 'current_assets', 'Current assets')
    : coerceGroup(
        assets?.bank || assets?.otherCurrentAssets
          ? {
              key: 'current_assets',
              label: 'Current assets',
              lines: [...(assets.bank?.lines ?? []), ...(assets.otherCurrentAssets?.lines ?? [])],
              subtotal:
                (Number(assets.bank?.subtotal) || 0) + (Number(assets.otherCurrentAssets?.subtotal) || 0),
            }
          : undefined,
        'current_assets',
        'Current assets',
      )

  return {
    ...raw,
    assets: {
      current,
      fixed: coerceGroup(assets?.fixed, 'fixed_assets', 'Fixed assets'),
      nonCurrent: coerceGroup(assets?.nonCurrent, 'non_current_assets', 'Non-current assets'),
      total: Number(assets?.total) || 0,
    },
    liabilities: {
      current: coerceGroup(liabilities?.current, 'current_liab', 'Current liabilities'),
      longTerm: coerceGroup(
        liabilities?.longTerm ?? liabilities?.nonCurrent,
        'long_term_liab',
        'Long-term liabilities',
      ),
      total: Number(liabilities?.total) || 0,
    },
    equity: {
      glLines: raw?.equity?.glLines ?? [],
      equityFromGl: raw?.equity?.equityFromGl ?? 0,
      ytdNetIncome: raw?.equity?.ytdNetIncome ?? 0,
      retainedAndOtherEquity: raw?.equity?.retainedAndOtherEquity ?? 0,
      total: raw?.equity?.total ?? 0,
      ytdRange: raw?.equity?.ytdRange ?? { from: raw?.asOf ?? '', to: raw?.asOf ?? '' },
    },
  }
}

export async function fetchBalanceSheetReport(
  businessId: string,
  asOf: string,
): Promise<BalanceSheetReportData> {
  const qs = new URLSearchParams({ asOf })
  const res = await apiRequest<{ data: BalanceSheetReportData }>(
    `/businesses/${businessId}/accounting/reports/balance-sheet?${qs}`,
    { method: 'GET', businessId },
  )
  return normalizeBalanceSheetReport(res.data)
}

export type PnlLine = { chartOfAccountId: string; code: string; name: string; amount: number }

export type ProfitLossReportData = {
  from: string
  to: string
  revenue: { lines: PnlLine[]; total: number }
  otherIncome: { lines: PnlLine[]; total: number }
  costOfSales: { lines: PnlLine[]; total: number }
  operatingExpenses: { lines: PnlLine[]; total: number }
  grossProfit: number
  operatingProfit: number
  netProfit: number
}

function pnlSection(section: { lines?: PnlLine[]; total?: number } | undefined): {
  lines: PnlLine[]
  total: number
} {
  const total = Number(section?.total)
  return {
    lines: Array.isArray(section?.lines) ? section.lines : [],
    total: Number.isFinite(total) ? total : 0,
  }
}

export function normalizeProfitLossReport(raw: ProfitLossReportData): ProfitLossReportData {
  const revenue = pnlSection(raw?.revenue)
  const otherIncome = pnlSection(raw?.otherIncome)
  const costOfSales = pnlSection(raw?.costOfSales)
  const operatingExpenses = pnlSection(raw?.operatingExpenses)
  const grossProfit = Number.isFinite(Number(raw?.grossProfit))
    ? Number(raw.grossProfit)
    : revenue.total - costOfSales.total
  const operatingProfit = Number.isFinite(Number(raw?.operatingProfit))
    ? Number(raw.operatingProfit)
    : grossProfit - operatingExpenses.total
  const netProfit = Number.isFinite(Number(raw?.netProfit))
    ? Number(raw.netProfit)
    : operatingProfit + otherIncome.total
  return {
    ...raw,
    revenue,
    otherIncome,
    costOfSales,
    operatingExpenses,
    grossProfit,
    operatingProfit,
    netProfit,
  }
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
  return normalizeProfitLossReport(res.data)
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
