import { API_BASE_URL } from '../config/api'

import type { SalesInvoiceRow, SalesQuotationRow } from './salesDocumentsApi'
import { ApiError } from './subscriptionApi'

const STORAGE_KEY_TOKEN = 'qrpay.auth.token'

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEY_TOKEN)
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit & { businessId?: string },
): Promise<T> {
  const token = getStoredToken()
  const { businessId, ...rest } = init ?? {}
  const headers = new Headers(rest.headers)
  if (businessId) {
    headers.set('x-business-id', businessId)
  }
  const isFormData = rest.body instanceof FormData
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers,
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Request failed.'
    throw new ApiError(errorMessage, response.status)
  }

  return payload as T
}

/** Binary responses (e.g. PDF); skips JSON parse. Returns optional filename from Content-Disposition. */
export async function apiFetchBinary(
  path: string,
  init?: RequestInit & { businessId?: string },
): Promise<{ blob: Blob; filename: string | null }> {
  const token = getStoredToken()
  const { businessId, ...rest } = init ?? {}
  const headers = new Headers(rest.headers)
  if (businessId) {
    headers.set('x-business-id', businessId)
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers,
  })

  if (!response.ok) {
    let errorMessage = 'Request failed.'
    try {
      const payload: unknown = await response.json()
      if (
        payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        typeof (payload as { error: unknown }).error === 'string'
      ) {
        errorMessage = (payload as { error: string }).error
      }
    } catch {
      /* ignore */
    }
    throw new ApiError(errorMessage, response.status)
  }

  const blob = await response.blob()
  let filename: string | null = null
  const cd = response.headers.get('Content-Disposition')
  if (cd) {
    const m = /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(cd)
    if (m) {
      try {
        filename = decodeURIComponent(m[1].replace(/"/g, '').trim())
      } catch {
        filename = m[1].replace(/"/g, '').trim()
      }
    }
  }
  return { blob, filename }
}

export type SaleOrderLine = {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export type SaleOrder = {
  id: string
  businessId: string
  publicCode: string
  status: string
  subtotal: number
  taxAmount: number
  total: number
  currency: string
  createdAt: string
  diningTableId?: string | null
  tableLabel?: string | null
  lines: SaleOrderLine[]
  payments?: SalePayment[]
  receipt?: { id: string; publicCode: string; receiptNumber: number } | null
}

export type SalePayment = {
  id: string
  orderId: string | null
  orderPublicCode: string | null
  salesInvoiceId?: string | null
  salesInvoicePublicCode?: string | null
  businessId: string
  publicCode: string
  publicToken: string
  amount: number
  currency: string
  status: 'pending' | 'completed' | 'failed'
  reference: string
  providerReference: string
  method: 'qr_wallet' | 'cash'
  provider: string
  gatewayCode?: string | null
  createdAt: string
  completedAt: string | null
}

export type OrderCheckoutWalletRow = {
  gatewayId: string
  code: string
  name: string
  checkoutAdapter: string
  /** When true (Yonna), server uses phone from Merchant API credentials. */
  hasStoredPayerPhone: boolean
}

export type StartWalletCheckoutResponse = {
  payment: SalePayment
  qrPayload: string
  launchUrl: string
  paymentHtml: string | null
  checkoutAdapter: string
}

export type OrdersListResponse = {
  total: number
  page: number
  pageSize: number
  orders: SaleOrder[]
}

export async function fetchSaleOrders(
  businessId: string,
  params?: { page?: number; pageSize?: number; q?: string; status?: string },
): Promise<OrdersListResponse> {
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 20
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  const status = params?.status?.trim()
  if (status && status !== 'all') {
    qs.set('status', status)
  }
  const q = params?.q?.trim()
  if (q) {
    qs.set('q', q)
  }
  const res = await apiRequest<{ data: OrdersListResponse }>(
    `/businesses/${businessId}/orders?${qs.toString()}`,
    {
      method: 'GET',
      businessId,
    },
  )
  return res.data
}

export async function cancelSaleOrder(businessId: string, orderId: string): Promise<void> {
  await apiRequest<unknown>(`/businesses/${businessId}/orders/${orderId}/cancel`, {
    method: 'POST',
    businessId,
  })
}

/** Anonymous guest order from table QR (no auth). */
export async function postPublicRestaurantOrder(
  businessSlug: string,
  tableToken: string,
  lines: { productId: string; quantity: number }[],
): Promise<SaleOrder> {
  const path = `/public/restaurant/${encodeURIComponent(businessSlug)}/t/${encodeURIComponent(tableToken)}/orders`
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines }),
  })
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Request failed.'
    throw new ApiError(errorMessage, response.status)
  }
  const data = payload as { data: SaleOrder }
  return data.data
}

