import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { CustomerMenuPage } from '../screens/CustomerMenuPage'
import { DashboardPage } from '../screens/DashboardPage'
import { LoginPage } from '../screens/LoginPage'
import { OrdersPage } from '../screens/OrdersPage'
import { PaymentsPage } from '../screens/PaymentsPage'
import { POSPage } from '../screens/POSPage'
import { ProductsPage } from '../screens/ProductsPage'
import { ReportsPage } from '../screens/ReportsPage'
import type { User } from '../types'
import { ProtectedRoute } from './ProtectedRoute'

export function AppRoutes() {
  const [user, setUser] = useState<User | null>(null)

  return (
    <Routes>
      <Route
        path="/"
        element={
          user ? (
            <Navigate to={user.role === 'cashier' ? '/pos' : '/dashboard'} replace />
          ) : (
            <LoginPage onLogin={setUser} />
          )
        }
      />
      <Route path="/menu/:tableId" element={<CustomerMenuPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute user={user} onLogout={() => setUser(null)}>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/products"
        element={
          <ProtectedRoute user={user} onLogout={() => setUser(null)}>
            <ProductsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pos"
        element={
          <ProtectedRoute user={user} onLogout={() => setUser(null)}>
            <POSPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedRoute user={user} onLogout={() => setUser(null)}>
            <OrdersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments"
        element={
          <ProtectedRoute user={user} onLogout={() => setUser(null)}>
            <PaymentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute user={user} onLogout={() => setUser(null)}>
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
