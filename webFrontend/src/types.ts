export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'merchant' | 'cashier' | 'customer'
  businessId?: string
}

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
