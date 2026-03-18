import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { APP_PATHS, getDefaultProtectedPath } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { ProtectedRoute } from './ProtectedRoute'
import { RouteFallback } from './RouteFallback'

const LoginPage = lazy(() =>
  import('../screens/LoginPage').then((module) => ({
    default: module.LoginPage,
  })),
)
const CustomerMenuPage = lazy(() =>
  import('../screens/CustomerMenuPage').then((module) => ({
    default: module.CustomerMenuPage,
  })),
)
const DashboardPage = lazy(() =>
  import('../screens/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
)
const ProductsPage = lazy(() =>
  import('../screens/ProductsPage').then((module) => ({
    default: module.ProductsPage,
  })),
)
const POSPage = lazy(() =>
  import('../screens/POSPage').then((module) => ({
    default: module.POSPage,
  })),
)
const OrdersPage = lazy(() =>
  import('../screens/OrdersPage').then((module) => ({
    default: module.OrdersPage,
  })),
)
const PaymentsPage = lazy(() =>
  import('../screens/PaymentsPage').then((module) => ({
    default: module.PaymentsPage,
  })),
)
const ReportsPage = lazy(() =>
  import('../screens/ReportsPage').then((module) => ({
    default: module.ReportsPage,
  })),
)

export function AppRoutes() {
  const { user } = useAuth()
  const protectedRoutes = [
    { path: APP_PATHS.dashboard, element: <DashboardPage /> },
    { path: APP_PATHS.products, element: <ProductsPage /> },
    { path: APP_PATHS.pos, element: <POSPage /> },
    { path: APP_PATHS.orders, element: <OrdersPage /> },
    { path: APP_PATHS.payments, element: <PaymentsPage /> },
    { path: APP_PATHS.reports, element: <ReportsPage /> },
  ]

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route
          path={APP_PATHS.root}
          element={
            user ? (
              <Navigate to={getDefaultProtectedPath(user.role)} replace />
            ) : (
              <LoginPage />
            )
          }
        />
        <Route path={APP_PATHS.customerMenu} element={<CustomerMenuPage />} />
        {protectedRoutes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              <ProtectedRoute>
                {route.element}
              </ProtectedRoute>
            }
          />
        ))}
        <Route path="*" element={<Navigate to={APP_PATHS.root} replace />} />
      </Routes>
    </Suspense>
  )
}
