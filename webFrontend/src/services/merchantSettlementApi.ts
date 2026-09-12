import { apiRequest } from './salesApi'

export type MerchantSettlementSummary = {
  currency: string
  clearingBalance: number
  openRequestTotal: number
  availableForSettlement: number
  walletFeesIncurred: number
  walletFeeExpenseBalance: number
}

export type MerchantSettlementRequestRow = {
  id: string
  amount: number
  currency: string
  note: string | null
  status: 'OPEN' | 'CANCELLED' | 'COMPLETED'
  ticketingRef: string | null
  ticketingTicketId: string | null
  requestedByName: string | null
  createdAt: string
}

export type MerchantSettlementRequestsResult = {
  data: MerchantSettlementRequestRow[]
  meta: { total: number; from: string | null; to: string | null }
}

export async function fetchMerchantSettlementSummary(
  businessId: string,
): Promise<MerchantSettlementSummary> {
  const res = await apiRequest<{ data: MerchantSettlementSummary }>(
    `/businesses/${businessId}/sales-settlement/summary`,
    { businessId },
  )
  return res.data
}

export async function fetchMerchantSettlementRequests(
  businessId: string,
  filters?: { from?: string; to?: string },
): Promise<MerchantSettlementRequestsResult> {
  const params = new URLSearchParams()
  if (filters?.from) params.set('from', filters.from)
  if (filters?.to) params.set('to', filters.to)
  const qs = params.toString()
  const path = `/businesses/${businessId}/sales-settlement/requests${qs ? `?${qs}` : ''}`
  return apiRequest<MerchantSettlementRequestsResult>(path, { businessId })
}

export async function createMerchantSettlementRequest(
  businessId: string,
  body: { amount: number; note?: string | null },
): Promise<MerchantSettlementRequestRow> {
  const res = await apiRequest<{ data: MerchantSettlementRequestRow }>(
    `/businesses/${businessId}/sales-settlement/requests`,
    {
      method: 'POST',
      businessId,
      body: JSON.stringify(body),
    },
  )
  return res.data
}

export type MerchantSettlementRequestDetail = MerchantSettlementRequestRow & {
  desklineStatus: string | null
  desklineSummary: string | null
  comments: Array<{
    id: string
    body: string
    authorName: string
    createdAt: string
  }>
  statusChanges: Array<{
    id: string
    fromStatus: string | null
    toStatus: string
    note: string | null
    actorName: string | null
    createdAt: string
  }>
}

export async function fetchMerchantSettlementRequestDetail(
  businessId: string,
  requestId: string,
): Promise<MerchantSettlementRequestDetail> {
  const res = await apiRequest<{ data: MerchantSettlementRequestDetail }>(
    `/businesses/${businessId}/sales-settlement/requests/${requestId}`,
    { businessId },
  )
  return res.data
}