export async function createSaleOrder(
  businessId: string,
  lines: { productId: string; quantity: number }[],
  options?: { diningTableId?: string | null },
): Promise<SaleOrder> {
  const body: { lines: typeof lines; diningTableId?: string } = { lines }
  if (options?.diningTableId) {
    body.diningTableId = options.diningTableId
  }
  const res = await apiRequest<{ data: SaleOrder }>(`/businesses/${businessId}/orders`, {
    method: 'POST',
    businessId,
    body: JSON.stringify(body),
  })
  return res.data
}

export async function fetchSaleOrder(businessId: string, orderId: string): Promise<SaleOrder> {
  const res = await apiRequest<{ data?: SaleOrder }>(`/businesses/${businessId}/orders/${orderId}`, {
    businessId,
  })
  if (!res?.data) {
    throw new ApiError('Order not found.', 404)
  }
  return res.data
}

export async function fetchOrderCheckoutWallets(
  businessId: string,
): Promise<OrderCheckoutWalletRow[]> {
  const res = await apiRequest<{ data: { wallets: OrderCheckoutWalletRow[] } }>(
    `/businesses/${businessId}/orders/checkout-wallets`,
    {
      method: 'GET',
      businessId,
    },
  )
  return Array.isArray(res?.data?.wallets) ? res.data.wallets : []
}

export async function startWalletCheckout(
  businessId: string,
  orderId: string,
  body?: { gatewayCode?: string; payerPhone?: string },
): Promise<StartWalletCheckoutResponse> {
  const res = await apiRequest<{ data: StartWalletCheckoutResponse }>(
    `/businesses/${businessId}/orders/${orderId}/payments/wallet`,
    {
      method: 'POST',
      businessId,
      body: JSON.stringify(body ?? {}),
    },
  )
  return res.data
}

export async function confirmCashPayment(
  businessId: string,
  orderId: string,
): Promise<{
  payment: SalePayment
  receipt: { id: string; publicCode: string; receiptNumber: number; total: number; currency: string }
}> {
  const res = await apiRequest<{
    data: {
      payment: SalePayment
      receipt: { id: string; publicCode: string; receiptNumber: number; total: number; currency: string }
    }
  }>(`/businesses/${businessId}/orders/${orderId}/payments/cash`, {
    method: 'POST',
    businessId,
  })
  return res.data
}

export async function simulateWalletPayment(
  businessId: string,
  orderId: string,
): Promise<{ ok: boolean; duplicate: boolean; orderId: string; receiptId: string | null }> {
  const res = await apiRequest<{
    data: { ok: boolean; duplicate: boolean; orderId: string; receiptId: string | null }
  }>(`/businesses/${businessId}/orders/${orderId}/payments/wallet/simulate`, {
    method: 'POST',
    businessId,
  })
  return res.data
}

export type PaymentsListSummary = {
  completedAmount: number
  completedCount: number
  nonCompletedCount: number
  walletCompletedCount: number
}

export type PaymentsListResponse = {
  total: number
  page: number
  pageSize: number
  summary: PaymentsListSummary
  payments: SalePayment[]
}

export async function fetchBusinessPayments(
  businessId: string,
  params?: { page?: number; pageSize?: number },
): Promise<PaymentsListResponse> {
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 50
  const res = await apiRequest<{ data: PaymentsListResponse }>(
    `/businesses/${businessId}/payments?page=${page}&pageSize=${pageSize}`,
    { businessId },
  )
  return res.data
}

