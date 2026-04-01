import { API_BASE_URL } from '../config/api'
import type {
  BusinessMembershipStatus,
  LoginAccount,
  Organization,
  PlanId,
  PlatformPermissionMatrix,
  Product,
  SubscriptionPlan,
  User,
  UserRole,
} from '../types'

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
  mustChangePassword: boolean
  createdAt: string
  isOwner?: boolean
  membershipStatus?: BusinessMembershipStatus
  platformPermissions?: PlatformPermissionMatrix
}

export type BackendAccessibleBusiness = {
  business: BackendBusiness
  currentSubscription: (BackendSubscription & { invoices?: BackendInvoice[] }) | null
  isOwner: boolean
  membershipStatus?: BusinessMembershipStatus
  entitlements?: string[]
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

function isPlatformOwnerRole(role: BackendUser['role']): boolean {
  return role === 'platform_owner'
}

function isPlatformAdminRole(role: BackendUser['role']): boolean {
  return role === 'platform_admin'
}

export function mapBackendUserToUser(user: BackendUser): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    isPlatformOwner: isPlatformOwnerRole(user.role),
    isPlatformAdmin: isPlatformAdminRole(user.role),
    platformPermissions: user.platformPermissions,
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
    isPlatformOwner: isPlatformOwnerRole(user.role),
    isPlatformAdmin: isPlatformAdminRole(user.role),
    createdAt: user.createdAt,
    membershipStatus: user.membershipStatus ?? 'ACTIVE',
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
    membershipStatus: entry.membershipStatus,
    createdAt: entry.business.createdAt,
  }
}

const STORAGE_KEY_TOKEN = 'qrpay.auth.token'

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEY_TOKEN)
}

export function hasStoredToken(): boolean {
  return Boolean(getStoredToken())
}

function storeToken(token: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY_TOKEN, token)
}

export function clearToken(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY_TOKEN)
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken()

  const headers = new Headers(init?.headers)
  const isFormData = init?.body instanceof FormData
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  // Spread init first, then headers last — otherwise init.headers replaces our merged Headers
  // and drops Authorization (e.g. fetchBusinessUsers only passes x-business-id).
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
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
    headers: {
      'x-business-id': businessId,
    },
    body: JSON.stringify({
      planCode: toPlanCode(planId),
    }),
  })

  return response.data
}

export async function fetchBusinessSubscription(businessId: string) {
  const response = await apiRequest<{ data: BackendSubscriptionEnvelope }>(
    `/businesses/${businessId}/subscription`,
    {
      headers: {
        'x-business-id': businessId,
      },
    },
  )

  return response.data
}

export async function registerBusinessOwner(payload: {
  ownerName: string
  ownerEmail: string
  businessName: string
  slug: string
  industry: string
  planId: PlanId
}) {
  const response = await apiRequest<{
    data: {
      user: BackendUser
      token: string | null
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
      businessName: payload.businessName,
      slug: payload.slug,
      industry: payload.industry,
      planCode: toPlanCode(payload.planId),
    }),
  })

  if (response.data.token) {
    storeToken(response.data.token)
  }

  return response.data
}

export async function login(payload: { email: string; password: string }) {
  const response = await apiRequest<{
    data: {
      user: BackendUser
      token: string
      accessibleBusinesses: BackendAccessibleBusiness[]
      activeBusinessId: string | null
    }
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  if (response.data.token) {
    storeToken(response.data.token)
  }

  return response.data
}

export async function changePassword(payload: {
  email: string
  currentPassword: string
  newPassword: string
}) {
  const response = await apiRequest<{
    data: {
      user: BackendUser
    }
  }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return response.data
}

export async function forgotPassword(payload: { email: string }) {
  const response = await apiRequest<{
    data: {
      message: string
    }
  }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return response.data
}

export async function fetchBusinessUsers(businessId: string) {
  const response = await apiRequest<{ data: BackendUser[] }>(`/businesses/${businessId}/users`, {
    headers: {
      'x-business-id': businessId,
    },
  })
  return response.data.map((user) =>
    mapBackendUserToLoginAccount(user, businessId, Boolean(user.isOwner)),
  )
}

export async function createBusinessUser(payload: {
  businessId: string
  name: string
  email: string
  role: Extract<UserRole, 'merchant' | 'cashier'>
}) {
  const response = await apiRequest<{
    data: {
      user: BackendUser
      inviteType: 'existing-user' | 'new-user'
    }
  }>(`/businesses/${payload.businessId}/users`, {
    method: 'POST',
    headers: {
      'x-business-id': payload.businessId,
    },
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      role: payload.role.toUpperCase(),
    }),
  })

  return {
    account: mapBackendUserToLoginAccount(
      response.data.user,
      payload.businessId,
      Boolean(response.data.user.isOwner),
    ),
    inviteType: response.data.inviteType,
  }
}

