import { API_BASE_URL, normalizeProductImageUrlForDisplay } from '../config/api'
import type {
  BusinessMembershipStatus,
  LoginAccount,
  Organization,
  PlanId,
  PlatformPermissionMatrix,
  Product,
  SubscriptionBillingInterval,
  SubscriptionPlan,
  User,
  UserRole,
} from '../types'

export type BackendPlanCode = 'BASIC' | 'PRO' | 'BUSINESS_PRO' | 'CORPORATE'

export type BackendPlan = {
  id: string
  code: BackendPlanCode
  name: string
  monthlyPrice: string
  yearlyPrice: string
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
  currency?: string
  billingPeriodStart?: string
  billingPeriodEnd?: string
  paidAt?: string | null
  externalReference?: string | null
}

export type BackendSubscription = {
  id: string
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED'
  billingInterval?: SubscriptionBillingInterval
  /** Null for perpetual / signed-contract subscriptions after activation. */
  currentPeriodEnd?: string | null
  contractPerpetual?: boolean
  plan: BackendPlan
  invoices?: BackendInvoice[]
}

/** Present when `business.industry` is Corporate — custom template pricing for `/billing`. */
export type CorporateBillingSnapshot = {
  templateId: string | null
  templateName: string | null
  billingInterval: SubscriptionBillingInterval | null
  currency: string
  prices: {
    monthly: string
    quarterly: string
    halfYearly: string
    yearly: string
    twoYears: string
    contract: string
  } | null
}

export type BackendSubscriptionEnvelope = {
  business: BackendBusiness
  currentSubscription: (BackendSubscription & { invoices: BackendInvoice[] }) | null
  corporateBilling: CorporateBillingSnapshot | null
  /** Server-controlled; UI may show "Dev: mark paid" when true. */
  devSubscriptionInvoicePayAllowed?: boolean
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
  assignedStationId?: string | null
  assignedStationName?: string | null
  platformPermissions?: PlatformPermissionMatrix
}

export type BackendAccessibleBusiness = {
  business: BackendBusiness
  currentSubscription: (BackendSubscription & { invoices?: BackendInvoice[] }) | null
  isOwner: boolean
  membershipStatus?: BusinessMembershipStatus
  assignedStationId?: string | null
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
    case 'CORPORATE':
      return 'corporate'
  }
}

function formatPriceLabel(monthlyPrice: string) {
  const amount = Number(monthlyPrice)
  return Number.isNaN(amount) ? `${monthlyPrice} / month` : `D${amount.toLocaleString()} / month`
}

function formatYearlyPriceLabel(yearlyPrice: string) {
  const amount = Number(yearlyPrice)
  return Number.isNaN(amount) ? `${yearlyPrice} / year` : `D${amount.toLocaleString()} / year`
}

function formatStaffLabel(staffLimit: number) {
  return `Up to ${staffLimit} staff`
}

/** Public display name: legacy product-brand strings from API/DB read as DirectPay. */
function displayProductBrandInPlanText(value: string): string {
  return value.replace(/easypay/gi, 'DirectPay')
}

export function mapBackendPlanToSubscriptionPlan(plan: BackendPlan): SubscriptionPlan {
  const yearly =
    plan.yearlyPrice !== undefined && plan.yearlyPrice !== ''
      ? plan.yearlyPrice
      : String(Number(plan.monthlyPrice) * 12)
  const isCorporate = plan.code === 'CORPORATE'
  return {
    id: toPlanId(plan.code),
    name: displayProductBrandInPlanText(plan.name),
    priceLabel: formatPriceLabel(plan.monthlyPrice),
    yearlyPriceLabel: formatYearlyPriceLabel(yearly),
    staffLabel: isCorporate ? 'Unlimited staff' : formatStaffLabel(plan.staffLimit),
    minStaff: 1,
    maxStaff: isCorporate ? null : plan.staffLimit,
    description: displayProductBrandInPlanText(plan.description),
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
    case 'corporate':
      return 'CORPORATE'
  }
}

export function toFrontendSubscriptionStatus(
  status: BackendSubscription['status'],
  currentPeriodEnd?: string | null,
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
    assignedStationId: user.assignedStationId,
    assignedStationName: user.assignedStationName,
  }
}