export type ReceiptDetail = {
  id: string
  publicCode: string
  receiptNumber: number
  businessName: string
  total: number
  currency: string
  lines: unknown
  linesFromOrder: Array<{
    productName: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }>
  paymentMethod: string
  provider: string
  providerRef: string | null
  createdAt: string
}

export async function fetchReceipt(
  businessId: string,
  receiptId: string,
): Promise<ReceiptDetail> {
  const res = await apiRequest<{ data: ReceiptDetail }>(
    `/businesses/${businessId}/receipts/${receiptId}`,
    { businessId },
  )
  return res.data
}

export type PublicPayInfo =
  | {
      kind: 'order'
      businessName: string
      amount: number
      currency: string
      orderStatus: string
      paymentStatus: string
      method: string
    }
  | {
      kind: 'sales_invoice'
      businessName: string
      amount: number
      currency: string
      invoiceStatus: string
      invoiceCode: string
      paymentStatus: string
      method: string
    }

export async function fetchPublicPayInfo(publicToken: string): Promise<PublicPayInfo> {
  const response = await fetch(`${API_BASE_URL}/public/pay/${publicToken}`)
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Request failed.'
    throw new ApiError(errorMessage, response.status)
  }
  const envelope = payload as { data: PublicPayInfo }
  return envelope.data
}

export type GuestQuotationPayload = {
  businessName: string
  canRespond: boolean
  document: SalesQuotationRow
  createdInvoice?: SalesInvoiceRow
}

export async function fetchGuestQuotation(guestToken: string): Promise<GuestQuotationPayload> {
  const response = await fetch(`${API_BASE_URL}/public/guest/quotation/${encodeURIComponent(guestToken)}`)
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Request failed.'
    throw new ApiError(errorMessage, response.status)
  }
  return (payload as { data: GuestQuotationPayload }).data
}

export async function respondGuestQuotation(
  guestToken: string,
  action: 'accept' | 'reject',
): Promise<GuestQuotationPayload> {
  const response = await fetch(
    `${API_BASE_URL}/public/guest/quotation/${encodeURIComponent(guestToken)}/respond`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    },
  )
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Request failed.'
    throw new ApiError(errorMessage, response.status)
  }
  return (payload as { data: GuestQuotationPayload }).data
}

export type GuestInvoicePayload = {
  businessName: string
  canPay: boolean
  document: SalesInvoiceRow
}

export async function fetchGuestInvoice(guestToken: string): Promise<GuestInvoicePayload> {
  const response = await fetch(`${API_BASE_URL}/public/guest/invoice/${encodeURIComponent(guestToken)}`)
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Request failed.'
    throw new ApiError(errorMessage, response.status)
  }
  return (payload as { data: GuestInvoicePayload }).data
}

export async function fetchGuestInvoiceWallets(guestToken: string): Promise<OrderCheckoutWalletRow[]> {
  const response = await fetch(
    `${API_BASE_URL}/public/guest/invoice/${encodeURIComponent(guestToken)}/wallets`,
  )
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Request failed.'
    throw new ApiError(errorMessage, response.status)
  }
  const envelope = payload as { data: { wallets: OrderCheckoutWalletRow[] } }
  return Array.isArray(envelope.data?.wallets) ? envelope.data.wallets : []
}

export async function startGuestInvoiceWalletCheckout(
  guestToken: string,
  body?: { gatewayCode?: string; payerPhone?: string },
): Promise<StartWalletCheckoutResponse> {
  const response = await fetch(
    `${API_BASE_URL}/public/guest/invoice/${encodeURIComponent(guestToken)}/payments/wallet`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    },
  )
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Request failed.'
    throw new ApiError(errorMessage, response.status)
  }
  return (payload as { data: StartWalletCheckoutResponse }).data
}

export async function simulatePublicWalletPay(publicToken: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/public/pay/${publicToken}/simulate`, {
    method: 'POST',
  })
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Request failed.'
    throw new ApiError(errorMessage, response.status)
  }
}
