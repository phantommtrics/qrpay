import { apiFetchBinary, apiRequest } from './salesApi'

export type SalesDocumentChartAccount = {
  id: string
  code: string
  name: string
}

export type SalesDocumentLine = {
  id: string
  chartOfAccountId: string
  narration: string
  quantity: number
  unitLabel: string | null
  unitAmount: number
  taxAmount: number
  sortOrder: number
  chartOfAccount?: SalesDocumentChartAccount
}

export type SalesQuotationContact = { id: string; name: string; email: string | null }

export type SalesQuotationRow = {
  id: string
  businessId: string
  contactId: string
  publicCode: string
  status: string
  validUntil: string | null
  reference: string | null
  currency: string
  createdAt: string
  updatedAt: string
  contact: SalesQuotationContact
  invoiceFromQuote: { id: string; publicCode: string; status: string } | null
  lines: SalesDocumentLine[]
}

export type SalesInvoiceRow = {
  id: string
  businessId: string
  contactId: string
  sourceQuotationId: string | null
  publicCode: string
  status: string
  issueDate: string
  dueDate: string | null
  reference: string | null
  currency: string
  settlementChartAccountId: string | null
  journalEntryId: string | null
  approvedAt: string | null
  paidAt: string | null
  createdAt: string
  updatedAt: string
  contact: SalesQuotationContact
  sourceQuotation: { id: string; publicCode: string } | null
  journalEntry: { id: string; postedAt: string } | null
  lines: SalesDocumentLine[]
}

export type SalesDocumentLinePayload = {
  chartOfAccountId: string
  narration?: string | null
  quantity: number
  unitLabel?: string | null
  unitAmount: number
  taxAmount?: number
}

export type CreateSalesQuotationBody = {
  contactId: string
  reference?: string | null
  validUntil?: string | null
  currency?: string | null
  lines: SalesDocumentLinePayload[]
}

export type PatchSalesQuotationBody = Partial<CreateSalesQuotationBody>

export type CreateSalesInvoiceBody = {
  contactId: string
  issueDate: string
  dueDate?: string | null
  reference?: string | null
  currency?: string | null
  lines: SalesDocumentLinePayload[]
}

export type PatchSalesInvoiceBody = Partial<CreateSalesInvoiceBody>

export type MarkSalesInvoicePaidBody = {
  settlementChartAccountId: string
  postedAt: string
}

export async function fetchSalesQuotations(businessId: string): Promise<SalesQuotationRow[]> {
  const res = await apiRequest<{ data: SalesQuotationRow[] }>(
    `/businesses/${businessId}/sales-quotations`,
    { method: 'GET', businessId },
  )
  return res.data
}

export async function fetchSalesQuotation(
  businessId: string,
  quotationId: string,
): Promise<SalesQuotationRow> {
  const res = await apiRequest<{ data: SalesQuotationRow }>(
    `/businesses/${businessId}/sales-quotations/${quotationId}`,
    { method: 'GET', businessId },
  )
  return res.data
}

export async function createSalesQuotation(
  businessId: string,
  body: CreateSalesQuotationBody,
): Promise<SalesQuotationRow> {
  const res = await apiRequest<{ data: SalesQuotationRow }>(
    `/businesses/${businessId}/sales-quotations`,
    { method: 'POST', businessId, body: JSON.stringify(body) },
  )
  return res.data
}

export async function patchSalesQuotation(
  businessId: string,
  quotationId: string,
  body: PatchSalesQuotationBody,
): Promise<SalesQuotationRow> {
  const res = await apiRequest<{ data: SalesQuotationRow }>(
    `/businesses/${businessId}/sales-quotations/${quotationId}`,
    { method: 'PATCH', businessId, body: JSON.stringify(body) },
  )
  return res.data
}

export async function sendSalesQuotation(
  businessId: string,
  quotationId: string,
): Promise<SalesQuotationRow> {
  const res = await apiRequest<{ data: SalesQuotationRow }>(
    `/businesses/${businessId}/sales-quotations/${quotationId}/send`,
    { method: 'POST', businessId },
  )
  return res.data
}

