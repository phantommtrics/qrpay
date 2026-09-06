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

export type PlatformMerchantCategoryJournalRow = CategorySalesSummaryRow & {
  businessId: string
  businessName: string
}

export type PlatformMerchantCategoryJournalCategory = {
  id: string
  businessId: string
  name: string
  parentId: string | null
  sortOrder: number
}

export type PlatformMerchantLedgerTotalsRow = SalesLedgerChannelTotalsRow & {
  businessId: string
  businessName: string
}

export type PlatformMerchantOption = {
  id: string
  name: string
}

export type PlatformMerchantPayoutJournalRow = {
  payoutId: string
  businessId: string
  businessName: string
  payoutDate: string
  paymentProvider: string
  paymentMethod: string
  gatewayCode: string | null
  recordedByUserId: string | null
  recordedByName: string | null
  recipientMobile: string
  recipientName: string
  wavePayoutId: string | null
  grossAmount: number
  withholdAmount: number
  receiveAmount: number
  fee: string | null
  currency: string
}

export type PlatformMerchantPaymentJournalRow = {
  paymentId: string
  paymentPublicCode: string
  orderPublicCode: string | null
  businessId: string
  businessName: string
  completedAt: string
  paymentProvider: string
  paymentMethod: string
  gatewayCode: string | null
  recordedByUserId: string | null
  recordedByName: string | null
  providerRef: string
  paymentAmount: number
  customerSaleLedgerTotal: number
  walletFeeLedgerTotal: number
  currency: string
}

export type PlatformMerchantCategoryJournal = {
  from: string
  to: string
  currency: string
  rows: PlatformMerchantCategoryJournalRow[]
  categories: PlatformMerchantCategoryJournalCategory[]
  ledgerTotals: PlatformMerchantLedgerTotalsRow[]
  payoutRows: PlatformMerchantPayoutJournalRow[]
  paymentRows?: PlatformMerchantPaymentJournalRow[]
  merchants: PlatformMerchantOption[]
}

export type PlatformMerchantJournalSection = 'journal' | 'fee' | 'settlement' | '360'

export async function fetchPlatformMerchantCategoryJournal(params: {
  from: string
  to: string
  businessId?: string
  section?: PlatformMerchantJournalSection
}): Promise<PlatformMerchantCategoryJournal> {
  const qs = new URLSearchParams({ from: params.from, to: params.to })
  if (params.businessId) {
    qs.set('businessId', params.businessId)
  }
  if (params.section) {
    qs.set('section', params.section)
  }
  const res = await apiRequest<{ data: PlatformMerchantCategoryJournal }>(
    `/platform/business-merchants/journal?${qs}`,
    { method: 'GET' },
  )
  return res.data
}