export async function updateMemberMembershipStatus(
  businessId: string,
  targetUserId: string,
  status: BusinessMembershipStatus,
) {
  await apiRequest<{ data: { status: BusinessMembershipStatus } }>(
    `/businesses/${businessId}/members/${targetUserId}/membership-status`,
    {
      method: 'PATCH',
      headers: {
        'x-business-id': businessId,
      },
      body: JSON.stringify({ status }),
    },
  )
}

export type BackendProduct = {
  id: string
  businessId: string
  name: string
  category: string
  description: string | null
  price: number
  stock: number
  barcodeType: string
  barcodeValue: string
  qrUrl: string
  imageUrl: string | null
  imageColor: string
  imageEmoji: string
  createdAt: string
  updatedAt: string
}

export function mapBackendProductToProduct(p: BackendProduct): Product {
  return {
    id: p.id,
    businessId: p.businessId,
    name: p.name,
    price: p.price,
    category: p.category,
    stock: p.stock,
    imageColor: p.imageColor,
    imageEmoji: p.imageEmoji,
    description: p.description ?? undefined,
    barcodeType: p.barcodeType,
    barcodeValue: p.barcodeValue,
    qrUrl: p.qrUrl,
    imageUrl: p.imageUrl,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }
}

export async function fetchBusinessProducts(businessId: string) {
  const response = await apiRequest<{ data: BackendProduct[] }>(
    `/businesses/${businessId}/products`,
    {
      headers: {
        'x-business-id': businessId,
      },
    },
  )
  return response.data.map(mapBackendProductToProduct)
}

export type PublicBusinessMenuPayload = {
  business: { id: string; name: string; slug: string }
  products: BackendProduct[]
}

export async function fetchPublicBusinessMenu(businessId: string) {
  const response = await apiRequest<{ data: PublicBusinessMenuPayload }>(
    `/public/businesses/${businessId}/products`,
  )
  return {
    business: response.data.business,
    products: response.data.products.map(mapBackendProductToProduct),
  }
}

export async function createBusinessProduct(
  businessId: string,
  payload: {
    name: string
    category: string
    description?: string
    price: number
    stock: number
    barcodeValue?: string
    qrUrl?: string
    imageUrl?: string
    imageColor?: string
    imageEmoji?: string
  },
) {
  const response = await apiRequest<{ data: BackendProduct }>(
    `/businesses/${businessId}/products`,
    {
      method: 'POST',
      headers: {
        'x-business-id': businessId,
      },
      body: JSON.stringify(payload),
    },
  )
  return mapBackendProductToProduct(response.data)
}

export async function updateBusinessProduct(
  businessId: string,
  productId: string,
  payload: {
    name?: string
    category?: string
    description?: string | null
    price?: number
    stock?: number
    imageUrl?: string | null
    imageColor?: string
    imageEmoji?: string
  },
) {
  const response = await apiRequest<{ data: BackendProduct }>(
    `/businesses/${businessId}/products/${productId}`,
    {
      method: 'PATCH',
      headers: {
        'x-business-id': businessId,
      },
      body: JSON.stringify(payload),
    },
  )
  return mapBackendProductToProduct(response.data)
}

export async function uploadBusinessProductImage(businessId: string, file: File) {
  const form = new FormData()
  form.append('image', file)

  const response = await apiRequest<{ data: { imageUrl: string } }>(
    `/businesses/${businessId}/products/upload-image`,
    {
      method: 'POST',
      headers: {
        'x-business-id': businessId,
      },
      body: form,
    },
  )

  return response.data.imageUrl
}

