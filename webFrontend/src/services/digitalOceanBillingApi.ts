import { apiFetchBinary, apiRequest } from './salesApi'

export type DigitalOceanInvoiceStatus = 'SYNCED' | 'POSTED'

export type DigitalOceanInvoiceSummarySnapshot = {
  amount: string
  invoiceId: string
  invoiceUuid: string
  billingPeriod: string
  productCharges: Array<{ key: string; name: string; amountUsd: string; count?: string }>
  taxesUsd: string
  overagesUsd: string
  creditsUsd: string
}

export type DigitalOceanInvoiceRow = {
  id: string
  invoiceUuid: string
  invoiceId: string
  billingPeriod: string
  amountUsd: string
  isPreview: boolean
  status: DigitalOceanInvoiceStatus
  summary: DigitalOceanInvoiceSummarySnapshot | null
  fxRateGmdPerUsd: string | null
  amountGmd: string | null
  settlementChartAccountId: string | null
  settlementAccount: { id: string; code: string; name: string } | null
  platformBillId: string | null
  platformBill: { id: string; publicCode: string } | null
  platformJournalEntryId: string | null
  platformJournalEntry: { id: string; postedAt: string } | null
  postedAt: string | null
  syncedAt: string
  createdAt: string
  updatedAt: string
}

export type DigitalOceanInvoiceListPayload = {
  configured: boolean
  lastSyncedAt: string | null
  lastFxRateGmdPerUsd: string | null
  invoicePreview: {
    invoiceUuid: string
    invoiceId: string
    amountUsd: string
    billingPeriod: string
  } | null
  invoices: DigitalOceanInvoiceRow[]
  upserted?: number
}

export type DigitalOceanBalancePayload = {
  configured: boolean
  accountBalance: string
  monthToDateBalance: string
  monthToDateUsage: string
  generatedAt: string
  currency: string
}

export type DigitalOceanBillingHistoryItem = {
  amount: string
  date: string
  description: string
  invoiceId: string | null
  invoiceUuid: string | null
  type: string
}

export type DigitalOceanInvoiceItem = {
  amount: string
  description?: string
  duration?: string
  duration_unit?: string
  product?: string
  project_name?: string
  group_description?: string
  resource_uuid?: string
}

export type DigitalOceanProposedLine = {
  key: string
  name: string
  amountUsd: string
  amountGmd: string
  chartOfAccountId: string
  chartCode: string
  chartName: string
}

export type DigitalOceanInvoiceDetailPayload = {
  configured: boolean
  isPreview: boolean
  canPost: boolean
  invoice:
    | DigitalOceanInvoiceRow
    | {
        invoiceUuid: string
        invoiceId: string
        billingPeriod: string
        amountUsd: string
        status: string
        summary: DigitalOceanInvoiceSummarySnapshot
      }
  items: DigitalOceanInvoiceItem[]
  proposedLines: DigitalOceanProposedLine[]
  defaultChart?: { id: string; code: string; name: string }
}

export function formatUsdAmount(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '$0.00'
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export async function fetchDigitalOceanBalance(): Promise<DigitalOceanBalancePayload> {
  const res = await apiRequest<{ data: DigitalOceanBalancePayload }>(
    '/platform/digitalocean-billing/balance',
  )
  return res.data
}

export async function fetchDigitalOceanBillingHistory(): Promise<DigitalOceanBillingHistoryItem[]> {
  const res = await apiRequest<{ data: { items: DigitalOceanBillingHistoryItem[] } }>(
    '/platform/digitalocean-billing/billing-history',
  )
  return res.data.items
}

export async function fetchDigitalOceanInvoices(): Promise<DigitalOceanInvoiceListPayload> {
  const res = await apiRequest<{ data: DigitalOceanInvoiceListPayload }>(
    '/platform/digitalocean-billing/invoices',
  )
  return res.data
}

export async function syncDigitalOceanInvoices(): Promise<DigitalOceanInvoiceListPayload> {
  const res = await apiRequest<{ data: DigitalOceanInvoiceListPayload }>(
    '/platform/digitalocean-billing/invoices/sync',
    { method: 'POST', body: '{}' },
  )
  return res.data
}

export async function fetchDigitalOceanInvoiceDetail(
  invoiceUuid: string,
): Promise<DigitalOceanInvoiceDetailPayload> {
  const res = await apiRequest<{ data: DigitalOceanInvoiceDetailPayload }>(
    `/platform/digitalocean-billing/invoices/${encodeURIComponent(invoiceUuid)}`,
  )
  return res.data
}

export async function postDigitalOceanInvoiceJournal(
  invoiceUuid: string,
  body: {
    fxRateGmdPerUsd: number | string
    settlementChartAccountId: string
    postedAt: string
    lines?: Array<{ key: string; chartOfAccountId: string }>
  },
): Promise<DigitalOceanInvoiceRow> {
  const res = await apiRequest<{ data: DigitalOceanInvoiceRow }>(
    `/platform/digitalocean-billing/invoices/${encodeURIComponent(invoiceUuid)}/post-journal`,
    { method: 'POST', body: JSON.stringify(body) },
  )
  return res.data
}

export async function downloadDigitalOceanInvoicePdf(invoiceUuid: string): Promise<void> {
  const { blob, filename } = await apiFetchBinary(
    `/platform/digitalocean-billing/invoices/${encodeURIComponent(invoiceUuid)}/pdf`,
    { method: 'GET' },
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `digitalocean-invoice-${invoiceUuid.slice(0, 8)}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
