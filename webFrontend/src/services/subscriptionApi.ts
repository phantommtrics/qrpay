import { API_BASE_URL } from '../config/api'
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

export type BackendPlanCode = 'BASIC' | 'PRO' | 'BUSINESS_PRO'

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
  currentPeriodEnd: string
  plan: BackendPlan
  invoices?: BackendInvoice[]
}

export type BackendSubscriptionEnvelope = {
  business: BackendBusiness
  currentSubscription: (BackendSubscription & { invoices: BackendInvoice[] }) | null
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

function formatYearlyPriceLabel(yearlyPrice: string) {
  const amount = Number(yearlyPrice)
  return Number.isNaN(amount) ? `${yearlyPrice} / year` : `D${amount.toLocaleString()} / year`
}

function formatStaffLabel(staffLimit: number) {
  return `Up to ${staffLimit} staff`
}

export function mapBackendPlanToSubscriptionPlan(plan: BackendPlan): SubscriptionPlan {
  const yearly =
    plan.yearlyPrice !== undefined && plan.yearlyPrice !== ''
      ? plan.yearlyPrice
      : String(Number(plan.monthlyPrice) * 12)
  return {
    id: toPlanId(plan.code),
    name: plan.name,
    priceLabel: formatPriceLabel(plan.monthlyPrice),
    yearlyPriceLabel: formatYearlyPriceLabel(yearly),
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
    subscriptionBillingInterval: currentSubscription?.billingInterval,
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
  const reserved = p.reservedStock ?? 0
  const available =
    p.availableStock ?? Math.max(0, p.stock - reserved)
  return {
    id: p.id,
    businessId: p.businessId,
    name: p.name,
    price: p.price,
    category: p.category,
    menuCategoryId: p.menuCategoryId ?? null,
    stock: p.stock,
    reservedStock: reserved,
    availableStock: available,
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

  return response.data.imageUrl
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

export async function changeBusinessSubscriptionPlan(
  businessId: string,
  body: { planCode: BackendPlanCode; billingInterval?: SubscriptionBillingInterval },
) {
  const response = await apiRequest<{
    data: { currentSubscription: BackendSubscription & { invoices: BackendInvoice[] } }
  }>(`/businesses/${businessId}/subscription`, {
    method: 'PATCH',
    headers: { 'x-business-id': businessId },
    body: JSON.stringify(body),
  })
  return response.data
}

export type GatewayCredentialFieldStatus = {
  apiBearer?: boolean
  webhookSecret?: boolean
  /** Wave/Yonna: wallet fee rate (0–1) saved for POS/order accounting. */
  customerWalletFeeRate?: boolean
  clientId?: boolean
  secretKey?: boolean
  /** Yonna: default wallet phone saved for QR checkout. */
  defaultPayerPhone?: boolean
}

export type BusinessGatewayCredentialStatusRow = {
  gatewayId: string
  code: string
  name: string
  checkoutAdapter: string | null
  hasCredential: boolean
  /** True when minimum secrets exist to run checkout (bearer for Wave; client + secret for Yonna). */
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

// --- Platform accounting (EasyPay operator GL; no x-business-id) ---

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

export async function fetchPlatformJournalEntries(page: number, pageSize: number) {
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  return apiRequest<{
    data: PlatformJournalEntryRow[]
    total: number
    page: number
    pageSize: number
  }>(`/platform/accounting/journal-entries?${qs}`)
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
