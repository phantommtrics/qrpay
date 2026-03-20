export type UserRole = 'admin' | 'merchant' | 'cashier' | 'customer'

export type PlanId = 'basic' | 'pro' | 'business_pro'

export type SubscriptionStatus = 'active' | 'expiring_soon' | 'expired'

export type PermissionKey =
  | 'dashboard.view'
  | 'pos.view'
  | 'products.view'
  | 'products.create'
  | 'products.edit'
  | 'products.delete'
  | 'orders.view'
  | 'payments.view'
  | 'payments.export'
  | 'reports.view'
  | 'reports.export'
  | 'accounting.view'
  | 'accounting.chart.view'
  | 'staff.manage'
  | 'organization.manage'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  businessId?: string
  organizationId?: string
  isPlatformOwner?: boolean
}

export interface SubscriptionPlan {
  id: PlanId
  name: string
  priceLabel: string
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
  createdAt: string
}

export interface LoginAccount {
  id: string
  email: string
  password: string
  name: string
  role: UserRole
  organizationId?: string
  isPlatformOwner?: boolean
}

export interface PermissionDefinition {
  key: PermissionKey
  label: string
  description: string
  category: 'Views' | 'Actions' | 'Reports' | 'Administration'
}

export type PlanPermissions = Record<PlanId, Record<PermissionKey, boolean>>

export interface Product {
  id: string
  name: string
  price: number
  category: string
  stock: number
  imageColor: string
  imageEmoji: string
  businessId: string
  description?: string
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
