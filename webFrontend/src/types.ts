export type UserRole =
  | 'platform_owner'
  | 'platform_admin'
  | 'admin'
  | 'merchant'
  | 'cashier'
  | 'customer'

export type PlanId = 'basic' | 'pro' | 'business_pro'

/** Matches backend `BillingInterval` enum. */
export type SubscriptionBillingInterval = 'MONTHLY' | 'YEARLY'

export type BusinessMembershipStatus = 'ACTIVE' | 'BLOCKED' | 'SUSPENDED' | 'TERMINATED'

export type SubscriptionStatus = 'trialing' | 'active' | 'expiring_soon' | 'past_due' | 'expired'

export type PermissionKey =
  | 'platform.manage'
  | 'platform.users.manage'
  | 'platform.businesses.manage'
  | 'platform.subscriptions.view'
  | 'platform.invoices.view'
  | 'platform.invoices.export'
  | 'platform.billing_transactions.view'
  | 'platform.billing_transactions.export'
  | 'platform.billing_review.view'
  | 'platform.billing_review.edit'
  | 'platform.billing.manage'
  | 'platform.payment_gateways.manage'
  | 'platform.system.view'
  | 'platform.security.roles.view'
  | 'platform.security.function_groups.view'
  | 'platform.security.users.view'
  | 'platform.security.move_users.view'
  | 'business.manage'
  | 'staff.manage'
  | 'status.change.view'
  | 'products.manage'
  | 'products.view'
  | 'products.create'
  | 'products.edit'
  | 'products.delete'
  | 'orders.manage'
  | 'orders.view'
  | 'payments.manage'
  | 'payments.view'
  | 'payments.export'
  | 'reports.view'
  | 'reports.export'
  | 'accounting.view'
  | 'accounting.chart.view'
  | 'pos.access'
  | 'dashboard.view'
  | 'organization.manage'
  | 'business.configuration'
  | 'subscriptions.billings'
  | 'subscriptions.invoices'
  | 'subscriptions.billing_activity'
  | 'merchant.api'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  mustChangePassword: boolean
  isPlatformOwner?: boolean
  isPlatformAdmin?: boolean
  /** Effective platform RBAC (merged templates via function group). */
  platformPermissions?: PlatformPermissionMatrix
}

export interface SubscriptionPlan {
  id: PlanId
  name: string
  priceLabel: string
  yearlyPriceLabel: string
  staffLabel: string
  minStaff: number
  maxStaff: number | null
  description: string
  highlighted?: boolean
}

export interface Organization {
  id: string
  name: string
  slug: string
  industry: string
  planId: PlanId
  staffCount: number
  ownerName: string
  subscriptionExpiresAt: string
  subscriptionState?: SubscriptionStatus
  subscriptionInvoiceDueAt?: string | null
  /** Present when subscription is loaded from the API. */
  subscriptionBillingInterval?: SubscriptionBillingInterval
  isOwner?: boolean
  /** Staff access state for this login; owners are always ACTIVE in API responses. */
  membershipStatus?: BusinessMembershipStatus
  createdAt: string
}

export interface LoginAccount {
  id: string
  email: string
  password?: string
  name: string
  role: UserRole
  organizationId?: string
  isOwner?: boolean
  isPlatformOwner?: boolean
  isPlatformAdmin?: boolean
  createdAt?: string
  membershipStatus?: BusinessMembershipStatus
}

export interface PermissionDefinition {
  key: PermissionKey
  label: string
  description: string
  category:
    | 'Views'
    | 'Actions'
    | 'Reports'
    | 'Administration'
    | 'Products'
    | 'Operations'
    | 'Integrations'
}

export type PlanPermissions = Record<PlanId, Partial<Record<PermissionKey, boolean>>>

export type PlatformPermissionMatrix = Record<
  string,
  Partial<Record<'view' | 'create' | 'edit' | 'delete' | 'export', boolean>>
>

export interface Product {
  id: string
  name: string
  price: number
  category: string
  /** Restaurant menu leaf category (when set). */
  menuCategoryId?: string | null
  /** On-hand units (physical count from server). */
  stock: number
  /** Units available to sell now (on hand minus reservations). Same as stock if omitted. */
  availableStock?: number
  reservedStock?: number
  imageColor: string
  imageEmoji: string
  businessId: string
  description?: string
  barcodeType?: string
  barcodeValue?: string
  qrUrl?: string
  /** Pack or shelf photo (uploaded URL, typically https or localhost http in dev) */
  imageUrl?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface OrderItem {
  id: string
  productId: string
  productName: string
  quantity: number
  price: number
}

export interface Order {
  id: string
  items: OrderItem[]
  status: 'pending' | 'preparing' | 'served' | 'completed' | 'cancelled'
  total: number
  businessId: string
  tableId?: string
  customerId?: string
  createdAt: string
}

export interface Payment {
  id: string
  orderId: string
  amount: number
  status: 'pending' | 'completed' | 'failed'
  reference: string
  method: 'qr_wallet' | 'cash'
  businessId: string
  createdAt: string
  /** Present for API-backed payments (e.g. simulator). */
  provider?: string
  currency?: string
  completedAt?: string | null
}

export interface CartItem {
  product: Product
  quantity: number
}

export interface DashboardStats {
  totalSales: number
  totalOrders: number
  totalProducts: number
  lowStockCount: number
}

export interface CashAccountBalance {
  id: string
  businessId: string
  name: string
  type: 'bank' | 'merchant'
  balance: number
  lastUpdatedAt: string
}

export interface ProfitLossSnapshot {
  businessId: string
  totalIncome: number
  costOfSales: number
  grossProfit: number
  operatingExpenses: number
  netProfit: number
}

export interface ProfitLossTrendPoint {
  businessId: string
  period: string
  income: number
  expenses: number
}

export interface ChartOfAccountEntry {
  id: string
  businessId: string
  code: string
  name: string
  category: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'
  balance: number
  profitLossGroup?: 'income' | 'cost_of_goods_sold' | 'operating_expense'
}

export interface AccountingTransaction {
  id: string
  businessId: string
  type: 'receive' | 'send' | 'transfer'
  amount: number
  fromAccountId?: string
  toAccountId?: string
  reference: string
  description: string
  createdAt: string
}
