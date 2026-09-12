import { API_BASE_URL } from '../config/api'
import { apiRequest } from './salesApi'
import { ApiError } from './subscriptionApi'

const STORAGE_KEY_TOKEN = 'qrpay.auth.token'

export type MerchantProfile = {
  user: {
    id: string
    name: string
    email: string
    role: string
    mustChangePassword: boolean
    createdAt: string
  }
  business: {
    id: string
    name: string
    slug: string
    industry: string | null
    ownerName: string
    ownerEmail: string
    logoUrl: string | null
    createdAt: string
  }
  membership: {
    isOwner: boolean
    status: string
  }
}

export async function fetchMerchantProfile(businessId: string): Promise<MerchantProfile> {
  const res = await apiRequest<{ data: MerchantProfile }>(
    `/businesses/${businessId}/merchant-profile`,
    { businessId },
  )
  return res.data
}

export async function uploadMerchantBusinessLogo(
  businessId: string,
  file: File,
): Promise<{ logoUrl: string | null }> {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY_TOKEN) : null
  const body = new FormData()
  body.append('logo', file)
  const headers = new Headers()
  headers.set('x-business-id', businessId)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE_URL}/businesses/${businessId}/merchant-profile/logo`, {
    method: 'POST',
    headers,
    body,
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
        : 'Could not upload logo.'
    throw new ApiError(errorMessage, response.status)
  }
  return (payload as { data: { logoUrl: string | null } }).data
}

export async function removeMerchantBusinessLogo(
  businessId: string,
): Promise<{ logoUrl: string | null }> {
  const res = await apiRequest<{ data: { logoUrl: string | null } }>(
    `/businesses/${businessId}/merchant-profile/logo`,
    { method: 'DELETE', businessId },
  )
  return res.data
}
