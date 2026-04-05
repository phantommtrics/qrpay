import { apiRequest } from './salesApi'

export type BusinessContactRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
}

export async function fetchBusinessContacts(
  businessId: string,
  q?: string,
): Promise<BusinessContactRow[]> {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
  const res = await apiRequest<{ data: BusinessContactRow[] }>(
    `/businesses/${businessId}/contacts${qs}`,
    { method: 'GET', businessId },
  )
  return res.data
}

export async function createBusinessContact(
  businessId: string,
  body: { name: string; email?: string | null; phone?: string | null },
): Promise<BusinessContactRow> {
  const res = await apiRequest<{ data: BusinessContactRow }>(
    `/businesses/${businessId}/contacts`,
    { method: 'POST', businessId, body: JSON.stringify(body) },
  )
  return res.data
}

export type ManualJournalLinePayload = {
  chartOfAccountId: string
  narration: string
  quantity: number
  unitLabel?: string | null
  unitAmount: number
  taxAmount: number
}

export type PostJournalResponse = {
  journalEntryId: string
  postedAt: string
  memo: string | null
}

export async function postMoneyInJournal(
  businessId: string,
  body: {
    contactId?: string | null
    newContactName?: string | null
    newContactEmail?: string | null
    newContactPhone?: string | null
    postedAt: string
    reference?: string | null
    settlementChartAccountId: string
    lines: ManualJournalLinePayload[]
  },
): Promise<PostJournalResponse> {
  const res = await apiRequest<{ data: PostJournalResponse }>(
    `/businesses/${businessId}/journals/money-in`,
    { method: 'POST', businessId, body: JSON.stringify(body) },
  )
  return res.data
}

export async function postMoneyOutJournal(
  businessId: string,
  body: {
    contactId?: string | null
    newContactName?: string | null
    newContactEmail?: string | null
    newContactPhone?: string | null
    postedAt: string
    reference?: string | null
    settlementChartAccountId: string
    lines: ManualJournalLinePayload[]
  },
): Promise<PostJournalResponse> {
  const res = await apiRequest<{ data: PostJournalResponse }>(
    `/businesses/${businessId}/journals/money-out`,
    { method: 'POST', businessId, body: JSON.stringify(body) },
  )
  return res.data
}

export async function postBankTransferJournal(
  businessId: string,
  body: {
    fromChartAccountId: string
    toChartAccountId: string
    amount: number
    postedAt: string
    reference?: string | null
  },
): Promise<PostJournalResponse> {
  const res = await apiRequest<{ data: PostJournalResponse }>(
    `/businesses/${businessId}/journals/bank-transfer`,
    { method: 'POST', businessId, body: JSON.stringify(body) },
  )
  return res.data
}
