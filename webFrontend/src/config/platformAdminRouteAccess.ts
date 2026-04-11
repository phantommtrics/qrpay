import type { PermissionKey } from '../types'

export type PlatformAccessAction = 'view' | 'create' | 'edit' | 'delete' | 'export'

/** Maps legacy route PermissionKey to platform RBAC module + action (platform admins only). */
export const PLATFORM_ADMIN_ROUTE_ACCESS: Partial<
  Record<PermissionKey, { module: string; action: PlatformAccessAction }>
> = {
  'dashboard.view': { module: 'platform.dashboard', action: 'view' },
  'payments.view': { module: 'platform.payments', action: 'view' },
  'reports.view': { module: 'platform.reports', action: 'view' },
  'organization.manage': { module: 'platform.plan_controls', action: 'view' },
  'platform.businesses.manage': { module: 'platform.businesses', action: 'view' },
  'platform.businesses.merchant_api.view': {
    module: 'platform.businesses.merchant_api',
    action: 'view',
  },
  'platform.businesses.merchant_api.edit': {
    module: 'platform.businesses.merchant_api',
    action: 'edit',
  },
  'platform.subscriptions.view': { module: 'platform.subscriptions', action: 'view' },
  'platform.invoices.view': { module: 'platform.invoices', action: 'view' },
  'platform.invoices.export': { module: 'platform.invoices', action: 'export' },
  'platform.billing_transactions.view': { module: 'platform.billing_transactions', action: 'view' },
  'platform.billing_transactions.export': { module: 'platform.billing_transactions', action: 'export' },
  'platform.billing_review.view': { module: 'platform.billing_review', action: 'view' },
  'platform.billing_review.edit': { module: 'platform.billing_review', action: 'edit' },
  'platform.system.view': { module: 'platform.system_configuration', action: 'view' },
  'platform.security.roles.view': { module: 'platform.security_roles', action: 'view' },
  'platform.security.function_groups.view': {
    module: 'platform.security_function_groups',
    action: 'view',
  },
  'platform.security.users.view': { module: 'platform.security_system_users', action: 'view' },
  'platform.security.move_users.view': { module: 'platform.security_move_users', action: 'view' },
  'platform.users.manage': { module: 'platform.security_system_users', action: 'view' },
  'platform.billing.manage': { module: 'platform.billing', action: 'edit' },
  'platform.payment_gateways.manage': { module: 'platform.payment_gateways', action: 'view' },
  'platform.accounting.view': { module: 'platform.accounting', action: 'view' },
  'platform.accounting.create': { module: 'platform.accounting', action: 'create' },
}
