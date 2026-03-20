import { API_BASE_URL } from '../config/api'
import type { PlanId, SubscriptionPlan } from '../types'

type BackendPlanCode = 'BASIC' | 'PRO' | 'BUSINESS_PRO'

type BackendPlan = {
  id: string
  code: BackendPlanCode
  name: string
  monthlyPrice: string
  description: string
  staffLimit: number
}

type BackendBusiness = {
  id: string
  name: string
  slug: string
  ownerName: string
  ownerEmail: string
  createdAt: string
}

type BackendInvoice = {
  id: string
  amount: string
}

type BackendSubscription = {
  id: string
  currentPeriodEnd: string
  plan: BackendPlan
}

type BackendSubscriptionEnvelope = {
  business: BackendBusiness
  currentSubscription: (BackendSubscription & { invoices: BackendInvoice[] }) | null
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function toPlanId(code: BackendPlanCode): PlanId {
  switch (code) {
    case 'BASIC':
      return 'basic'
    case 'PRO':
      return 'pro'
    case 'BUSINESS_PRO':
      return 'business_pro'
  }
}

function formatPriceLabel(monthlyPrice: string) {
  const amount = Number(monthlyPrice)
  return Number.isNaN(amount) ? `${monthlyPrice} / month` : `D${amount.toLocaleString()} / month`
}

function formatStaffLabel(staffLimit: number) {
  return `Up to ${staffLimit} staff`
}

export function mapBackendPlanToSubscriptionPlan(plan: BackendPlan): SubscriptionPlan {
  return {
    id: toPlanId(plan.code),
    name: plan.name,
    priceLabel: formatPriceLabel(plan.monthlyPrice),
    staffLabel: formatStaffLabel(plan.staffLimit),
    minStaff: 1,
    maxStaff: plan.staffLimit,
    description: plan.description,
    highlighted: plan.code === 'PRO',
  }
}

function toPlanCode(planId: PlanId): BackendPlanCode {
  switch (planId) {
    case 'basic':
      return 'BASIC'
    case 'pro':
      return 'PRO'
    case 'business_pro':
      return 'BUSINESS_PRO'
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
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

export async function fetchPlans() {
  const payload = await apiRequest<{ data: BackendPlan[] }>('/plans')
  return payload.data.map(mapBackendPlanToSubscriptionPlan)
}

export async function createBusiness(payload: {
  name: string
  slug: string
  ownerName: string
  ownerEmail: string
}) {
  const response = await apiRequest<{ data: BackendBusiness }>('/businesses', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return response.data
}

export async function createSubscription(businessId: string, planId: PlanId) {
  const response = await apiRequest<{
    data: {
      subscription: BackendSubscription
      invoice: BackendInvoice
    }
  }>(`/businesses/${businessId}/subscription`, {
    method: 'POST',
    body: JSON.stringify({
      planCode: toPlanCode(planId),
    }),
  })

  return response.data
}

export async function fetchBusinessSubscription(businessId: string) {
  const response = await apiRequest<{ data: BackendSubscriptionEnvelope }>(
    `/businesses/${businessId}/subscription`,
  )

  return response.data
}
