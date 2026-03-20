import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { APP_PATHS, MAIN_NAV_ITEMS, getDefaultProtectedPath } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { ProtectedRoute } from './ProtectedRoute'
import { RouteFallback } from './RouteFallback'

const LandingPage = lazy(() =>
  import('../screens/LandingPage').then((module) => ({
    default: module.LandingPage,
  })),
)
const LoginPage = lazy(() =>
  import('../screens/LoginPage').then((module) => ({
    default: module.LoginPage,
  })),
)
const SignupPage = lazy(() =>
  import('../screens/SignupPage').then((module) => ({
    default: module.SignupPage,
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
const AccountingPage = lazy(() =>
  import('../screens/AccountingPage').then((module) => ({
    default: module.AccountingPage,
  })),
)
const AccountingBalancesPage = lazy(() =>
  import('../screens/AccountingBalancesPage').then((module) => ({
    default: module.AccountingBalancesPage,
  })),
)
const AccountingProfitLossPage = lazy(() =>
  import('../screens/AccountingProfitLossPage').then((module) => ({
    default: module.AccountingProfitLossPage,
  })),
)
const AccountingChartAccountsPage = lazy(() =>
  import('../screens/AccountingChartAccountsPage').then((module) => ({
    default: module.AccountingChartAccountsPage,
  })),
)
const StaffPage = lazy(() =>
  import('../screens/StaffPage').then((module) => ({
    default: module.StaffPage,
  })),
)
const PlanControlsPage = lazy(() =>
  import('../screens/PlanControlsPage').then((module) => ({
    default: module.PlanControlsPage,
  })),
)

export function AppRoutes() {
  const { user } = useAuth()
  const protectedRoutes = [
    {
      path: APP_PATHS.dashboard,
      element: <DashboardPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.dashboard)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.dashboard)!.permission,
    },
    {
      path: APP_PATHS.products,
      element: <ProductsPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.products)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.products)!.permission,
    },
    {
      path: APP_PATHS.pos,
      element: <POSPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.pos)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.pos)!.permission,
    },
    {
      path: APP_PATHS.orders,
      element: <OrdersPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.orders)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.orders)!.permission,
    },
    {
      path: APP_PATHS.payments,
      element: <PaymentsPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.payments)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.payments)!.permission,
    },
    {
      path: APP_PATHS.reports,
      element: <ReportsPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.reports)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.reports)!.permission,
    },
    {
      path: APP_PATHS.accounting,
      element: <AccountingPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.permission,
    },
    {
      path: APP_PATHS.accountingBalances,
      element: <AccountingBalancesPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'accounting.view' as const,
    },
    {
      path: APP_PATHS.accountingProfitLoss,
      element: <AccountingProfitLossPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'accounting.view' as const,
    },
    {
      path: APP_PATHS.accountingChart,
      element: <AccountingChartAccountsPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'accounting.chart.view' as const,
    },
    {
      path: APP_PATHS.staff,
      element: <StaffPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.staff)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.staff)!.permission,
    },
    {
      path: APP_PATHS.subscriptions,
      element: <PlanControlsPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.subscriptions)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.subscriptions)!.permission,
    },
  ]

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path={APP_PATHS.root} element={<LandingPage />} />
        <Route
          path={APP_PATHS.login}
          element={
            user ? <Navigate to={getDefaultProtectedPath(user.role)} replace /> : <LoginPage />
          }
        />
        <Route
          path={APP_PATHS.signup}
          element={
            user ? <Navigate to={getDefaultProtectedPath(user.role)} replace /> : <SignupPage />
          }
        />
        <Route path={APP_PATHS.customerMenu} element={<CustomerMenuPage />} />
        {protectedRoutes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              <ProtectedRoute
                requiredPermission={route.permission}
                allowedRoles={route.roles}
              >
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
