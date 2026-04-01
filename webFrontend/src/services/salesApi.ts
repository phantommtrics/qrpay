import { API_BASE_URL } from '../config/api'

import { ApiError } from './subscriptionApi'

const STORAGE_KEY_TOKEN = 'qrpay.auth.token'

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEY_TOKEN)
}

async function apiRequest<T>(
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
  lines: SaleOrderLine[]
  payments?: SalePayment[]
  receipt?: { id: string; publicCode: string; receiptNumber: number } | null
}

export type SalePayment = {
  id: string
  orderId: string
  orderPublicCode: string | null
  businessId: string
  publicCode: string
  amount: number
  currency: string
  status: 'pending' | 'completed' | 'failed'
  reference: string
  providerReference: string
  method: 'qr_wallet' | 'cash'
  provider: string
  createdAt: string
  completedAt: string | null
}

export async function createSaleOrder(
  businessId: string,
  lines: { productId: string; quantity: number }[],
): Promise<SaleOrder> {
  const res = await apiRequest<{ data: SaleOrder }>(`/businesses/${businessId}/orders`, {
    method: 'POST',
    businessId,
    body: JSON.stringify({ lines }),
  })
  return res.data
}

export async function fetchSaleOrder(businessId: string, orderId: string): Promise<SaleOrder> {
  const res = await apiRequest<{ data: SaleOrder }>(`/businesses/${businessId}/orders/${orderId}`, {
    businessId,
  })
  return res.data
}

export async function startWalletCheckout(
  businessId: string,
  orderId: string,
): Promise<{ payment: SalePayment; qrPayload: string }> {
  const res = await apiRequest<{ data: { payment: SalePayment; qrPayload: string } }>(
    `/businesses/${businessId}/orders/${orderId}/payments/wallet`,
    {
      method: 'POST',
      businessId,
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

export type PaymentsListResponse = {
  total: number
  page: number
  pageSize: number
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

export type PublicPayInfo = {
  businessName: string
  amount: number
  currency: string
  orderStatus: string
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
