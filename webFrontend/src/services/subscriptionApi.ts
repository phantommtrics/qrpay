import { API_BASE_URL } from '../config/api'
import type { LoginAccount, Organization, PlanId, SubscriptionPlan, User, UserRole } from '../types'

type BackendPlanCode = 'BASIC' | 'PRO' | 'BUSINESS_PRO'

type BackendPlan = {
  id: string
  code: BackendPlanCode
  name: string
  monthlyPrice: string
  description: string
  staffLimit: number
}

export type BackendBusiness = {
  id: string
  name: string
  slug: string
  industry?: string | null
  ownerName: string
  ownerEmail: string
  createdAt: string
}

export type BackendInvoice = {
  id: string
  amount: string
  status: 'PENDING' | 'PAID' | 'FAILED' | 'VOID'
  dueDate: string
}

export type BackendSubscription = {
  id: string
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED'
  currentPeriodEnd: string
  plan: BackendPlan
  invoices?: BackendInvoice[]
}

type BackendSubscriptionEnvelope = {
  business: BackendBusiness
  currentSubscription: (BackendSubscription & { invoices: BackendInvoice[] }) | null
}

export type BackendUser = {
  id: string
  name: string
  email: string
  role: UserRole
  isActive: boolean
  createdAt: string
}

export type BackendAccessibleBusiness = {
  business: BackendBusiness
  currentSubscription: (BackendSubscription & { invoices?: BackendInvoice[] }) | null
  isOwner: boolean
}

export class ApiError extends Error {
  statusCode: number

  constructor(
    message: string,
    statusCode: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
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

export function toFrontendSubscriptionStatus(
  status: BackendSubscription['status'],
  currentPeriodEnd?: string,
) {
  if (status === 'TRIALING') {
    return 'trialing' as const
  }

  if (status === 'PAST_DUE') {
    return 'past_due' as const
  }

  if (status === 'EXPIRED' || status === 'CANCELLED') {
    return 'expired' as const
  }

  if (!currentPeriodEnd) {
    return 'active' as const
  }

  const diffMs = new Date(currentPeriodEnd).getTime() - Date.now()
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (daysLeft < 0) {
    return 'expired' as const
  }

  if (daysLeft <= 7) {
    return 'expiring_soon' as const
  }

  return 'active' as const
}

export function mapBackendUserToUser(user: BackendUser): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isPlatformOwner: user.role === 'admin',
  }
}

export function mapBackendUserToLoginAccount(
  user: BackendUser,
  organizationId?: string,
  isOwner = false,
): LoginAccount {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId,
    isOwner,
    isPlatformOwner: user.role === 'admin',
    createdAt: user.createdAt,
  }
}

export function mapAccessibleBusinessToOrganization(entry: BackendAccessibleBusiness): Organization {
  const currentSubscription = entry.currentSubscription

  return {
    id: entry.business.id,
    name: entry.business.name,
    slug: entry.business.slug,
    industry: entry.business.industry?.trim() || 'Retail',
    planId: currentSubscription ? toPlanId(currentSubscription.plan.code) : 'basic',
    staffCount: currentSubscription?.plan.staffLimit ?? 1,
    ownerName: entry.business.ownerName,
    subscriptionExpiresAt: currentSubscription?.currentPeriodEnd ?? new Date().toISOString(),
    subscriptionState: currentSubscription
      ? toFrontendSubscriptionStatus(
          currentSubscription.status,
          currentSubscription.currentPeriodEnd,
        )
      : 'expired',
    subscriptionInvoiceDueAt: currentSubscription?.invoices?.[0]?.dueDate ?? null,
    isOwner: entry.isOwner,
    createdAt: entry.business.createdAt,
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

export async function registerBusinessOwner(payload: {
  ownerName: string
  ownerEmail: string
  password: string
  businessName: string
  slug: string
  industry: string
  planId: PlanId
}) {
  const response = await apiRequest<{
    data: {
      user: BackendUser
      business: BackendBusiness
      subscription: BackendSubscription
      invoice: BackendInvoice
      accessibleBusinesses: BackendAccessibleBusiness[]
      activeBusinessId: string | null
    }
  }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      ownerName: payload.ownerName,
      ownerEmail: payload.ownerEmail,
      password: payload.password,
      businessName: payload.businessName,
      slug: payload.slug,
      industry: payload.industry,
      planCode: toPlanCode(payload.planId),
    }),
  })

  return response.data
}

export async function login(payload: { email: string; password: string }) {
  const response = await apiRequest<{
    data: {
      user: BackendUser
      accessibleBusinesses: BackendAccessibleBusiness[]
      activeBusinessId: string | null
    }
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return response.data
}

export async function fetchBusinessUsers(businessId: string) {
  const response = await apiRequest<{ data: BackendUser[] }>(`/businesses/${businessId}/users`)
  return response.data.map((user) => mapBackendUserToLoginAccount(user, businessId))
}

export async function createBusinessUser(payload: {
  businessId: string
  name: string
  email: string
  password: string
  role: Extract<UserRole, 'merchant' | 'cashier'>
}) {
  const response = await apiRequest<{ data: BackendUser }>(`/businesses/${payload.businessId}/users`, {
    method: 'POST',
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      role: payload.role.toUpperCase(),
    }),
  })

  return mapBackendUserToLoginAccount(response.data, payload.businessId)
}