export function mapAccessibleBusinessToOrganization(entry: BackendAccessibleBusiness): Organization {
  const currentSubscription = entry.currentSubscription
  const industryNorm = entry.business.industry?.trim().toLowerCase() ?? ''
  const rawPlanId = currentSubscription ? toPlanId(currentSubscription.plan.code) : 'basic'
  /** Subscription row uses Business Pro for corporate; surface `corporate` in the UI when industry matches. */
  const planId =
    industryNorm === 'corporate' ? ('corporate' as PlanId) : rawPlanId

  return {
    id: entry.business.id,
    name: entry.business.name,
    slug: entry.business.slug,
    industry: entry.business.industry?.trim() || 'Retail',
    planId,
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
    subscriptionBillingInterval: currentSubscription?.billingInterval,
    isOwner: entry.isOwner,
    membershipStatus: entry.membershipStatus,
    assignedStationId: entry.assignedStationId ?? null,
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

  if (response.status !== 204 && response.status !== 205) {
    try {
      const text = await response.text()
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = null
    }
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

/** Raw plan rows from `GET /plans` (numeric monthly prices as strings). */
export async function fetchPlansRaw() {
  const payload = await apiRequest<{ data: BackendPlan[] }>('/plans')
  return payload.data
}

export async function updatePlatformPlanPricing(
  planCode: BackendPlanCode,
  body: { monthlyPrice?: number; yearlyPrice?: number },
) {
  const response = await apiRequest<{ data: BackendPlan }>(
    `/platform/plans/${planCode}/pricing`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  )
  return mapBackendPlanToSubscriptionPlan(response.data)
}

export type CorporateBillingPlanRow = {
  id: string
  name: string
  monthlyPrice: string
  quarterlyPrice: string
  halfYearlyPrice: string
  yearlyPrice: string
  twoYearPrice: string
  contractPrice: string
  currency: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export async function fetchCorporateBillingPlans() {
  const response = await apiRequest<{ data: CorporateBillingPlanRow[] }>(
    '/platform/corporate-billing-plans',
  )
  return response.data
}

export async function createCorporateBillingPlan(body: {
  name: string
  monthlyPrice: number
  yearlyPrice: number
  quarterlyPrice?: number
  halfYearlyPrice?: number
  twoYearPrice?: number
  contractPrice?: number
  sortOrder?: number
}) {
  const response = await apiRequest<{ data: CorporateBillingPlanRow }>(
    '/platform/corporate-billing-plans',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
  return response.data
}

export async function updateCorporateBillingPlan(
  planId: string,
  body: Partial<{
    name: string
    monthlyPrice: number
    quarterlyPrice: number
    halfYearlyPrice: number
    yearlyPrice: number
    twoYearPrice: number
    contractPrice: number
    sortOrder: number
    isActive: boolean
  }>,
) {
  const response = await apiRequest<{ data: CorporateBillingPlanRow }>(
    `/platform/corporate-billing-plans/${encodeURIComponent(planId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  )
  return response.data
}

export type CorporateBusinessRow = {
  id: string
  name: string
  slug: string
  industry: string | null
  ownerName: string
  ownerEmail: string
  createdAt: string
  corporateBillingPlanId: string | null
  corporateBillingInterval: SubscriptionBillingInterval | null
  corporateEntitlementSystemProductIds: string[]
  corporateBillingPlan: {
    id: string
    name: string
    monthlyPrice: string
    yearlyPrice: string
    currency: string
  } | null
  currentSubscription: {
    id: string
    status: string
    billingInterval: SubscriptionBillingInterval
    planCode: string
    planName: string
  } | null
}

export async function fetchCorporateBusinesses() {
  const response = await apiRequest<{ data: CorporateBusinessRow[] }>(
    '/platform/corporate-businesses',
  )
  return response.data
}

export type CorporateEntitlementCatalogItem = {
  id: string
  serviceId: string
  serviceName: string
  name: string
  slug: string
}

export async function fetchCorporateEntitlementCatalog() {
  const response = await apiRequest<{
    data: { planCode: string; items: CorporateEntitlementCatalogItem[] }
  }>('/platform/corporate/entitlement-catalog')
  return response.data
}

export async function patchCorporateBusinessSettings(
  businessId: string,
  body: {
    corporateBillingPlanId: string
    billingInterval: SubscriptionBillingInterval
    corporateEntitlementSystemProductIds?: string[]
  },
) {
  return apiRequest<{
    data: { subscriptionId: string; invoiceId: string; invoiceAmount: string }
  }>(`/platform/corporate-businesses/${encodeURIComponent(businessId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export type CorporateInvitationLetterPayload = {
  templateMode?: 'default' | 'manual'
  organizationName: string
  contactName: string
  contactTitle?: string | null
  toEmail: string
  ccEmails: string[]
  senderName: string
  senderTitle?: string | null
  proposalReference?: string | null
  monthlyFeeLabel?: string | null
  onboardingTimeline?: string | null
  nextStep?: string | null
  subject?: string | null
  personalNote?: string | null
  manualTemplateContent?: string | null
}

export async function previewCorporateInvitationLetter(body: CorporateInvitationLetterPayload) {
  const response = await apiRequest<{ data: { letterText: string } }>(
    '/platform/corporate/invitation-letter/preview',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
  return response.data
}

export async function sendCorporateInvitationLetter(body: CorporateInvitationLetterPayload) {
  const response = await apiRequest<{
    data: { id: string; providerMessageId: string; attachmentFilename: string }
  }>('/platform/corporate/invitation-letter/send', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return response.data
}

export type CorporateInvitationEmailLogRow = {
  id: string
  organizationName: string
  contactName: string
  contactTitle: string | null
  recipientEmail: string
  ccEmails: string[]
  senderName: string
  senderTitle: string | null
  subject: string
  attachmentFilename: string
  provider: string
  deliveryStatus: 'PENDING' | 'SENT' | 'FAILED'
  resendEmailId: string | null
  failureReason: string | null
  sentAt: string | null
  createdByUserId: string | null
  createdByName: string | null
  createdByEmail: string | null
  createdAt: string
  updatedAt: string
}

export async function fetchCorporateInvitationEmailLogs(limit = 100) {
  const params = new URLSearchParams({ limit: String(limit) })
  const response = await apiRequest<{ data: CorporateInvitationEmailLogRow[] }>(
    `/platform/corporate/invitation-letter/logs?${params.toString()}`,
  )
  return response.data
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

export async function createSubscription(
  businessId: string,
  planId: PlanId,
  billingInterval?: SubscriptionBillingInterval,
) {
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
      ...(billingInterval ? { billingInterval } : {}),
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
  billingInterval?: SubscriptionBillingInterval
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
      ...(payload.billingInterval ? { billingInterval: payload.billingInterval } : {}),
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
  /** Petrol: station id, or omit / null for all stations */
  assignedStationId?: string | null
}) {
  const body: Record<string, unknown> = {
    name: payload.name,
    email: payload.email,
    role: payload.role.toUpperCase(),
  }
  if (payload.assignedStationId) {
    body.assignedStationId = payload.assignedStationId
  }
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
    body: JSON.stringify(body),
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
  menuCategoryId?: string | null
  description: string | null
  price: number
  stock: number
  reservedStock?: number
  availableStock?: number
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
  const onHand = Math.max(0, Math.floor(Number(p.stock) || 0))
  const reserved = Math.max(0, Math.floor(Number(p.reservedStock) || 0))
  const rawAvail = p.availableStock
  const available =
    rawAvail !== undefined && rawAvail !== null
      ? Math.max(0, Math.floor(Number(rawAvail)))
      : Math.max(0, onHand - reserved)
  return {
    id: p.id,
    businessId: p.businessId,
    name: p.name,
    price: p.price,
    category: p.category,
    menuCategoryId: p.menuCategoryId ?? null,
    stock: onHand,
    reservedStock: reserved,
    availableStock: available,
    imageColor: p.imageColor,
    imageEmoji: p.imageEmoji,
    description: p.description ?? undefined,
    barcodeType: p.barcodeType,
    barcodeValue: p.barcodeValue,
    qrUrl: p.qrUrl,
    imageUrl: p.imageUrl?.trim()
      ? normalizeProductImageUrlForDisplay(p.imageUrl)
      : null,
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

export type FetchBusinessProductsPagedParams = {
  limit: number
  offset: number
  q?: string
  /** Restaurant menu category id, or `__uncategorized__` for items with no menu category. */
  menuCategoryId?: string
}

export async function fetchBusinessProductsPaged(
  businessId: string,
  params: FetchBusinessProductsPagedParams,
): Promise<{ items: Product[]; hasMore: boolean }> {
  const sp = new URLSearchParams()
  sp.set('limit', String(params.limit))
  sp.set('offset', String(params.offset))
  if (params.q?.trim()) {
    sp.set('q', params.q.trim())
  }
  if (params.menuCategoryId) {
    sp.set('menuCategoryId', params.menuCategoryId)
  }
  const response = await apiRequest<{
    data: BackendProduct[]
    meta: { hasMore: boolean; limit: number; offset: number }
  }>(`/businesses/${businessId}/products?${sp.toString()}`, {
    headers: {
      'x-business-id': businessId,
    },
  })
  return {
    items: response.data.map(mapBackendProductToProduct),
    hasMore: response.meta?.hasMore ?? false,
  }
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

export type MenuTreeNodePayload = {
  id: string
  name: string
  sortOrder: number
  children: MenuTreeNodePayload[]
  products: BackendProduct[]
}

export type RestaurantGuestMenuPayload = {
  business: { id: string; name: string; slug: string }
  table: { id: string; label: string; publicToken: string }
  menu: {
    categories: MenuTreeNodePayload[]
    uncategorizedProducts: BackendProduct[]
  }
}

export type GuestMenuTreeNode = {
  id: string
  name: string
  sortOrder: number
  children: GuestMenuTreeNode[]
  products: Product[]
}

function mapGuestMenuTreeNode(node: MenuTreeNodePayload): GuestMenuTreeNode {
  return {
    id: node.id,
    name: node.name,
    sortOrder: node.sortOrder,
    children: node.children.map(mapGuestMenuTreeNode),
    products: node.products.map(mapBackendProductToProduct),
  }
}

export async function fetchRestaurantGuestMenu(
  businessSlug: string,
  tableToken: string,
): Promise<{
  business: { id: string; name: string; slug: string }
  table: { id: string; label: string; publicToken: string }
  menu: {
    categories: GuestMenuTreeNode[]
    uncategorizedProducts: Product[]
  }
}> {
  const path = `/public/restaurant/${encodeURIComponent(businessSlug)}/t/${encodeURIComponent(tableToken)}`
  const response = await apiRequest<{ data: RestaurantGuestMenuPayload }>(path)
  return {
    business: response.data.business,
    table: response.data.table,
    menu: {
      categories: response.data.menu.categories.map(mapGuestMenuTreeNode),
      uncategorizedProducts: response.data.menu.uncategorizedProducts.map(mapBackendProductToProduct),
    },
  }
}

export async function createBusinessProduct(
  businessId: string,
  payload: {
    name: string
    category?: string
    menuCategoryId?: string
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
    menuCategoryId?: string
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

  return normalizeProductImageUrlForDisplay(response.data.imageUrl)
}

export type DiningTableRow = {
  id: string
  label: string
  publicToken: string
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export async function fetchDiningTables(businessId: string): Promise<DiningTableRow[]> {
  const response = await apiRequest<{ data: DiningTableRow[] }>(
    `/businesses/${businessId}/dining-tables`,
    { headers: { 'x-business-id': businessId } },
  )
  return response.data
}

export async function createDiningTable(
  businessId: string,
  body: { label: string; publicToken?: string; sortOrder?: number },
): Promise<DiningTableRow> {
  const response = await apiRequest<{ data: DiningTableRow }>(
    `/businesses/${businessId}/dining-tables`,
    {
      method: 'POST',
      headers: { 'x-business-id': businessId },
      body: JSON.stringify(body),
    },
  )
  return response.data
}

export async function updateDiningTable(
  businessId: string,
  tableId: string,
  body: { label?: string; publicToken?: string; isActive?: boolean; sortOrder?: number },
): Promise<DiningTableRow> {
  const response = await apiRequest<{ data: DiningTableRow }>(
    `/businesses/${businessId}/dining-tables/${tableId}`,
    {
      method: 'PATCH',
      headers: { 'x-business-id': businessId },
      body: JSON.stringify(body),
    },
  )
  return response.data
}

export async function deleteDiningTable(businessId: string, tableId: string): Promise<void> {
  await apiRequest<unknown>(`/businesses/${businessId}/dining-tables/${tableId}`, {
    method: 'DELETE',
    headers: { 'x-business-id': businessId },
  })
}

export type BusinessStationPumpRow = {
  id: string
  stationId: string
  label: string
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type BusinessStationRow = {
  id: string
  businessId: string
  name: string
  code: string | null
  address: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
  pumps: BusinessStationPumpRow[]
}

export async function fetchBusinessStations(businessId: string): Promise<BusinessStationRow[]> {
  const response = await apiRequest<{ data: BusinessStationRow[] }>(
    `/businesses/${businessId}/stations`,
    { headers: { 'x-business-id': businessId } },
  )
  return response.data
}

export async function createBusinessStation(
  businessId: string,
  body: { name: string; code?: string | null; address?: string | null; sortOrder?: number },
): Promise<BusinessStationRow> {
  const response = await apiRequest<{ data: BusinessStationRow }>(
    `/businesses/${businessId}/stations`,
    {
      method: 'POST',
      headers: { 'x-business-id': businessId },
      body: JSON.stringify(body),
    },
  )
  return response.data
}

export async function updateBusinessStation(
  businessId: string,
  stationId: string,
  body: {
    name?: string
    code?: string | null
    address?: string | null
    isActive?: boolean
    sortOrder?: number
  },
): Promise<BusinessStationRow> {
  const response = await apiRequest<{ data: BusinessStationRow }>(
    `/businesses/${businessId}/stations/${stationId}`,
    {
      method: 'PATCH',
      headers: { 'x-business-id': businessId },
      body: JSON.stringify(body),
    },
  )
  return response.data
}

export async function deleteBusinessStation(businessId: string, stationId: string): Promise<void> {
  await apiRequest<unknown>(`/businesses/${businessId}/stations/${stationId}`, {
    method: 'DELETE',
    headers: { 'x-business-id': businessId },
  })
}

export async function createBusinessStationPump(
  businessId: string,
  stationId: string,
  body: { label: string; sortOrder?: number },
): Promise<BusinessStationPumpRow> {
  const response = await apiRequest<{ data: BusinessStationPumpRow }>(
    `/businesses/${businessId}/stations/${stationId}/pumps`,
    {
      method: 'POST',
      headers: { 'x-business-id': businessId },
      body: JSON.stringify(body),
    },
  )
  return response.data
}

export async function updateBusinessStationPump(
  businessId: string,
  stationId: string,
  pumpId: string,
  body: { label?: string; isActive?: boolean; sortOrder?: number },
): Promise<BusinessStationPumpRow> {
  const response = await apiRequest<{ data: BusinessStationPumpRow }>(
    `/businesses/${businessId}/stations/${stationId}/pumps/${pumpId}`,
    {
      method: 'PATCH',
      headers: { 'x-business-id': businessId },
      body: JSON.stringify(body),
    },
  )
  return response.data
}

export async function deleteBusinessStationPump(
  businessId: string,
  stationId: string,
  pumpId: string,
): Promise<void> {
  await apiRequest<unknown>(`/businesses/${businessId}/stations/${stationId}/pumps/${pumpId}`, {
    method: 'DELETE',
    headers: { 'x-business-id': businessId },
  })
}

export type MenuCategoryRow = {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export async function fetchMenuCategories(businessId: string): Promise<MenuCategoryRow[]> {
  const response = await apiRequest<{ data: MenuCategoryRow[] }>(
    `/businesses/${businessId}/menu-categories`,
    { headers: { 'x-business-id': businessId } },
  )
  return response.data
}

export async function createMenuCategory(
  businessId: string,
  body: { name: string; parentId?: string | null; sortOrder?: number },
): Promise<MenuCategoryRow> {
  const response = await apiRequest<{ data: MenuCategoryRow }>(
    `/businesses/${businessId}/menu-categories`,
    {
      method: 'POST',
      headers: { 'x-business-id': businessId },
      body: JSON.stringify(body),
    },
  )
  return response.data
}

export async function updateMenuCategory(
  businessId: string,
  categoryId: string,
  body: { name?: string; parentId?: string | null; sortOrder?: number },
): Promise<MenuCategoryRow> {
  const response = await apiRequest<{ data: MenuCategoryRow }>(
    `/businesses/${businessId}/menu-categories/${categoryId}`,
    {
      method: 'PATCH',
      headers: { 'x-business-id': businessId },
      body: JSON.stringify(body),
    },
  )
  return response.data
}

export async function deleteMenuCategory(businessId: string, categoryId: string): Promise<void> {
  await apiRequest<unknown>(`/businesses/${businessId}/menu-categories/${categoryId}`, {
    method: 'DELETE',
    headers: { 'x-business-id': businessId },
  })
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
  const d = response.data
  return {
    ...d,
    imageUrl: d.imageUrl?.trim()
      ? normalizeProductImageUrlForDisplay(d.imageUrl)
      : null,
  }
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

export type PlatformDashboardSummary = {
  businessesTotal: number
  businessesCreatedLast7Days: number
  subscriptionsActive: number
  subscriptionsTrialing: number
  subscriptionsPastDue: number
  invoicesPendingPayment: number
  refundReviewsPending: number
  recentBusinesses: Array<{
    id: string
    name: string
    industry: string | null
    ownerEmail: string
    createdAt: string
  }>
}

export async function fetchPlatformDashboardSummary(): Promise<PlatformDashboardSummary> {
  const res = await apiRequest<{ data: PlatformDashboardSummary }>('/platform/dashboard-summary')
  return res.data
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

export type ManualRefundReviewStatus =
  | 'NONE'
  | 'PENDING_REVIEW'
  | 'APPROVED_FOR_REFUND'
  | 'DECLINED'
  | 'REFUNDED_EXTERNALLY'

export type PlatformBillingReviewRow = {
  invoice: {
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
  }
  business: {
    id: string
    name: string
    slug: string
    ownerName: string
    ownerEmail: string
  }
  plan: { id: string; code: string; name: string }
  subscription: {
    id: string
    status: BackendSubscriptionStatus
    currentPeriodEnd: string
    daysRemaining: number
  }
  paymentTransaction: {
    id: string
    provider: string
    amount: string
    currency: string
    providerPaymentRef: string | null
    succeededAt: string | null
  } | null
  manualRefundReview: {
    status: ManualRefundReviewStatus
    note: string | null
    reviewedAt: string | null
    reviewedBy: { id: string; name: string; email: string } | null
    /** Set when status is APPROVED_FOR_REFUND — target date for completing the refund. */
    expectedRefundBy: string | null
    /** Approved partial amount; null with APPROVED means full invoice total. */
    approvedRefundAmount: string | null
  }
}

export async function fetchPlatformBillingReview(params: {
  invoiceStatus?: InvoiceStatus
  refundReviewStatus?: ManualRefundReviewStatus
  page?: number
  pageSize?: number
}) {
  const sp = new URLSearchParams()
  if (params.invoiceStatus) {
    sp.set('invoiceStatus', params.invoiceStatus)
  }
  if (params.refundReviewStatus) {
    sp.set('refundReviewStatus', params.refundReviewStatus)
  }
  sp.set('page', String(params.page ?? 1))
  sp.set('pageSize', String(params.pageSize ?? 20))
  return apiRequest<{
    data: PlatformBillingReviewRow[]
    total: number
    page: number
    pageSize: number
  }>(`/platform/billing-review?${sp.toString()}`)
}

export async function patchPlatformBillingReviewInvoice(
  invoiceId: string,
  body: {
    manualRefundReviewStatus: ManualRefundReviewStatus
    manualRefundNote?: string | null
    /** YYYY-MM-DD — required when status is APPROVED_FOR_REFUND */
    refundExpectedBy?: string | null
    refundAmountMode?: 'FULL' | 'PARTIAL'
    refundPartialAmount?: number
  },
) {
  const response = await apiRequest<{
    data: {
      invoice: {
        id: string
        status: InvoiceStatus
        manualRefundReviewStatus: ManualRefundReviewStatus
        manualRefundNote: string | null
        manualRefundReviewedAt: string | null
        manualRefundExpectedBy: string | null
        manualRefundApprovedAmount: string | null
      }
      subscription: { currentPeriodEnd: string; daysRemaining: number }
      paymentTransaction: { id: string; provider: string; amount: string; succeededAt: string | null } | null
      reviewedBy: { id: string; name: string; email: string } | null
    }
  }>(`/platform/billing-review/invoices/${invoiceId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return response.data
}

/** Business-scoped list row (no `business` object; plan only). */
export type BusinessSubscriptionInvoiceRow = Omit<PlatformInvoiceRow, 'business'>

export async function fetchBusinessSubscriptionInvoices(
  businessId: string,
  params: {
    status?: InvoiceStatus
    createdFrom?: string
    createdTo?: string
    page?: number
    pageSize?: number
  },
) {
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
  return apiRequest<PaginatedPayload<BusinessSubscriptionInvoiceRow>>(
    `/businesses/${businessId}/subscription-invoices?${sp.toString()}`,
    { headers: { 'x-business-id': businessId } },
  )
}

export async function fetchBusinessSubscriptionInvoiceDetail(
  businessId: string,
  invoiceId: string,
) {
  const response = await apiRequest<{ data: PlatformInvoiceDetail }>(
    `/businesses/${businessId}/subscription-invoices/${invoiceId}`,
    { headers: { 'x-business-id': businessId } },
  )
  return response.data
}

export type BillingLedgerReportInvoiceRef = {
  id: string
  status: string
  billingPeriodStart: string
  billingPeriodEnd: string
  dueDate: string
  paidAt: string | null
}

export type BillingLedgerReportEntry = {
  id: string
  createdAt: string
  updatedAt: string
  type: string
  direction: string
  status: string
  amount: string
  currency: string
  provider: string
  providerCheckoutSessionId: string | null
  providerPaymentRef: string | null
  idempotencyKey: string | null
  metadata: unknown
  succeededAt: string | null
  failedAt: string | null
  subscriptionId: string | null
  subscriptionInvoiceId: string | null
  invoice: BillingLedgerReportInvoiceRef | null
  /** Platform-wide ledger rows only. */
  business?: { id: string; name: string } | null
}

export type BillingLedgerProviderSummary = {
  provider: string
  entryCount: number
  succeededIn: string
  succeededOut: string
  pendingCount: number
  failedCount: number
}

export type BillingLedgerReportData = {
  entries: BillingLedgerReportEntry[]
  total: number
  page: number
  pageSize: number
  netSucceeded: string
  currency: string | null
  netByCurrency: Array<{ currency: string; net: string }>
  byProvider: BillingLedgerProviderSummary[]
  byStatus: Record<string, number>
  byType: Record<string, number>
}

export async function fetchBusinessBillingLedgerReport(
  businessId: string,
  params: {
    month?: string
    quarter?: string
    year?: string
    page?: number
    pageSize?: number
  },
) {
  const sp = new URLSearchParams()
  if (params.month?.trim()) {
    sp.set('month', params.month.trim())
  }
  if (params.quarter?.trim()) {
    sp.set('quarter', params.quarter.trim())
  }
  if (params.year?.trim()) {
    sp.set('year', params.year.trim())
  }
  sp.set('page', String(params.page ?? 1))
  sp.set('pageSize', String(params.pageSize ?? 25))
  const response = await apiRequest<{ data: BillingLedgerReportData }>(
    `/businesses/${businessId}/billing-ledger-report?${sp.toString()}`,
    { headers: { 'x-business-id': businessId } },
  )
  return response.data
}

export async function fetchPlatformBillingLedgerReport(params: {
  month?: string
  quarter?: string
  year?: string
  createdFrom?: string
  createdTo?: string
  page?: number
  pageSize?: number
}) {
  const sp = new URLSearchParams()
  if (params.month?.trim()) {
    sp.set('month', params.month.trim())
  }
  if (params.quarter?.trim()) {
    sp.set('quarter', params.quarter.trim())
  }
  if (params.year?.trim()) {
    sp.set('year', params.year.trim())
  }
  if (params.createdFrom?.trim()) {
    sp.set('createdFrom', params.createdFrom.trim())
  }
  if (params.createdTo?.trim()) {
    sp.set('createdTo', params.createdTo.trim())
  }
  sp.set('page', String(params.page ?? 1))
  sp.set('pageSize', String(params.pageSize ?? 25))
  const response = await apiRequest<{ data: BillingLedgerReportData }>(
    `/platform/billing-ledger-report?${sp.toString()}`,
  )
  return response.data
}

/** Same filters as {@link fetchPlatformBillingLedgerReport}; requires **Billing transactions → Export** or legacy Invoices → Export on the platform role. */
export async function downloadPlatformBillingLedgerCsvExport(params: {
  month?: string
  quarter?: string
  year?: string
  createdFrom?: string
  createdTo?: string
}): Promise<void> {
  const sp = new URLSearchParams()
  if (params.month?.trim()) {
    sp.set('month', params.month.trim())
  }
  if (params.quarter?.trim()) {
    sp.set('quarter', params.quarter.trim())
  }
  if (params.year?.trim()) {
    sp.set('year', params.year.trim())
  }
  if (params.createdFrom?.trim()) {
    sp.set('createdFrom', params.createdFrom.trim())
  }
  if (params.createdTo?.trim()) {
    sp.set('createdTo', params.createdTo.trim())
  }
  const token = getStoredToken()
  const response = await fetch(
    `${API_BASE_URL}/platform/billing-ledger-report/export?${sp.toString()}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    },
  )
  if (!response.ok) {
    let errorMessage = 'Export failed.'
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload?.error) {
        errorMessage = payload.error
      }
    } catch {
      /* ignore */
    }
    throw new ApiError(errorMessage, response.status)
  }
  const blob = await response.blob()
  const cd = response.headers.get('Content-Disposition')
  const filenameMatch = cd?.match(/filename="([^"]+)"/)
  const filename = filenameMatch?.[1] ?? 'billing-transactions.csv'
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
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
  roleTemplates: { id: string; name: string }[]
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
  /** Single template (convenience); backend also accepts `roleTemplateIds`. */
  roleTemplateId?: string
  roleTemplateIds?: string[]
}) {
  const response = await apiRequest<{ data: Omit<PlatformFunctionGroupRow, 'roleTemplates' | 'userCount'> }>(
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
  payload: { name?: string; description?: string | null; roleTemplateIds?: string[] },
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

export type PartnerWebhookEndpointRow = {
  id: string
  label: string | null
  webhookUrl: string
  isEnabled: boolean
  sortOrder: number
  hasSigningSecret: boolean
  deliverable: boolean
  createdAt: string
  updatedAt: string
}

export async function fetchPartnerWebhookEndpoints() {
  const response = await apiRequest<{ data: PartnerWebhookEndpointRow[] }>(
    '/platform/security/partnership-config/webhooks',
  )
  return response.data
}

export async function createPartnerWebhookEndpoint(body: {
  label?: string | null
  webhookUrl: string
  signingSecret: string
  isEnabled?: boolean
  sortOrder?: number
}) {
  const response = await apiRequest<{ data: PartnerWebhookEndpointRow }>(
    '/platform/security/partnership-config/webhooks',
    { method: 'POST', body: JSON.stringify(body) },
  )
  return response.data
}

export async function updatePartnerWebhookEndpoint(
  endpointId: string,
  body: {
    label?: string | null
    webhookUrl?: string
    signingSecret?: string
    isEnabled?: boolean
    sortOrder?: number
  },
) {
  const response = await apiRequest<{ data: PartnerWebhookEndpointRow }>(
    `/platform/security/partnership-config/webhooks/${encodeURIComponent(endpointId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
  return response.data
}

export async function deletePartnerWebhookEndpoint(endpointId: string) {
  await apiRequest(`/platform/security/partnership-config/webhooks/${encodeURIComponent(endpointId)}`, {
    method: 'DELETE',
  })
}

export type PlatformPaymentGatewayRow = {
  id: string
  code: string
  name: string
  description: string | null
  isEnabled: boolean
  sortOrder: number
  checkoutAdapter: string | null
  createdAt: string
  updatedAt: string
}

export async function fetchPlatformPaymentGateways() {
  const response = await apiRequest<{ data: PlatformPaymentGatewayRow[] }>(
    '/platform/payment-gateways',
  )
  return response.data
}

export async function patchPlatformPaymentGateway(
  gatewayId: string,
  body: {
    isEnabled?: boolean
    name?: string
    description?: string | null
    sortOrder?: number
    checkoutAdapter?: string | null
  },
) {
  const response = await apiRequest<{ data: PlatformPaymentGatewayRow }>(
    `/platform/payment-gateways/${gatewayId}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
  return response.data
}

export async function createPlatformPaymentGateway(body: {
  code: string
  name: string
  description?: string | null
  sortOrder?: number
  isEnabled?: boolean
  checkoutAdapter?: string | null
}) {
  const response = await apiRequest<{ data: PlatformPaymentGatewayRow }>(
    '/platform/payment-gateways',
    { method: 'POST', body: JSON.stringify(body) },
  )
  return response.data
}

export async function deletePlatformPaymentGateway(gatewayId: string) {
  await apiRequest<unknown>(`/platform/payment-gateways/${gatewayId}`, { method: 'DELETE' })
}

/** Backend `ApsWalletCustomerAuthMerchantScope`: sales (business APS merchant) vs subscription (platform APS merchant). */
export type ApsWalletCustomerAuthMerchantScope = 'BUSINESS_MERCHANT' | 'PLATFORM_SUBSCRIPTION'

export type ApsWalletCustomerAuthRow = {
  id: string
  businessId: string
  businessName?: string
  gatewayId: string
  gatewayCode: string
  gatewayName: string
  customerMobileNormalized: string
  merchantScope: ApsWalletCustomerAuthMerchantScope
  lastUnlinkAttemptAt?: string
  lastUnlinkSucceededAt?: string
  lastUnlinkError?: string
  createdAt: string
  updatedAt: string
}

export async function fetchPlatformApsWalletCustomerAuths(params?: {
  businessId?: string
  gatewayCode?: string
}) {
  const sp = new URLSearchParams()
  if (params?.businessId?.trim()) sp.set('businessId', params.businessId.trim())
  if (params?.gatewayCode?.trim()) sp.set('gatewayCode', params.gatewayCode.trim())
  const q = sp.toString()
  const response = await apiRequest<{ data: ApsWalletCustomerAuthRow[] }>(
    `/platform/aps-wallet/customer-auths${q ? `?${q}` : ''}`,
  )
  return response.data
}

export async function clearPlatformApsWalletCustomerAuth(authId: string) {
  await apiRequest<unknown>(`/platform/aps-wallet/customer-auths/${encodeURIComponent(authId)}`, {
    method: 'DELETE',
  })
}

export async function unlinkPlatformApsWalletCustomerAuth(authId: string) {
  const response = await apiRequest<{ data: { ok: boolean; message: string } }>(
    `/platform/aps-wallet/customer-auths/${encodeURIComponent(authId)}/unlink`,
    {
      method: 'POST',
    },
  )
  return response.data
}

export type BusinessPaymentGatewayRow = {
  id: string
  code: string
  name: string
  description: string | null
  sortOrder: number
  checkoutAdapter: string | null
}

export async function fetchBusinessPaymentGateways(businessId: string) {
  const response = await apiRequest<{ data: BusinessPaymentGatewayRow[] }>(
    `/businesses/${businessId}/payment-gateways`,
    { headers: { 'x-business-id': businessId } },
  )
  return response.data
}

export type BusinessPaymentMethodRow = {
  id: string
  label: string
  isDefault: boolean
  status: string
  createdAt: string
  gateway: { id: string; code: string; name: string }
  metadata: unknown
}

export async function fetchBusinessPaymentMethods(businessId: string) {
  const response = await apiRequest<{ data: BusinessPaymentMethodRow[] }>(
    `/businesses/${businessId}/payment-methods`,
    { headers: { 'x-business-id': businessId } },
  )
  return response.data
}

export async function addBusinessPaymentMethodRequest(
  businessId: string,
  body: { gatewayCode: string; label: string; isDefault?: boolean },
) {
  const response = await apiRequest<{ data: BusinessPaymentMethodRow }>(
    `/businesses/${businessId}/payment-methods`,
    {
      method: 'POST',
      headers: { 'x-business-id': businessId },
      body: JSON.stringify(body),
    },
  )
  return response.data
}

export async function archiveBusinessPaymentMethodRequest(businessId: string, methodId: string) {
  await apiRequest<unknown>(`/businesses/${businessId}/payment-methods/${methodId}`, {
    method: 'DELETE',
    headers: { 'x-business-id': businessId },
  })
}

export async function paySubscriptionInvoice(businessId: string, invoiceId: string) {
  const response = await apiRequest<{ data: BackendInvoice }>(
    `/businesses/${businessId}/invoices/${invoiceId}/pay`,
    {
      method: 'POST',
      headers: { 'x-business-id': businessId },
    },
  )
  return response.data
}

export async function startSubscriptionInvoiceCheckout(
  businessId: string,
  invoiceId: string,
  body: { gatewayCode: string; restrictPayerMobile?: string; payerPhone?: string },
) {
  const response = await apiRequest<{
    data: {
      sessionId: string
      launchUrl: string
      paymentHtml?: string
      amount: number
      currency: string
      paymentStatus: string
      checkoutStatus: string
      gatewayCode: string
    }
  }>(`/businesses/${businessId}/invoices/${invoiceId}/checkout`, {
    method: 'POST',
    headers: { 'x-business-id': businessId },
    body: JSON.stringify(body),
  })
  return response.data
}

export async function authorizeSubscriptionInvoiceApsCheckout(
  businessId: string,
  invoiceId: string,
  body: { gatewayCode: string; payerMobile: string },
) {
  const response = await apiRequest<{ data: { authState: string; requiresOtp: boolean } }>(
    `/businesses/${businessId}/invoices/${invoiceId}/checkout/aps-wallet/authorize`,
    {
      method: 'POST',
      headers: { 'x-business-id': businessId },
      body: JSON.stringify(body),
    },
  )
  return response.data
}

export async function completeSubscriptionInvoiceApsCheckout(
  businessId: string,
  invoiceId: string,
  body: { gatewayCode: string; otp?: string; authState: string },
) {
  const response = await apiRequest<{ data: { paid: true } }>(
    `/businesses/${businessId}/invoices/${invoiceId}/checkout/aps-wallet/complete`,
    {
      method: 'POST',
      headers: { 'x-business-id': businessId },
      body: JSON.stringify(body),
    },
  )
  return response.data
}

export type PlanChangePendingInvoice = BackendInvoice & {
  guestPayUrl: string | null
}

export async function changeBusinessSubscriptionPlan(
  businessId: string,
  body: { planCode: BackendPlanCode; billingInterval?: SubscriptionBillingInterval },
) {
  const response = await apiRequest<{
    data: {
      currentSubscription: BackendSubscription & { invoices: BackendInvoice[] }
      pendingInvoice: PlanChangePendingInvoice
    }
  }>(`/businesses/${businessId}/subscription`, {
    method: 'PATCH',
    headers: { 'x-business-id': businessId },
    body: JSON.stringify(body),
  })
  return response.data
}

export type GatewayCredentialFieldStatus = {
  aggregatedMerchant?: boolean
  platformWaveBearer?: boolean
  webhookSecret?: boolean
  /** Wave/Yonna/APS: wallet fee rate (0–1) saved for POS/order accounting. */
  customerWalletFeeRate?: boolean
  clientId?: boolean
  secretKey?: boolean
  /** APS: merchant login username saved (encrypted). */
  apsUsername?: boolean
  /** APS: merchant password saved (encrypted). */
  apsPassword?: boolean
  /** Server has APS_WALLET_BASE_URL. */
  apsApiBase?: boolean
}

export type BusinessGatewayCredentialStatusRow = {
  gatewayId: string
  code: string
  name: string
  checkoutAdapter: string | null
  hasCredential: boolean
  /** True when minimum secrets exist to run checkout (aggregated merchant for Wave; client + secret for Yonna). */
  checkoutConfigured: boolean
  /** Which secret slots are populated; never includes secret values. */
  fieldStatus: GatewayCredentialFieldStatus | null
  updatedAt: string | null
}

export type PaymentWebhookEndpoints = {
  wave: string
  yonnaForex: string
}

export type BusinessGatewayCredentialStatusResponse = {
  credentialStatus: BusinessGatewayCredentialStatusRow[]
  /** Platform `WAVE_CHECKOUT_BEARER` configured (aggregator parent account). */
  platformWaveConfigured: boolean
  webhookEndpoints: PaymentWebhookEndpoints | null
}

export async function fetchBusinessGatewayCredentialStatus(businessId: string) {
  const response = await apiRequest<{ data: BusinessGatewayCredentialStatusResponse }>(
    `/businesses/${businessId}/gateway-credentials`,
    { headers: { 'x-business-id': businessId } },
  )
  return response.data
}

export async function upsertBusinessGatewayCredentialRequest(
  businessId: string,
  body: { gatewayCode: string; secrets: Record<string, unknown>; replaceSecrets?: boolean },
) {
  await apiRequest<{ data: { ok: boolean } }>(`/businesses/${businessId}/gateway-credentials`, {
    method: 'PUT',
    headers: { 'x-business-id': businessId },
    body: JSON.stringify(body),
  })
}

export type WaveAggregatedMerchantProvisionLogRow = {
  id: string
  businessId: string
  trigger: string
  operation: string | null
  status: string
  requestedName: string | null
  requestPayload: unknown
  aggregatedMerchantId: string | null
  errorMessage: string | null
  createdAt: string
}

export async function provisionWaveAggregatedMerchant(
  businessId: string,
  options?: { force?: boolean },
) {
  const response = await apiRequest<{
    data: {
      status: 'succeeded' | 'skipped' | 'failed'
      aggregatedMerchantId?: string
      message?: string
    }
  }>(`/platform/businesses/${businessId}/wave-aggregated-merchant/provision`, {
    method: 'POST',
    body: JSON.stringify({ force: Boolean(options?.force) }),
  })
  return response.data
}

export type PlatformWaveAggregatedMerchantRow = {
  id: string
  name: string
  business_sector: string | null
  business_type: string
  business_registration_identifier: string | null
  website_url: string | null
  payout_fee_structure_name?: string
  checkout_fee_structure_name?: string
  business_description: string
  manager_name: string | null
  is_locked: boolean
  when_created: string
  business: {
    id: string
    name: string
    slug: string
    ownerEmail: string
  } | null
  lastProvision: {
    status: string
    trigger: string
    createdAt: string
  } | null
}

export async function fetchPlatformWaveAggregatedMerchants(params?: {
  first?: number
  after?: string
}) {
  const sp = new URLSearchParams()
  if (params?.first != null) {
    sp.set('first', String(params.first))
  }
  if (params?.after?.trim()) {
    sp.set('after', params.after.trim())
  }
  const q = sp.toString()
  const response = await apiRequest<{
    data: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
      items: PlatformWaveAggregatedMerchantRow[]
    }
  }>(`/platform/wave-aggregated-merchants${q ? `?${q}` : ''}`)
  return response.data
}

export async function updatePlatformWaveAggregatedMerchant(
  merchantId: string,
  name: string,
): Promise<PlatformWaveAggregatedMerchantRow> {
  const response = await apiRequest<{ data: PlatformWaveAggregatedMerchantRow }>(
    `/platform/wave-aggregated-merchants/${encodeURIComponent(merchantId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    },
  )
  return response.data
}

export async function fetchWaveAggregatedMerchantProvisionLogs(businessId: string) {
  const response = await apiRequest<{
    data: { logs: WaveAggregatedMerchantProvisionLogRow[] }
  }>(`/platform/businesses/${businessId}/wave-aggregated-merchant/provision-logs`)
  return response.data
}

export async function deleteBusinessGatewayCredentialRequest(
  businessId: string,
  gatewayCode: string,
) {
  await apiRequest<unknown>(
    `/businesses/${businessId}/gateway-credentials/${encodeURIComponent(gatewayCode)}`,
    {
      method: 'DELETE',
      headers: { 'x-business-id': businessId },
    },
  )
}

export async function fetchBusinessApsWalletCustomerAuths(businessId: string) {
  const response = await apiRequest<{ data: ApsWalletCustomerAuthRow[] }>(
    `/businesses/${businessId}/aps-wallet/customer-auths`,
    { headers: { 'x-business-id': businessId } },
  )
  return response.data
}

export async function clearBusinessApsWalletCustomerAuth(businessId: string, authId: string) {
  await apiRequest<unknown>(
    `/businesses/${businessId}/aps-wallet/customer-auths/${encodeURIComponent(authId)}`,
    {
      method: 'DELETE',
      headers: { 'x-business-id': businessId },
    },
  )
}

export async function unlinkBusinessApsWalletCustomerAuth(businessId: string, authId: string) {
  const response = await apiRequest<{ data: { ok: boolean; message: string } }>(
    `/businesses/${businessId}/aps-wallet/customer-auths/${encodeURIComponent(authId)}/unlink`,
    {
      method: 'POST',
      headers: { 'x-business-id': businessId },
    },
  )
  return response.data
}

// --- Platform accounting (DirectPay operator GL; no x-business-id) ---

export type PlatformGlBalanceReportData = {
  asOf: string
  rows: Array<{
    chartOfAccountId: string
    code: string
    name: string
    category: string
    debitTotal: number
    creditTotal: number
    balance: number
  }>
  totalDebit: number
  totalCredit: number
  difference: number
}

export type PlatformProfitLossReportData = {
  from: string
  to: string
  revenue: { lines: Array<{ chartOfAccountId: string; code: string; name: string; amount: number }>; total: number }
  costOfSales: { lines: Array<{ chartOfAccountId: string; code: string; name: string; amount: number }>; total: number }
  operatingExpenses: {
    lines: Array<{ chartOfAccountId: string; code: string; name: string; amount: number }>
    total: number
  }
  grossProfit: number
  netProfit: number
}

export type PlatformAccountStatementReportData = {
  account: { id: string; code: string; name: string; category: string }
  from: string
  to: string
  openingBalance: number
  closingBalance: number
  lines: Array<{
    id: string
    postedAt: string
    journalEntryId: string
    reference: string | null
    memo: string | null
    lineDescription: string | null
    debit: number
    credit: number
    balance: number
  }>
}

export type PlatformChartAccountMini = {
  id: string
  code: string
  name: string
  category: string
}

export type PlatformJournalLineRow = {
  id: string
  chartOfAccountId: string
  code: string
  name: string
  category: string
  debit: number
  credit: number
  description: string | null
}

export type PlatformJournalEntryRow = {
  id: string
  postedAt: string
  memo: string | null
  reference: string | null
  sourceType: string | null
  sourceId: string | null
  reversesPlatformJournalEntryId?: string | null
  hasReversal?: boolean
  billPayment?: { id: string; publicCode: string } | null
  createdAt: string
  lines: PlatformJournalLineRow[]
}

export async function fetchPlatformGlBalanceReport(asOf: string): Promise<PlatformGlBalanceReportData> {
  const qs = new URLSearchParams({ asOf })
  const res = await apiRequest<{ data: PlatformGlBalanceReportData }>(
    `/platform/accounting/reports/gl-balance?${qs}`,
  )
  return res.data
}

export async function fetchPlatformProfitLossReport(
  from: string,
  to: string,
): Promise<PlatformProfitLossReportData> {
  const qs = new URLSearchParams({ from, to })
  const res = await apiRequest<{ data: PlatformProfitLossReportData }>(
    `/platform/accounting/reports/profit-loss?${qs}`,
  )
  return res.data
}

export async function fetchPlatformAccountStatementReports(
  chartOfAccountIds: string[],
  from: string,
  to: string,
): Promise<PlatformAccountStatementReportData[]> {
  if (chartOfAccountIds.length === 0) return []
  const qs = new URLSearchParams({
    chartOfAccountIds: chartOfAccountIds.join(','),
    from,
    to,
  })
  const res = await apiRequest<{ data: { statements: PlatformAccountStatementReportData[] } }>(
    `/platform/accounting/reports/account-statement?${qs}`,
  )
  return res.data.statements
}

export async function fetchPlatformAccountsForReports(): Promise<PlatformChartAccountMini[]> {
  const res = await apiRequest<{ data: PlatformChartAccountMini[] }>(
    '/platform/accounting/accounts-for-reports',
  )
  return res.data
}

export async function fetchPlatformJournalEntries(
  page: number,
  pageSize: number,
  opts?: { scope?: 'all' | 'operator'; from?: string; to?: string },
) {
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  if (opts?.scope === 'operator') {
    qs.set('scope', 'operator')
  }
  if (opts?.from?.trim()) qs.set('from', opts.from.trim())
  if (opts?.to?.trim()) qs.set('to', opts.to.trim())
  return apiRequest<{
    data: PlatformJournalEntryRow[]
    total: number
    page: number
    pageSize: number
  }>(`/platform/accounting/journal-entries?${qs}`)
}

export type MerchantJournalListRow = {
  id: string
  businessId: string
  businessName: string
  postedAt: string
  memo: string | null
  reference: string | null
  sourceType: string | null
  sourceId: string | null
  journalApprovalExempt: boolean
  approvedAt: string | null
  approvedBy: { id: string; name: string; email: string } | null
  cancelledAt: string | null
  cancelledBy: { id: string; name: string; email: string } | null
  reversesJournalEntryId: string | null
  postedByPlatformUserId: string | null
  postedByPlatformUser: { id: string; name: string; email: string } | null
  createdAt: string
}

export type MerchantJournalDetailData = {
  id: string
  businessId: string
  businessName: string
  postedAt: string
  memo: string | null
  reference: string | null
  sourceType: string | null
  sourceId: string | null
  contactId: string | null
  journalApprovalExempt: boolean
  approvedAt: string | null
  approvedBy: { id: string; name: string; email: string } | null
  cancelledAt: string | null
  cancelledBy: { id: string; name: string; email: string } | null
  reversesJournalEntryId: string | null
  postedByPlatformUserId: string | null
  postedByPlatformUser: { id: string; name: string; email: string } | null
  createdAt: string
  lines: Array<{
    id: string
    chartOfAccountId: string
    code: string
    name: string
    category: string
    debit: number
    credit: number
    description: string | null
  }>
}

export async function fetchMerchantJournalEntries(params: {
  page: number
  pageSize: number
  businessId?: string
  from?: string
  to?: string
  /** `business` = merchant staff / on-books only; `operator` = platform-posted for a business; default / omit = all */
  ledgerScope?: 'business' | 'operator' | 'all'
}) {
  const qs = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  })
  if (params.businessId?.trim()) qs.set('businessId', params.businessId.trim())
  if (params.from?.trim()) qs.set('from', params.from.trim())
  if (params.to?.trim()) qs.set('to', params.to.trim())
  if (params.ledgerScope && params.ledgerScope !== 'all') qs.set('ledgerScope', params.ledgerScope)
  return apiRequest<{
    data: MerchantJournalListRow[]
    total: number
    page: number
    pageSize: number
  }>(`/platform/accounting/merchant-journal-entries?${qs}`)
}

export async function fetchMerchantJournalEntryDetail(journalEntryId: string) {
  const res = await apiRequest<{ data: MerchantJournalDetailData }>(
    `/platform/accounting/merchant-journal-entries/${encodeURIComponent(journalEntryId)}`,
  )
  return res.data
}

export async function postMerchantJournalApprove(journalEntryId: string) {
  const res = await apiRequest<{ data: MerchantJournalDetailData }>(
    `/platform/accounting/merchant-journal-entries/${encodeURIComponent(journalEntryId)}/approve`,
    { method: 'POST' },
  )
  return res.data
}

export async function postMerchantJournalCancel(journalEntryId: string) {
  const res = await apiRequest<{ data: MerchantJournalDetailData }>(
    `/platform/accounting/merchant-journal-entries/${encodeURIComponent(journalEntryId)}/cancel`,
    { method: 'POST' },
  )
  return res.data
}

export async function postPlatformManualJournal(body: {
  postedAt: string
  memo?: string | null
  reference?: string | null
  lines: Array<{
    chartOfAccountId: string
    debit: number
    credit: number
    description?: string | null
  }>
}) {
  const res = await apiRequest<{ data: { id: string } }>('/platform/accounting/journal-entries/manual', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return res.data
}

export type PlatformChartAccountDetail = {
  id: string
  code: string
  name: string
  description: string | null
  category: string
  kind: string
  isSystem: boolean
  createdAt: string
  updatedAt: string
}

export async function fetchPlatformAccountingChart(): Promise<PlatformChartAccountDetail[]> {
  const res = await apiRequest<{ data: PlatformChartAccountDetail[] }>(
    '/platform/accounting/chart-of-accounts',
  )
  return res.data
}

export async function createPlatformChartAccount(body: {
  code: string
  name: string
  category: string
  description?: string | null
}): Promise<PlatformChartAccountDetail> {
  const res = await apiRequest<{ data: PlatformChartAccountDetail }>(
    '/platform/accounting/chart-of-accounts',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
  return res.data
}

export async function updatePlatformChartAccount(
  accountId: string,
  body: Partial<{ code: string; name: string; category: string; description: string | null }>,
): Promise<PlatformChartAccountDetail> {
  const res = await apiRequest<{ data: PlatformChartAccountDetail }>(
    `/platform/accounting/chart-of-accounts/${accountId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  )
  return res.data
}

export async function deletePlatformChartAccount(accountId: string) {
  await apiRequest(`/platform/accounting/chart-of-accounts/${accountId}`, { method: 'DELETE' })
}

export async function postPlatformJournalReverse(journalEntryId: string, body: { postedAt: string; memo?: string | null }) {
  const res = await apiRequest<{ data: { id: string } }>(
    `/platform/accounting/journal-entries/${encodeURIComponent(journalEntryId)}/reverse`,
    { method: 'POST', body: JSON.stringify(body) },
  )
  return res.data
}

export type PlatformActivityLogRow = {
  id: string
  eventType: string
  resourceType: string
  resourceId: string | null
  actorKind: 'user' | 'system'
  actor: { id: string; name: string; email: string } | null
  metadata: unknown
  createdAt: string
}

export async function fetchPlatformActivityLog(params: {
  page?: number
  pageSize?: number
  eventType?: string
  actorKind?: 'user' | 'system' | ''
}) {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('pageSize', String(params.pageSize))
  if (params.eventType) qs.set('eventType', params.eventType)
  if (params.actorKind) qs.set('actorKind', params.actorKind)
  return apiRequest<{
    data: { total: number; page: number; pageSize: number; logs: PlatformActivityLogRow[] }
  }>(`/platform/activity-log?${qs}`)
}

export type PlatformTenantActivityLogRow = {
  id: string
  business: { id: string; name: string }
  eventType: string
  resourceType: string
  resourceId: string | null
  actorKind: 'user' | 'system'
  actor: { id: string; name: string; email: string } | null
  metadata: unknown
  createdAt: string
}

export async function fetchPlatformTenantActivityLog(params: {
  page?: number
  pageSize?: number
  from: string
  to: string
  eventType?: string
  actorKind?: 'user' | 'system' | ''
  businessId?: string
  businessName?: string
}) {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('pageSize', String(params.pageSize))
  qs.set('from', params.from)
  qs.set('to', params.to)
  if (params.eventType) qs.set('eventType', params.eventType)
  if (params.actorKind) qs.set('actorKind', params.actorKind)
  if (params.businessId) qs.set('businessId', params.businessId)
  if (params.businessName?.trim()) qs.set('businessName', params.businessName.trim())
  return apiRequest<{
    data: { total: number; page: number; pageSize: number; logs: PlatformTenantActivityLogRow[] }
  }>(`/platform/tenant-activity-log?${qs}`)
}

export type PlatformSupplierRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  createdAt: string
}

export async function fetchPlatformSuppliers(): Promise<PlatformSupplierRow[]> {
  const res = await apiRequest<{ data: PlatformSupplierRow[] }>('/platform/suppliers')
  return res.data
}

export async function createPlatformSupplier(body: {
  name: string
  email?: string | null
  phone?: string | null
}): Promise<PlatformSupplierRow> {
  const res = await apiRequest<{ data: PlatformSupplierRow }>('/platform/suppliers', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return res.data
}

export async function patchPlatformSupplier(
  supplierId: string,
  body: { name?: string; email?: string | null; phone?: string | null },
): Promise<PlatformSupplierRow> {
  const res = await apiRequest<{ data: PlatformSupplierRow }>(
    `/platform/suppliers/${encodeURIComponent(supplierId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
  return res.data
}

export type PlatformBillBulkPostGatewayRow = {
  gatewayId: string
  code: string
  name: string
  checkoutAdapter: string
  hasStoredPayerPhone: boolean
}

export type PlatformBillBulkPostPreviewItem = {
  billId: string
  publicCode: string | null
  supplierName: string | null
  supplierPhone: string | null
  supplierPhoneNormalized: string | null
  amount: number | null
  currency: string | null
  narrations: string[]
  warnings: string[]
  eligible: boolean
}

export type PlatformBillBulkPostPreview = {
  items: PlatformBillBulkPostPreviewItem[]
  gateways: PlatformBillBulkPostGatewayRow[]
}

export type PlatformBillBulkPostResult = {
  billId: string
  success: boolean
  publicCode?: string | null
  supplierName?: string | null
  amount?: number | null
  currency?: string | null
  supplierPhone?: string | null
  error?: string
  errorPhase?: 'validation' | 'aps_send' | 'ledger'
  transactionId?: string
}

export type PlatformBillBulkPostSummary = {
  succeeded: number
  failed: number
  results: PlatformBillBulkPostResult[]
}

export async function fetchPlatformBillBulkPostGateways(): Promise<PlatformBillBulkPostGatewayRow[]> {
  const res = await apiRequest<{ data: PlatformBillBulkPostGatewayRow[] }>(
    '/platform/bills/bulk-post/gateways',
  )
  return res.data
}

export async function previewPlatformBillBulkPost(
  billIds: string[],
): Promise<PlatformBillBulkPostPreview> {
  const res = await apiRequest<{ data: PlatformBillBulkPostPreview }>(
    '/platform/bills/bulk-post/preview',
    { method: 'POST', body: JSON.stringify({ billIds }) },
  )
  return res.data
}

export async function executePlatformBillBulkPost(body: {
  billIds: string[]
  gatewayCode: string
  settlementChartAccountId: string
  postedAt: string
}): Promise<PlatformBillBulkPostSummary> {
  const res = await apiRequest<{ data: { results: PlatformBillBulkPostResult[] } }>(
    '/platform/bills/bulk-post',
    { method: 'POST', body: JSON.stringify(body) },
  )
  const results = res.data.results
  return {
    results,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  }
}

export type PlatformBillRow = {
  id: string
  supplierId: string
  publicCode: string
  status: string
  issueDate: string
  dueDate: string | null
  reference: string | null
  currency: string
  settlementChartAccountId: string | null
  platformJournalEntryId: string | null
  approvedAt: string | null
  paidAt: string | null
  paymentGatewayCode: string | null
  paymentProviderRef: string | null
  createdAt: string
  updatedAt: string
  supplier: { id: string; name: string; email: string | null; phone: string | null }
  journalEntry: { id: string; postedAt: string } | null
  lines: Array<{
    id: string
    chartOfAccountId: string
    narration: string
    quantity: number
    unitLabel: string | null
    unitAmount: number
    taxAmount: number
    sortOrder: number
    chartOfAccount: { id: string; code: string; name: string }
  }>
}

export async function fetchPlatformBills(): Promise<PlatformBillRow[]> {
  const res = await apiRequest<{ data: PlatformBillRow[] }>('/platform/bills')
  return res.data
}

export async function fetchPlatformBillDetail(billId: string): Promise<PlatformBillRow> {
  const res = await apiRequest<{ data: PlatformBillRow }>(`/platform/bills/${encodeURIComponent(billId)}`)
  return res.data
}

export async function createPlatformBillApi(body: {
  supplierId: string
  issueDate: string
  dueDate?: string | null
  reference?: string | null
  currency?: string | null
  lines: Array<{
    chartOfAccountId: string
    narration: string
    quantity: number
    unitLabel?: string | null
    unitAmount: number
    taxAmount: number
  }>
}): Promise<PlatformBillRow> {
  const res = await apiRequest<{ data: PlatformBillRow }>('/platform/bills', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return res.data
}

export async function approvePlatformBillApi(billId: string): Promise<PlatformBillRow> {
  const res = await apiRequest<{ data: PlatformBillRow }>(
    `/platform/bills/${encodeURIComponent(billId)}/approve`,
    { method: 'POST', body: '{}' },
  )
  return res.data
}

export async function markPlatformBillPaidApi(
  billId: string,
  body: { settlementChartAccountId: string; postedAt: string },
): Promise<PlatformBillRow> {
  const res = await apiRequest<{ data: PlatformBillRow }>(
    `/platform/bills/${encodeURIComponent(billId)}/mark-paid`,
    { method: 'POST', body: JSON.stringify(body) },
  )
  return res.data
}

export async function voidPlatformBillApi(billId: string): Promise<PlatformBillRow> {
  const res = await apiRequest<{ data: PlatformBillRow }>(
    `/platform/bills/${encodeURIComponent(billId)}/void`,
    { method: 'POST', body: '{}' },
  )
  return res.data
}
