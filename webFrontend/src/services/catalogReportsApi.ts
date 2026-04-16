import { apiRequest } from './salesApi'

export type CategorySalesSummaryRow = {
  /** UTC calendar date (YYYY-MM-DD) of payment completion. */
  saleDate: string
  paymentProvider: string
  paymentMethod: string
  gatewayCode: string | null
  recordedByUserId: string | null
  recordedByName: string | null
  menuCategoryId: string | null
  amount: number
}

export type SalesLedgerChannelTotalsRow = {
  paymentProvider: string
  paymentMethod: string
  gatewayCode: string | null
  customerSaleLedgerTotal: number
  walletFeeLedgerTotal: number
}

export type CategorySalesSummaryReport = {
  from: string
  to: string
  currency: string
  rows: CategorySalesSummaryRow[]
  ledgerTotalsByChannel: SalesLedgerChannelTotalsRow[]
}

export async function fetchSalesByCategoryReport(
  businessId: string,
  from: string,
  to: string,
): Promise<CategorySalesSummaryReport> {
  const qs = new URLSearchParams({ from, to })
  const res = await apiRequest<{ data: CategorySalesSummaryReport }>(
    `/businesses/${businessId}/reports/sales-by-category?${qs}`,
    { method: 'GET', businessId },
  )
  return res.data
}
