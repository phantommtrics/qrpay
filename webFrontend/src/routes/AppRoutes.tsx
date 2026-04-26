import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { APP_PATHS, MAIN_NAV_ITEMS, getDefaultProtectedPath } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import type { PermissionKey, UserRole } from '../types'
import { AuthOnlyRoute } from './AuthOnlyRoute'
import { ProtectedRoute } from './ProtectedRoute'

const LandingPage = lazy(() =>
  import('../screens/LandingPage').then((module) => ({
    default: module.LandingPage,
  })),
)
const AboutEasyPayPage = lazy(() =>
  import('../screens/AboutEasyPayPage').then((module) => ({
    default: module.AboutEasyPayPage,
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
const ForgotPasswordPage = lazy(() =>
  import('../screens/ForgotPasswordPage').then((module) => ({
    default: module.ForgotPasswordPage,
  })),
)
const RestaurantGuestMenuPage = lazy(() =>
  import('../screens/RestaurantGuestMenuPage').then((module) => ({
    default: module.RestaurantGuestMenuPage,
  })),
)
const RestaurantSetupPage = lazy(() =>
  import('../screens/RestaurantSetupPage').then((module) => ({
    default: module.RestaurantSetupPage,
  })),
)
const RestaurantTablesPage = lazy(() =>
  import('../screens/RestaurantTablesPage').then((module) => ({
    default: module.RestaurantTablesPage,
  })),
)
const RestaurantMenuSetupPage = lazy(() =>
  import('../screens/RestaurantMenuSetupPage').then((module) => ({
    default: module.RestaurantMenuSetupPage,
  })),
)
const RestaurantManualMenuPage = lazy(() =>
  import('../screens/RestaurantManualMenuPage').then((module) => ({
    default: module.RestaurantManualMenuPage,
  })),
)
const PetrolStationsPage = lazy(() =>
  import('../screens/PetrolStationsPage').then((module) => ({
    default: module.PetrolStationsPage,
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
const ProductCatalogCategoriesPage = lazy(() =>
  import('../screens/ProductCatalogCategoriesPage').then((module) => ({
    default: module.ProductCatalogCategoriesPage,
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
const ActivityLogPage = lazy(() =>
  import('../screens/ActivityLogPage').then((module) => ({
    default: module.ActivityLogPage,
  })),
)
const ReportsPage = lazy(() =>
  import('../screens/ReportsPage').then((module) => ({
    default: module.ReportsPage,
  })),
)
const SubscriptionBillingActivityPage = lazy(() =>
  import('../screens/SubscriptionBillingActivityPage').then((module) => ({
    default: module.SubscriptionBillingActivityPage,
  })),
)
const PlatformBillingTransactionsPage = lazy(() =>
  import('../screens/platform/PlatformBillingTransactionsPage').then((module) => ({
    default: module.PlatformBillingTransactionsPage,
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
const AccountingJournalsPage = lazy(() =>
  import('../screens/AccountingJournalsPage').then((module) => ({
    default: module.AccountingJournalsPage,
  })),
)
const AccountingGeneralJournalPage = lazy(() =>
  import('../screens/AccountingGeneralJournalPage').then((module) => ({
    default: module.AccountingGeneralJournalPage,
  })),
)
const SalesQuotationsPage = lazy(() =>
  import('../screens/SalesQuotationsPage').then((module) => ({
    default: module.SalesQuotationsPage,
  })),
)
const SalesInvoicesPage = lazy(() =>
  import('../screens/SalesInvoicesPage').then((module) => ({
    default: module.SalesInvoicesPage,
  })),
)
const SalesQuotationDetailPage = lazy(() =>
  import('../screens/SalesQuotationDetailPage').then((module) => ({
    default: module.SalesQuotationDetailPage,
  })),
)
const SalesInvoiceDetailPage = lazy(() =>
  import('../screens/SalesInvoiceDetailPage').then((module) => ({
    default: module.SalesInvoiceDetailPage,
  })),
)
const AccountingReversedJournalPage = lazy(() =>
  import('../screens/AccountingReversedJournalPage').then((module) => ({
    default: module.AccountingReversedJournalPage,
  })),
)
const AccountingReversedJournalDetailPage = lazy(() =>
  import('../screens/AccountingReversedJournalDetailPage').then((module) => ({
    default: module.AccountingReversedJournalDetailPage,
  })),
)
const TransactionJournalPage = lazy(() =>
  import('../screens/TransactionJournalPage').then((module) => ({
    default: module.TransactionJournalPage,
  })),
)
const TransactionJournalDetailPage = lazy(() =>
  import('../screens/TransactionJournalDetailPage').then((module) => ({
    default: module.TransactionJournalDetailPage,
  })),
)
const BillsPage = lazy(() =>
  import('../screens/BillsPage').then((module) => ({
    default: module.BillsPage,
  })),
)
const BillDetailPage = lazy(() =>
  import('../screens/BillDetailPage').then((module) => ({
    default: module.BillDetailPage,
  })),
)
const ContactsPage = lazy(() =>
  import('../screens/ContactsPage').then((module) => ({
    default: module.ContactsPage,
  })),
)
const GlBalanceReportPage = lazy(() =>
  import('../screens/GlBalanceReportPage').then((module) => ({
    default: module.GlBalanceReportPage,
  })),
)
const ProfitLossReportPage = lazy(() =>
  import('../screens/ProfitLossReportPage').then((module) => ({
    default: module.ProfitLossReportPage,
  })),
)
const BalanceSheetReportPage = lazy(() =>
  import('../screens/BalanceSheetReportPage').then((module) => ({
    default: module.BalanceSheetReportPage,
  })),
)
const AccountStatementReportPage = lazy(() =>
  import('../screens/AccountStatementReportPage').then((module) => ({
    default: module.AccountStatementReportPage,
  })),
)
const StaffPage = lazy(() =>
  import('../screens/StaffPage').then((module) => ({
    default: module.StaffPage,
  })),
)
const StaffAccessStatusPage = lazy(() =>
  import('../screens/StaffAccessStatusPage').then((module) => ({
    default: module.StaffAccessStatusPage,
  })),
)
const BusinessesPage = lazy(() =>
  import('../screens/BusinessesPage').then((module) => ({
    default: module.BusinessesPage,
  })),
)
const PlanControlsPage = lazy(() =>
  import('../screens/PlanControlsPage').then((module) => ({
    default: module.PlanControlsPage,
  })),
)
const SystemConfigurationPage = lazy(() =>
  import('../screens/SystemConfigurationPage').then((module) => ({
    default: module.SystemConfigurationPage,
  })),
)
const PlatformBusinessesPage = lazy(() =>
  import('../screens/platform/PlatformBusinessesPage').then((module) => ({
    default: module.PlatformBusinessesPage,
  })),
)
const PlatformBusinessDetailPage = lazy(() =>
  import('../screens/platform/PlatformBusinessDetailPage').then((module) => ({
    default: module.PlatformBusinessDetailPage,
  })),
)
const PlatformBillingsPage = lazy(() =>
  import('../screens/platform/PlatformBillingsPage').then((module) => ({
    default: module.PlatformBillingsPage,
  })),
)
const PlatformCorporateBusinessesPage = lazy(() =>
  import('../screens/platform/PlatformCorporateBusinessesPage').then((module) => ({
    default: module.PlatformCorporateBusinessesPage,
  })),
)
const PlatformCorporateBillingsPage = lazy(() =>
  import('../screens/platform/PlatformCorporateBillingsPage').then((module) => ({
    default: module.PlatformCorporateBillingsPage,
  })),
)
const PlatformCorporateInvitationLetterPage = lazy(() =>
  import('../screens/platform/PlatformCorporateInvitationLetterPage').then((module) => ({
    default: module.PlatformCorporateInvitationLetterPage,
  })),
)
const PlatformCorporateInvitationRecordsPage = lazy(() =>
  import('../screens/platform/PlatformCorporateInvitationRecordsPage').then((module) => ({
    default: module.PlatformCorporateInvitationRecordsPage,
  })),
)
const PlatformSubscriptionsPage = lazy(() =>
  import('../screens/platform/PlatformSubscriptionsPage').then((module) => ({
    default: module.PlatformSubscriptionsPage,
  })),
)
const PlatformInvoicesPage = lazy(() =>
  import('../screens/platform/PlatformInvoicesPage').then((module) => ({
    default: module.PlatformInvoicesPage,
  })),
)
const PlatformInvoiceDetailPage = lazy(() =>
  import('../screens/platform/PlatformInvoiceDetailPage').then((module) => ({
    default: module.PlatformInvoiceDetailPage,
  })),
)
const PlatformBillingReviewPage = lazy(() =>
  import('../screens/platform/PlatformBillingReviewPage').then((module) => ({
    default: module.PlatformBillingReviewPage,
  })),
)
const BusinessConfigurationPage = lazy(() =>
  import('../screens/BusinessConfigurationPage').then((module) => ({
    default: module.BusinessConfigurationPage,
  })),
)
const ChangePasswordPage = lazy(() =>
  import('../screens/ChangePasswordPage').then((module) => ({
    default: module.ChangePasswordPage,
  })),
)
const ProductPublicPage = lazy(() =>
  import('../screens/ProductPublicPage').then((module) => ({
    default: module.ProductPublicPage,
  })),
)
const PublicPayPage = lazy(() =>
  import('../screens/PublicPayPage').then((module) => ({
    default: module.PublicPayPage,
  })),
)
const GuestQuotationPage = lazy(() =>
  import('../screens/GuestQuotationPage').then((module) => ({
    default: module.GuestQuotationPage,
  })),
)
const GuestInvoicePage = lazy(() =>
  import('../screens/GuestInvoicePage').then((module) => ({
    default: module.GuestInvoicePage,
  })),
)
const PlatformSecurityRolesPage = lazy(() =>
  import('../screens/platform/PlatformSecurityRolesPage').then((module) => ({
    default: module.PlatformSecurityRolesPage,
  })),
)
const PlatformSecurityFunctionGroupsPage = lazy(() =>
  import('../screens/platform/PlatformSecurityFunctionGroupsPage').then((module) => ({
    default: module.PlatformSecurityFunctionGroupsPage,
  })),
)
const PlatformSecuritySystemUsersPage = lazy(() =>
  import('../screens/platform/PlatformSecuritySystemUsersPage').then((module) => ({
    default: module.PlatformSecuritySystemUsersPage,
  })),
)
const PlatformSecurityMoveUsersPage = lazy(() =>
  import('../screens/platform/PlatformSecurityMoveUsersPage').then((module) => ({
    default: module.PlatformSecurityMoveUsersPage,
  })),
)
const PlatformPaymentGatewaysPage = lazy(() =>
  import('../screens/platform/PlatformPaymentGatewaysPage').then((module) => ({
    default: module.PlatformPaymentGatewaysPage,
  })),
)
const PlatformAccountingHomePage = lazy(() =>
  import('../screens/platform/PlatformAccountingHomePage').then((module) => ({
    default: module.PlatformAccountingHomePage,
  })),
)
const PlatformAccountingChartPage = lazy(() =>
  import('../screens/platform/PlatformAccountingChartPage').then((module) => ({
    default: module.PlatformAccountingChartPage,
  })),
)
const PlatformAccountingJournalsPage = lazy(() =>
  import('../screens/platform/PlatformAccountingJournalsPage').then((module) => ({
    default: module.PlatformAccountingJournalsPage,
  })),
)
const PlatformOperatorJournalsPage = lazy(() =>
  import('../screens/platform/PlatformOperatorJournalsPage').then((module) => ({
    default: module.PlatformOperatorJournalsPage,
  })),
)
const PlatformAccountingGlPage = lazy(() =>
  import('../screens/platform/PlatformAccountingGlPage').then((module) => ({
    default: module.PlatformAccountingGlPage,
  })),
)
const PlatformAccountingPnlPage = lazy(() =>
  import('../screens/platform/PlatformAccountingPnlPage').then((module) => ({
    default: module.PlatformAccountingPnlPage,
  })),
)
const PlatformAccountingStatementPage = lazy(() =>
  import('../screens/platform/PlatformAccountingStatementPage').then((module) => ({
    default: module.PlatformAccountingStatementPage,
  })),
)
const PlatformMerchantJournalEntriesPage = lazy(() =>
  import('../screens/platform/PlatformMerchantJournalEntriesPage').then((module) => ({
    default: module.PlatformMerchantJournalEntriesPage,
  })),
)
const PlatformOperatorMerchantJournalEntriesPage = lazy(() =>
  import('../screens/platform/PlatformOperatorMerchantJournalEntriesPage').then((module) => ({
    default: module.PlatformOperatorMerchantJournalEntriesPage,
  })),
)
const PlatformMerchantJournalEntryDetailPage = lazy(() =>
  import('../screens/platform/PlatformMerchantJournalEntryDetailPage').then((module) => ({
    default: module.PlatformMerchantJournalEntryDetailPage,
  })),
)
const PlatformBillsPage = lazy(() =>
  import('../screens/PlatformBillsPage').then((module) => ({ default: module.PlatformBillsPage })),
)
const PlatformBillNewPage = lazy(() =>
  import('../screens/PlatformBillNewPage').then((module) => ({ default: module.PlatformBillNewPage })),
)
const PlatformBillDetailPage = lazy(() =>
  import('../screens/PlatformBillDetailPage').then((module) => ({
    default: module.PlatformBillDetailPage,
  })),
)
const PlatformActivityLogPage = lazy(() =>
  import('../screens/PlatformActivityLogPage').then((module) => ({
    default: module.PlatformActivityLogPage,
  })),
)
const GuestSubscriptionInvoicePage = lazy(() =>
  import('../screens/GuestSubscriptionInvoicePage').then((module) => ({
    default: module.GuestSubscriptionInvoicePage,
  })),
)
const GuestPlatformBillPage = lazy(() =>
  import('../screens/GuestPlatformBillPage').then((module) => ({
    default: module.GuestPlatformBillPage,
  })),
)
const BillingPage = lazy(() =>
  import('../screens/BillingPage').then((module) => ({
    default: module.BillingPage,
  })),
)
const BillingWaveSuccessPage = lazy(() =>
  import('../screens/BillingWaveResultPage').then((module) => ({
    default: module.BillingWaveSuccessPage,
  })),
)
const BillingWaveCancelPage = lazy(() =>
  import('../screens/BillingWaveResultPage').then((module) => ({
    default: module.BillingWaveCancelPage,
  })),
)
const SubscriptionInvoicesPage = lazy(() =>
  import('../screens/SubscriptionInvoicesPage').then((module) => ({
    default: module.SubscriptionInvoicesPage,
  })),
)
const SubscriptionInvoiceDetailPage = lazy(() =>
  import('../screens/SubscriptionInvoiceDetailPage').then((module) => ({
    default: module.SubscriptionInvoiceDetailPage,
  })),
)
const MerchantApiPage = lazy(() =>
  import('../screens/MerchantApiPage').then((module) => ({
    default: module.MerchantApiPage,
  })),
)

const PLATFORM_OPERATOR_ROLES = ['platform_owner', 'platform_admin'] as UserRole[]
const BUSINESS_BILLING_ROLES = ['admin', 'merchant'] as UserRole[]

export function AppRoutes() {
  const { user } = useAuth()
  const authRedirectPath = user
    ? user.mustChangePassword
      ? APP_PATHS.changePassword
      : getDefaultProtectedPath(user.role)
    : null
  const protectedRoutes = [
    {
      path: APP_PATHS.dashboard,
      element: <DashboardPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.dashboard)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.dashboard)!.permission,
    },
    {
      path: APP_PATHS.platformBusinesses,
      element: <PlatformBusinessesPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.businesses.manage' as const,
    },
    {
      path: APP_PATHS.platformBusinessDetail,
      element: <PlatformBusinessDetailPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.businesses.manage' as const,
    },
    {
      path: APP_PATHS.platformBillings,
      element: <PlatformBillingsPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.billing.manage' as const,
    },
    {
      path: APP_PATHS.platformCorporateBusinesses,
      element: <PlatformCorporateBusinessesPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.businesses.manage' as const,
    },
    {
      path: APP_PATHS.platformCorporateBills,
      element: <PlatformCorporateBillingsPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.billing.manage' as const,
    },
    {
      path: APP_PATHS.platformCorporateInvitationLetter,
      element: <PlatformCorporateInvitationLetterPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.billing.manage' as const,
    },
    {
      path: APP_PATHS.platformCorporateInvitationRecords,
      element: <PlatformCorporateInvitationRecordsPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.billing.manage' as const,
    },
    {
      path: APP_PATHS.platformSubscriptions,
      element: <PlatformSubscriptionsPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.subscriptions.view' as const,
    },
    {
      path: APP_PATHS.platformInvoices,
      element: <PlatformInvoicesPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.invoices.view' as const,
    },
    {
      path: APP_PATHS.platformInvoiceDetail,
      element: <PlatformInvoiceDetailPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.invoices.view' as const,
    },
    {
      path: APP_PATHS.platformBillingReview,
      element: <PlatformBillingReviewPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.billing_review.view' as const,
    },
    {
      path: APP_PATHS.platformPaymentGateways,
      element: <PlatformPaymentGatewaysPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.payment_gateways.manage' as const,
    },
    {
      path: APP_PATHS.platformAccounting,
      element: <PlatformAccountingHomePage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.accounting.view' as const,
    },
    {
      path: APP_PATHS.platformAccountingChart,
      element: <PlatformAccountingChartPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.accounting.chart.view' as const,
    },
    {
      path: APP_PATHS.platformAccountingJournals,
      element: <PlatformAccountingJournalsPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      anyOfPermissions: [
        'platform.accounting.view',
        'platform.accounting.journals.access',
      ] satisfies PermissionKey[],
    },
    {
      path: APP_PATHS.platformAccountingOperatorJournals,
      element: <PlatformOperatorJournalsPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      anyOfPermissions: [
        'platform.accounting.view',
        'platform.accounting.journals.access',
      ] satisfies PermissionKey[],
    },
    {
      path: APP_PATHS.platformAccountingReportGl,
      element: <PlatformAccountingGlPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.accounting.reports.gl' as const,
    },
    {
      path: APP_PATHS.platformAccountingReportPnl,
      element: <PlatformAccountingPnlPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.accounting.reports.pnl' as const,
    },
    {
      path: APP_PATHS.platformAccountingReportStatement,
      element: <PlatformAccountingStatementPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.accounting.reports.statement' as const,
    },
    {
      path: APP_PATHS.platformAccountingMerchantJournalEntries,
      element: <PlatformMerchantJournalEntriesPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.accounting.transaction_journal' as const,
    },
    {
      path: APP_PATHS.platformAccountingOperatorMerchantJournals,
      element: <PlatformOperatorMerchantJournalEntriesPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      anyOfPermissions: [
        'platform.accounting.view',
        'platform.accounting.journals.access',
      ] satisfies PermissionKey[],
    },
    {
      path: APP_PATHS.platformAccountingMerchantJournalEntryDetail,
      element: <PlatformMerchantJournalEntryDetailPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.accounting.transaction_journal' as const,
    },
    {
      path: APP_PATHS.platformBills,
      element: <PlatformBillsPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.bills.view' as const,
    },
    {
      path: APP_PATHS.platformBillNew,
      element: <PlatformBillNewPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.bills.manage' as const,
    },
    {
      path: APP_PATHS.platformBillDetail,
      element: <PlatformBillDetailPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.bills.view' as const,
    },
    {
      path: APP_PATHS.platformActivityLog,
      element: <PlatformActivityLogPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.activity.log' as const,
    },
    {
      path: APP_PATHS.billing,
      element: <BillingPage />,
      roles: BUSINESS_BILLING_ROLES,
      permission: 'subscriptions.billings' as const,
    },
    {
      path: APP_PATHS.billingWaveSuccess,
      element: <BillingWaveSuccessPage />,
      roles: BUSINESS_BILLING_ROLES,
      permission: 'subscriptions.billings' as const,
    },
    {
      path: APP_PATHS.billingWaveCancel,
      element: <BillingWaveCancelPage />,
      roles: BUSINESS_BILLING_ROLES,
      permission: 'subscriptions.billings' as const,
    },
    {
      path: APP_PATHS.subscriptionsInvoices,
      element: <SubscriptionInvoicesPage />,
      roles: BUSINESS_BILLING_ROLES,
      permission: 'subscriptions.invoices' as const,
    },
    {
      path: APP_PATHS.subscriptionsInvoiceDetail,
      element: <SubscriptionInvoiceDetailPage />,
      roles: BUSINESS_BILLING_ROLES,
      permission: 'subscriptions.invoices' as const,
    },
    {
      path: APP_PATHS.products,
      element: <ProductsPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.products)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.products)!.permission,
    },
    {
      path: APP_PATHS.catalogCategories,
      element: <ProductCatalogCategoriesPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.products)!.roles,
      permission: 'products.categories' as const,
    },
    {
      path: APP_PATHS.restaurantSetup,
      element: <RestaurantSetupPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.products)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.products)!.permission,
    },
    {
      path: APP_PATHS.restaurantTables,
      element: <RestaurantTablesPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.products)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.products)!.permission,
    },
    {
      path: APP_PATHS.restaurantMenuSetup,
      element: <RestaurantMenuSetupPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.products)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.products)!.permission,
    },
    {
      path: APP_PATHS.restaurantManualMenu,
      element: <RestaurantManualMenuPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.products)!.roles,
      requiredAllPermissions: ['products.view', 'products.barcode'] satisfies PermissionKey[],
    },
    {
      path: APP_PATHS.petrolStations,
      element: <PetrolStationsPage />,
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
      /** Match API: list orders allowed with orders.view or pos.access */
      anyOfPermissions: ['orders.view', 'pos.access'] satisfies PermissionKey[],
    },
    {
      path: APP_PATHS.payments,
      element: <PaymentsPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.payments)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.payments)!.permission,
    },
    {
      path: APP_PATHS.activityLog,
      element: <ActivityLogPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.activityLog)!.roles,
      anyOfPermissions: ['activity.log', 'platform.activity.log'] satisfies PermissionKey[],
    },
    {
      path: APP_PATHS.reports,
      element: <ReportsPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.reports)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.reports)!.permission,
    },
    {
      path: APP_PATHS.subscriptionsBillingActivity,
      element: <SubscriptionBillingActivityPage />,
      roles: BUSINESS_BILLING_ROLES,
      permission: 'subscriptions.billing_activity' as const,
    },
    {
      path: APP_PATHS.platformBillingTransactions,
      element: <PlatformBillingTransactionsPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      anyOfPermissions: [
        'platform.billing_transactions.view',
        'platform.invoices.view',
      ] satisfies PermissionKey[],
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
      path: APP_PATHS.accountingJournals,
      element: <AccountingJournalsPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'accounting.view' as const,
    },
    {
      path: APP_PATHS.accountingGeneralJournal,
      element: <AccountingGeneralJournalPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'accounting.journals.general' as const,
    },
    {
      path: APP_PATHS.accountingJournalsReversed,
      element: <AccountingReversedJournalPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'accounting.journals.reversal' as const,
    },
    {
      path: APP_PATHS.accountingReversedJournalDetail,
      element: <AccountingReversedJournalDetailPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'accounting.journals.reversal' as const,
    },
    {
      path: APP_PATHS.salesQuotations,
      element: <SalesQuotationsPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'sales.quotation' as const,
    },
    {
      path: APP_PATHS.salesInvoices,
      element: <SalesInvoicesPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'sales.invoice' as const,
    },
    {
      path: APP_PATHS.salesBills,
      element: <BillsPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'sales.bill' as const,
    },
    {
      path: APP_PATHS.salesQuotationDetail,
      element: <SalesQuotationDetailPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'sales.quotation' as const,
    },
    {
      path: APP_PATHS.salesInvoiceDetail,
      element: <SalesInvoiceDetailPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'sales.invoice' as const,
    },
    {
      path: APP_PATHS.salesBillDetail,
      element: <BillDetailPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'sales.bill' as const,
    },
    {
      path: APP_PATHS.accountingReportGlBalance,
      element: <GlBalanceReportPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'accounting.reports.gl' as const,
    },
    {
      path: APP_PATHS.accountingReportProfitLoss,
      element: <ProfitLossReportPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'accounting.reports.pnl' as const,
    },
    {
      path: APP_PATHS.accountingReportBalanceSheet,
      element: <BalanceSheetReportPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'accounting.reports.balance_sheet' as const,
    },
    {
      path: APP_PATHS.accountingReportAccountStatement,
      element: <AccountStatementReportPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'accounting.reports.statement' as const,
    },
    {
      path: APP_PATHS.accountingTransactionJournal,
      element: <TransactionJournalPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'accounting.transaction_journal' as const,
    },
    {
      path: APP_PATHS.accountingTransactionJournalDetail,
      element: <TransactionJournalDetailPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.accounting)!.roles,
      permission: 'accounting.transaction_journal' as const,
    },
    {
      path: APP_PATHS.businesses,
      element: <BusinessesPage />,
      roles: ['admin', 'merchant'] as UserRole[],
      permission: 'organization.manage' as const,
    },
    {
      path: APP_PATHS.contacts,
      element: <ContactsPage />,
      roles: ['admin', 'merchant'] as UserRole[],
      permission: 'contacts.manage' as const,
    },
    {
      path: APP_PATHS.staff,
      element: <StaffPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.staff)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.staff)!.permission,
    },
    {
      path: APP_PATHS.staffStatus,
      element: <StaffAccessStatusPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.staffStatus)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.staffStatus)!.permission,
    },
    {
      path: APP_PATHS.subscriptions,
      element: <PlanControlsPage />,
      roles: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.subscriptions)!.roles,
      permission: MAIN_NAV_ITEMS.find((item) => item.path === APP_PATHS.subscriptions)!.permission,
    },
    {
      path: APP_PATHS.platformSystemConfiguration,
      element: <SystemConfigurationPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.system.view' as const,
    },
    {
      path: APP_PATHS.platformSecurityRoles,
      element: <PlatformSecurityRolesPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.security.roles.view' as const,
    },
    {
      path: APP_PATHS.platformSecurityFunctionGroups,
      element: <PlatformSecurityFunctionGroupsPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.security.function_groups.view' as const,
    },
    {
      path: APP_PATHS.platformSecuritySystemUsers,
      element: <PlatformSecuritySystemUsersPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      permission: 'platform.security.users.view' as const,
    },
    {
      path: APP_PATHS.platformSecurityMoveUsers,
      element: <PlatformSecurityMoveUsersPage />,
      roles: PLATFORM_OPERATOR_ROLES,
      anyOfPermissions: [
        'platform.security.move_users.view',
        'platform.security.users.view',
      ] satisfies PermissionKey[],
    },
    {
      path: APP_PATHS.configuration,
      element: <BusinessConfigurationPage />,
      roles: ['merchant', 'platform_owner'] as UserRole[],
      permission: 'business.configuration' as const,
    },
    {
      path: APP_PATHS.integrationsMerchantApi,
      element: <MerchantApiPage />,
      roles: ['admin', 'merchant', 'platform_owner'] as UserRole[],
      permission: 'merchant.api' as const,
    },
  ]

  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path={APP_PATHS.root} element={<LandingPage />} />
        <Route path={APP_PATHS.aboutEasypay} element={<AboutEasyPayPage />} />
        <Route
          path={APP_PATHS.login}
          element={
            user ? <Navigate to={authRedirectPath!} replace /> : <LoginPage />
          }
        />
        <Route
          path={APP_PATHS.signup}
          element={
            user ? <Navigate to={authRedirectPath!} replace /> : <SignupPage />
          }
        />
        <Route
          path={APP_PATHS.forgotPassword}
          element={
            user ? <Navigate to={authRedirectPath!} replace /> : <ForgotPasswordPage />
          }
        />
        <Route path={APP_PATHS.restaurantGuestMenu} element={<RestaurantGuestMenuPage />} />
        <Route path="/p/:productId" element={<ProductPublicPage />} />
        <Route path="/pay/:publicToken" element={<PublicPayPage />} />
        <Route path="/guest/quotation/:guestToken" element={<GuestQuotationPage />} />
        <Route path="/guest/invoice/:guestToken" element={<GuestInvoicePage />} />
        <Route path="/guest/platform-bill/:guestToken" element={<GuestPlatformBillPage />} />
        <Route
          path="/guest/subscription-invoice/:guestToken"
          element={<GuestSubscriptionInvoicePage />}
        />
        <Route
          path={APP_PATHS.changePassword}
          element={
            <AuthOnlyRoute>
              <ChangePasswordPage />
            </AuthOnlyRoute>
          }
        />
        {protectedRoutes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              <ProtectedRoute
                requiredPermission={'permission' in route ? route.permission : undefined}
                requiredAnyOfPermissions={
                  'anyOfPermissions' in route ? route.anyOfPermissions : undefined
                }
                requiredAllPermissions={
                  'requiredAllPermissions' in route ? route.requiredAllPermissions : undefined
                }
                allowedRoles={route.roles}
                requireBusinessOwner={
                  'requireBusinessOwner' in route
                    ? route.requireBusinessOwner === true
                    : undefined
                }
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