export type PublicProductPayload = {
  id: string
  name: string
  category: string
  price: string
  imageUrl: string | null
  business: { id: string; name: string; slug: string }
}

export async function fetchPublicProduct(productId: string) {
  const response = await apiRequest<{ data: PublicProductPayload }>(
    `/public/products/${productId}`,
  )
  return response.data
}

export type PlatformSystemService = {
  id: string
  name: string
  description: string | null
  sortOrder: number
  productCount: number
  createdAt: string
  updatedAt: string
}

export type PlatformSystemProduct = {
  id: string
  serviceId: string
  serviceName: string
  name: string
  slug: string
  description: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type PlanEntitlementsPayload = {
  planId: string
  planCode: BackendPlanCode
  planName: string
  systemProductIds: string[]
  items: Array<{
    id: string
    serviceId: string
    serviceName: string
    name: string
    slug: string
  }>
}

export async function fetchPlatformSystemServices() {
  const response = await apiRequest<{ data: PlatformSystemService[] }>('/platform/system-services')
  return response.data
}

export async function createPlatformSystemService(payload: {
  name: string
  description?: string
  sortOrder?: number
}) {
  const response = await apiRequest<{ data: Omit<PlatformSystemService, 'productCount'> }>(
    '/platform/system-services',
    { method: 'POST', body: JSON.stringify(payload) },
  )
  return response.data
}

export async function updatePlatformSystemService(
  serviceId: string,
  payload: { name?: string; description?: string; sortOrder?: number },
) {
  const response = await apiRequest<{ data: Omit<PlatformSystemService, 'productCount'> }>(
    `/platform/system-services/${serviceId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  )
  return response.data
}

export async function deletePlatformSystemService(serviceId: string) {
  await apiRequest<unknown>(`/platform/system-services/${serviceId}`, { method: 'DELETE' })
}

export async function fetchPlatformSystemProducts(serviceId?: string) {
  const q = serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : ''
  const response = await apiRequest<{ data: PlatformSystemProduct[] }>(
    `/platform/system-products${q}`,
  )
  return response.data
}

export async function createPlatformSystemProduct(payload: {
  serviceId: string
  name: string
  slug: string
  description?: string
  sortOrder?: number
}) {
  const response = await apiRequest<{ data: PlatformSystemProduct }>('/platform/system-products', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return response.data
}

export async function updatePlatformSystemProduct(
  productId: string,
  payload: Partial<{
    serviceId: string
    name: string
    slug: string
    description: string
    sortOrder: number
  }>,
) {
  const response = await apiRequest<{ data: PlatformSystemProduct }>(
    `/platform/system-products/${productId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  )
  return response.data
}

export async function deletePlatformSystemProduct(productId: string) {
  await apiRequest<unknown>(`/platform/system-products/${productId}`, { method: 'DELETE' })
}

export async function fetchPlanEntitlements(planCode: BackendPlanCode) {
  const response = await apiRequest<{ data: PlanEntitlementsPayload }>(
    `/platform/plans/${planCode}/entitlements`,
  )
  return response.data
}

export async function updatePlanEntitlements(
  planCode: BackendPlanCode,
  systemProductIds: string[],
) {
  const response = await apiRequest<{ data: PlanEntitlementsPayload }>(
    `/platform/plans/${planCode}/entitlements`,
    { method: 'PUT', body: JSON.stringify({ systemProductIds }) },
  )
  return response.data
}

export async function fetchBusinessEntitlements(businessId: string) {
  const response = await apiRequest<{ data: { slugs: string[] } }>(
    `/businesses/${businessId}/entitlements`,
    { headers: { 'x-business-id': businessId } },
  )
  return response.data.slugs
}

export type NavigationMenuItem = {
  slug: string
  name: string
  navPath: string
  navLabel: string
  sortOrder: number
}

export type NavigationMenuService = {
  id: string
  name: string
  description: string | null
  sortOrder: number
  items: NavigationMenuItem[]
}

export async function fetchBusinessNavigationMenu(businessId: string) {
  const response = await apiRequest<{ data: { services: NavigationMenuService[] } }>(
    `/businesses/${businessId}/navigation-menu`,
    { headers: { 'x-business-id': businessId } },
  )
  return response.data.services
}

export type PlanCatalogServiceRow = {
  id: string
  name: string
  sortOrder: number
  products: Array<{
    id: string
    slug: string
    name: string
    description: string | null
    sortOrder: number
  }>
}

export async function fetchBusinessPlanCatalog(businessId: string) {
  const response = await apiRequest<{ data: { services: PlanCatalogServiceRow[] } }>(
    `/businesses/${businessId}/plan-catalog`,
    { headers: { 'x-business-id': businessId } },
  )
  return response.data.services
}

export async function fetchUserPlanAccess(businessId: string, userId: string) {
  const response = await apiRequest<{
    data: { systemProductIds: string[] }
  }>(`/businesses/${businessId}/users/${userId}/plan-access`, {
    headers: { 'x-business-id': businessId },
  })
  return response.data
}

export async function updateUserPlanAccess(
  businessId: string,
  userId: string,
  systemProductIds: string[],
) {
  const response = await apiRequest<{
    data: { systemProductIds: string[] }
  }>(`/businesses/${businessId}/users/${userId}/plan-access`, {
    method: 'PUT',
    headers: { 'x-business-id': businessId },
    body: JSON.stringify({ systemProductIds }),
  })
  return response.data
}

export type PlatformBusinessListRow = {
  id: string
  name: string
  slug: string
  industry: string | null
  ownerName: string
  ownerEmail: string
  createdAt: string
  updatedAt: string
  _count: { memberships: number }
  subscriptions: Array<{
    id: string
    status: string
    plan: { code: string; name: string; monthlyPrice: unknown }
  }>
}

export type PaginatedPayload<T> = {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export async function fetchPlatformBusinessesList(params?: { page?: number; pageSize?: number }) {
  const sp = new URLSearchParams()
  sp.set('page', String(params?.page ?? 1))
  sp.set('pageSize', String(params?.pageSize ?? 10))
  return apiRequest<PaginatedPayload<PlatformBusinessListRow>>(
    `/platform/businesses?${sp.toString()}`,
  )
}

export type PlatformBusinessMemberRow = {
  id: string
  userId: string
  businessId: string
  isOwner: boolean
  status: string
  createdAt: string
  updatedAt: string
  user: {
    id: string
    name: string
    email: string
    role: string
    isActive: boolean
    createdAt: string
  }
}

export type PlatformBusinessDetail = Omit<
  PlatformBusinessListRow,
  'subscriptions' | '_count'
> & {
  memberships: PlatformBusinessMemberRow[]
  subscriptions: BackendSubscription[]
  _count: { memberships: number; products: number }
  membershipsTotal: number
  subscriptionsTotal: number
  membershipsPage: number
  membershipsPageSize: number
  subscriptionsPage: number
  subscriptionsPageSize: number
}

export async function fetchPlatformBusinessDetail(
  businessId: string,
  params?: {
    membershipsPage?: number
    membershipsPageSize?: number
    subscriptionsPage?: number
    subscriptionsPageSize?: number
  },
) {
  const sp = new URLSearchParams()
  if (params?.membershipsPage != null) {
    sp.set('membershipsPage', String(params.membershipsPage))
  }
  if (params?.membershipsPageSize != null) {
    sp.set('membershipsPageSize', String(params.membershipsPageSize))
  }
  if (params?.subscriptionsPage != null) {
    sp.set('subscriptionsPage', String(params.subscriptionsPage))
  }
  if (params?.subscriptionsPageSize != null) {
    sp.set('subscriptionsPageSize', String(params.subscriptionsPageSize))
  }
  const q = sp.toString()
  const response = await apiRequest<{ data: PlatformBusinessDetail }>(
    `/platform/businesses/${businessId}${q ? `?${q}` : ''}`,
  )
  return response.data
}

export type BackendSubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'EXPIRED'

export type PlatformSubscriptionRow = BackendSubscription & {
  createdAt: string
  startDate: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelledAt: string | null
  endedAt: string | null
  updatedAt: string
  business: {
    id: string
    name: string
    slug: string
    ownerName: string
    ownerEmail: string
  }
}

export async function fetchPlatformSubscriptions(params: {
  status?: BackendSubscriptionStatus
  createdFrom?: string
  createdTo?: string
  page?: number
  pageSize?: number
}) {
  const sp = new URLSearchParams()
  if (params.status) {
    sp.set('status', params.status)
  }
  if (params.createdFrom) {
    sp.set('createdFrom', params.createdFrom)
  }
  if (params.createdTo) {
    sp.set('createdTo', params.createdTo)
  }
  sp.set('page', String(params.page ?? 1))
  sp.set('pageSize', String(params.pageSize ?? 10))
  const response = await apiRequest<PaginatedPayload<PlatformSubscriptionRow>>(
    `/platform/subscriptions?${sp.toString()}`,
  )
  return response
}

export type InvoiceStatus = 'PENDING' | 'PAID' | 'FAILED' | 'VOID'

export type PlatformInvoiceRow = {
  id: string
  businessId: string
  subscriptionId: string
  planId: string
  amount: string
  currency: string
  status: InvoiceStatus
  billingPeriodStart: string
  billingPeriodEnd: string
  dueDate: string
  paidAt: string | null
  externalReference: string | null
  createdAt: string
  updatedAt: string
  business: {
    id: string
    name: string
    slug: string
    ownerName: string
    ownerEmail: string
  }
  plan: {
    id: string
    code: string
    name: string
    monthlyPrice: string
    currency: string
  }
}

export async function fetchPlatformInvoices(params: {
  status?: InvoiceStatus
  createdFrom?: string
  createdTo?: string
  page?: number
  pageSize?: number
}) {
  const sp = new URLSearchParams()
  if (params.status) {
    sp.set('status', params.status)
  }
  if (params.createdFrom) {
    sp.set('createdFrom', params.createdFrom)
  }
  if (params.createdTo) {
    sp.set('createdTo', params.createdTo)
  }
  sp.set('page', String(params.page ?? 1))
  sp.set('pageSize', String(params.pageSize ?? 10))
  const response = await apiRequest<PaginatedPayload<PlatformInvoiceRow>>(
    `/platform/invoices?${sp.toString()}`,
  )
  return response
}

export type PlatformInvoiceDetail = PlatformInvoiceRow & {
  business: PlatformInvoiceRow['business'] & {
    industry: string | null
    createdAt: string
  }
  plan: PlatformInvoiceRow['plan'] & {
    description: string
    staffLimit: number
  }
  subscription: {
    id: string
    status: BackendSubscriptionStatus
    startDate: string
    currentPeriodStart: string
    currentPeriodEnd: string
    createdAt: string
  }
}

export async function fetchPlatformInvoiceDetail(invoiceId: string) {
  const response = await apiRequest<{ data: PlatformInvoiceDetail }>(
    `/platform/invoices/${invoiceId}`,
  )
  return response.data
}

export type PlatformSecurityModule = {
  id: string
  slug: string
  label: string
  sortOrder: number
}

export type PlatformRoleTemplatePermissionRow = {
  id: string
  moduleId: string
  moduleSlug: string
  moduleLabel: string
  canView: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  canExport: boolean
}

export type PlatformRoleTemplate = {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  /** Present on list responses; omit when not loaded. */
  assignedFunctionGroupCount?: number
  permissions: PlatformRoleTemplatePermissionRow[]
}

export type PlatformFunctionGroupRow = {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  roleTemplate: { id: string; name: string }
  userCount: number
}

export type PlatformStaffUserRow = {
  id: string
  name: string
  email: string
  isActive: boolean
  mustChangePassword: boolean
  createdAt: string
  platformFunctionGroupId: string | null
  platformFunctionGroup: { id: string; name: string } | null
}

export async function fetchPlatformSecurityModules() {
  const response = await apiRequest<{ data: PlatformSecurityModule[] }>(
    '/platform/security/modules',
  )
  return response.data
}

export async function fetchPlatformRoleTemplates(params?: { page?: number; pageSize?: number }) {
  const sp = new URLSearchParams()
  sp.set('page', String(params?.page ?? 1))
  sp.set('pageSize', String(params?.pageSize ?? 10))
  return apiRequest<PaginatedPayload<PlatformRoleTemplate>>(
    `/platform/security/role-templates?${sp.toString()}`,
  )
}

export async function fetchPlatformRoleTemplateSummaries() {
  const response = await apiRequest<{ data: { id: string; name: string }[] }>(
    '/platform/security/role-templates/summary',
  )
  return response.data
}

export async function createPlatformRoleTemplate(payload: { name: string; description?: string }) {
  const response = await apiRequest<{ data: Omit<PlatformRoleTemplate, 'permissions'> }>(
    '/platform/security/role-templates',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
  return response.data
}

export async function updatePlatformRoleTemplate(
  templateId: string,
  payload: { name?: string; description?: string | null },
) {
  const response = await apiRequest<{ data: Omit<PlatformRoleTemplate, 'permissions'> }>(
    `/platform/security/role-templates/${templateId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )
  return response.data
}

export async function savePlatformRoleTemplatePermissions(
  templateId: string,
  permissions: {
    moduleId: string
    canView: boolean
    canCreate: boolean
    canEdit: boolean
    canDelete: boolean
    canExport: boolean
  }[],
) {
  const response = await apiRequest<{ data: Pick<PlatformRoleTemplate, 'id' | 'name' | 'description' | 'permissions'> }>(
    `/platform/security/role-templates/${templateId}/permissions`,
    {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    },
  )
  return response.data
}

export async function deletePlatformRoleTemplate(templateId: string) {
  await apiRequest(`/platform/security/role-templates/${templateId}`, { method: 'DELETE' })
}

export async function fetchPlatformFunctionGroups(params?: { page?: number; pageSize?: number }) {
  const sp = new URLSearchParams()
  sp.set('page', String(params?.page ?? 1))
  sp.set('pageSize', String(params?.pageSize ?? 10))
  return apiRequest<PaginatedPayload<PlatformFunctionGroupRow>>(
    `/platform/security/function-groups?${sp.toString()}`,
  )
}

/** Full list for dropdowns (e.g. system users assign group). */
export async function fetchPlatformFunctionGroupsAll() {
  const response = await apiRequest<{ data: PlatformFunctionGroupRow[] }>(
    '/platform/security/function-groups/all',
  )
  return response.data
}

export async function createPlatformFunctionGroup(payload: {
  name: string
  description?: string
  roleTemplateId: string
}) {
  const response = await apiRequest<{ data: PlatformFunctionGroupRow }>(
    '/platform/security/function-groups',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
  return response.data
}

export async function updatePlatformFunctionGroup(
  groupId: string,
  payload: { name?: string; description?: string | null; roleTemplateId?: string },
) {
  const response = await apiRequest<{ data: PlatformFunctionGroupRow }>(
    `/platform/security/function-groups/${groupId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )
  return response.data
}

export async function deletePlatformFunctionGroup(groupId: string) {
  await apiRequest(`/platform/security/function-groups/${groupId}`, { method: 'DELETE' })
}

export async function fetchPlatformStaffUsersList(params?: {
  page?: number
  pageSize?: number
  /** Filter to platform admins in this function group. */
  functionGroupId?: string
}) {
  const sp = new URLSearchParams()
  sp.set('page', String(params?.page ?? 1))
  sp.set('pageSize', String(params?.pageSize ?? 10))
  if (params?.functionGroupId) {
    sp.set('functionGroupId', params.functionGroupId)
  }
  return apiRequest<PaginatedPayload<PlatformStaffUserRow>>(
    `/platform/staff-users?${sp.toString()}`,
  )
}

export async function bulkMovePlatformStaffUsers(payload: {
  fromGroupId: string
  toGroupId: string
  /** Omit or empty = move everyone in the source group. */
  userIds?: string[]
}) {
  const response = await apiRequest<{ data: { movedCount: number } }>(
    '/platform/security/staff-users/bulk-move',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
  return response.data
}

export async function createPlatformStaffUserRequest(payload: {
  name: string
  email: string
  platformFunctionGroupId: string
}) {
  const response = await apiRequest<{ data: PlatformStaffUserRow }>('/platform/security/staff-users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return response.data
}

export async function updatePlatformStaffUserRequest(
  userId: string,
  payload: { platformFunctionGroupId?: string; isActive?: boolean },
) {
  const response = await apiRequest<{ data: PlatformStaffUserRow }>(
    `/platform/security/staff-users/${userId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )
  return response.data
}