export async function acceptSalesQuotation(
  businessId: string,
  quotationId: string,
): Promise<SalesInvoiceRow> {
  const res = await apiRequest<{ data: SalesInvoiceRow }>(
    `/businesses/${businessId}/sales-quotations/${quotationId}/accept`,
    { method: 'POST', businessId },
  )
  return res.data
}

export async function rejectSalesQuotation(
  businessId: string,
  quotationId: string,
): Promise<SalesQuotationRow> {
  const res = await apiRequest<{ data: SalesQuotationRow }>(
    `/businesses/${businessId}/sales-quotations/${quotationId}/reject`,
    { method: 'POST', businessId },
  )
  return res.data
}

export async function fetchSalesInvoices(businessId: string): Promise<SalesInvoiceRow[]> {
  const res = await apiRequest<{ data: SalesInvoiceRow[] }>(
    `/businesses/${businessId}/sales-invoices`,
    { method: 'GET', businessId },
  )
  return res.data
}

export async function fetchSalesInvoice(
  businessId: string,
  invoiceId: string,
): Promise<SalesInvoiceRow> {
  const res = await apiRequest<{ data: SalesInvoiceRow }>(
    `/businesses/${businessId}/sales-invoices/${invoiceId}`,
    { method: 'GET', businessId },
  )
  return res.data
}

export async function createSalesInvoice(
  businessId: string,
  body: CreateSalesInvoiceBody,
): Promise<SalesInvoiceRow> {
  const res = await apiRequest<{ data: SalesInvoiceRow }>(
    `/businesses/${businessId}/sales-invoices`,
    { method: 'POST', businessId, body: JSON.stringify(body) },
  )
  return res.data
}

export async function patchSalesInvoice(
  businessId: string,
  invoiceId: string,
  body: PatchSalesInvoiceBody,
): Promise<SalesInvoiceRow> {
  const res = await apiRequest<{ data: SalesInvoiceRow }>(
    `/businesses/${businessId}/sales-invoices/${invoiceId}`,
    { method: 'PATCH', businessId, body: JSON.stringify(body) },
  )
  return res.data
}

export async function approveSalesInvoice(
  businessId: string,
  invoiceId: string,
): Promise<SalesInvoiceRow> {
  const res = await apiRequest<{ data: SalesInvoiceRow }>(
    `/businesses/${businessId}/sales-invoices/${invoiceId}/approve`,
    { method: 'POST', businessId },
  )
  return res.data
}

export async function markSalesInvoicePaid(
  businessId: string,
  invoiceId: string,
  body: MarkSalesInvoicePaidBody,
): Promise<SalesInvoiceRow> {
  const res = await apiRequest<{ data: SalesInvoiceRow }>(
    `/businesses/${businessId}/sales-invoices/${invoiceId}/mark-paid`,
    { method: 'POST', businessId, body: JSON.stringify(body) },
  )
  return res.data
}

export async function voidSalesInvoice(
  businessId: string,
  invoiceId: string,
): Promise<SalesInvoiceRow> {
  const res = await apiRequest<{ data: SalesInvoiceRow }>(
    `/businesses/${businessId}/sales-invoices/${invoiceId}/void`,
    { method: 'POST', businessId },
  )
  return res.data
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = globalThis.document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadSalesInvoicePdf(businessId: string, invoiceId: string): Promise<void> {
  const { blob, filename } = await apiFetchBinary(
    `/businesses/${businessId}/sales-invoices/${invoiceId}/pdf`,
    { method: 'GET', businessId },
  )
  triggerBlobDownload(blob, filename ?? `invoice-${invoiceId.slice(0, 8)}.pdf`)
}

export async function downloadSalesQuotationPdf(
  businessId: string,
  quotationId: string,
): Promise<void> {
  const { blob, filename } = await apiFetchBinary(
    `/businesses/${businessId}/sales-quotations/${quotationId}/pdf`,
    { method: 'GET', businessId },
  )
  triggerBlobDownload(blob, filename ?? `quotation-${quotationId.slice(0, 8)}.pdf`)
}
