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

export type GeneralJournalLinePayload = {
  chartOfAccountId: string
  description?: string | null
  debit: number
  credit: number
}

export async function postGeneralJournal(
  businessId: string,
  body: {
    contactId?: string | null
    newContactName?: string | null
    newContactEmail?: string | null
    newContactPhone?: string | null
    postedAt: string
    reference?: string | null
    memo?: string | null
    lines: GeneralJournalLinePayload[]
  },
): Promise<PostJournalResponse> {
  const res = await apiRequest<{ data: PostJournalResponse }>(
    `/businesses/${businessId}/journals/general`,
    { method: 'POST', businessId, body: JSON.stringify(body) },
  )
  return res.data
}

/** Matches backend `JournalSourceType` for filter dropdown. */
export const JOURNAL_SOURCE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'CUSTOMER_SALE_PAYMENT', label: 'Customer sale payment' },
  { value: 'CUSTOMER_SALE_WALLET_FEE', label: 'Customer sale wallet fee' },
  { value: 'MANUAL_MONEY_IN', label: 'Money in' },
  { value: 'MANUAL_MONEY_OUT', label: 'Money out' },
  { value: 'MANUAL_BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'SALES_INVOICE_PAYMENT', label: 'Sales invoice payment' },
  { value: 'PURCHASE_BILL_PAYMENT', label: 'Purchase bill payment' },
  { value: 'MANUAL_GENERAL_JOURNAL', label: 'General journal' },
  { value: 'MANUAL_JOURNAL_REVERSAL', label: 'Journal reversal' },
]

export type JournalEntryListRow = {
  id: string
  postedAt: string
  memo: string | null
  reference: string | null
  sourceType: string | null
  sourceId: string | null
  lineCount: number
  totalDebit: number
  totalCredit: number
  reversesJournalEntryId: string | null
}

export type JournalLineDetail = {
  id: string
  debitAmount: string
  creditAmount: string
  description: string | null
  quantity: string | null
  unitLabel: string | null
  taxAmount: string
  chartOfAccount: { id: string; code: string; name: string }
}

export type JournalReversalDetail = {
  canReverse: boolean
  blockReason: string | null
  entry: {
    id: string
    postedAt: string
    memo: string | null
    reference: string | null
    sourceType: string | null
    sourceId: string | null
    reversesJournalEntryId: string | null
    lines: JournalLineDetail[]
    salesInvoiceFromPayment: { id: string; publicCode: string } | null
    billFromPayment: { id: string; publicCode: string } | null
    reversedByEntry: { id: string; postedAt: string } | null
    reversesJournalEntry: { id: string; postedAt: string } | null
  }
}

export type JournalEntriesPageQuery = {
  page?: number
  pageSize?: number
  startDate?: string
  endDate?: string
  /** JournalSourceType or empty for all */
  sourceType?: string
}

export type JournalEntriesPageResult = {
  entries: JournalEntryListRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function fetchJournalEntriesPage(
  businessId: string,
  query: JournalEntriesPageQuery = {},
): Promise<JournalEntriesPageResult> {
  const params = new URLSearchParams()
  if (query.page != null && Number.isFinite(query.page)) params.set('page', String(query.page))
  if (query.pageSize != null && Number.isFinite(query.pageSize))
    params.set('pageSize', String(query.pageSize))
  if (query.startDate?.trim()) params.set('startDate', query.startDate.trim())
  if (query.endDate?.trim()) params.set('endDate', query.endDate.trim())
  if (query.sourceType?.trim()) params.set('sourceType', query.sourceType.trim())
  const qs = params.toString()
  const res = await apiRequest<{ data: JournalEntriesPageResult }>(
    `/businesses/${businessId}/journal-entries${qs ? `?${qs}` : ''}`,
    { method: 'GET', businessId },
  )
  return res.data
}

export async function fetchJournalEntryReversalDetail(
  businessId: string,
  journalEntryId: string,
): Promise<JournalReversalDetail> {
  const res = await apiRequest<{ data: JournalReversalDetail }>(
    `/businesses/${businessId}/journal-entries/${journalEntryId}`,
    { method: 'GET', businessId },
  )
  return res.data
}

export type PostJournalReversalResponse = {
  journalEntryId: string
  postedAt: string
  memo: string | null
  reversesJournalEntryId: string
  lineCount: number
}

export async function postJournalReversal(
  businessId: string,
  journalEntryId: string,
  body: { postedAt: string; memo?: string | null },
): Promise<PostJournalReversalResponse> {
  const res = await apiRequest<{ data: PostJournalReversalResponse }>(
    `/businesses/${businessId}/journal-entries/${journalEntryId}/reverse`,
    { method: 'POST', businessId, body: JSON.stringify(body) },
  )
  return res.data
}
