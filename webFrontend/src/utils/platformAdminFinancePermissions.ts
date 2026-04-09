import type { PermissionKey, PlatformPermissionMatrix } from '../types'

/**
 * Granular Finance permissions for platform admins. Templates that only grant legacy
 * `platform.accounting` (view / export) still behave as full finance access.
 * Returns `null` if this helper does not apply to the permission key.
 */
export function platformAdminFinancePermission(
  permission: PermissionKey,
  m: PlatformPermissionMatrix | undefined,
): boolean | null {
  const keys: PermissionKey[] = [
    'platform.accounting.chart.view',
    'platform.accounting.chart.manage',
    'platform.accounting.reports.gl',
    'platform.accounting.reports.pnl',
    'platform.accounting.reports.statement',
    'platform.accounting.transaction_journal',
    'platform.accounting.transaction_journal.approve',
    'platform.accounting.export',
  ]
  if (!keys.includes(permission)) {
    return null
  }
  if (!m) {
    return false
  }
  const legacyView = Boolean(m['platform.accounting']?.view)
  const legacyCreate = Boolean(m['platform.accounting']?.create)
  const legacyExport = Boolean(m['platform.accounting']?.export)
  switch (permission) {
    case 'platform.accounting.chart.view':
      return Boolean(m['platform.accounting.chart']?.view || legacyView)
    case 'platform.accounting.chart.manage':
      return Boolean(
        m['platform.accounting.chart']?.create ||
          m['platform.accounting.chart']?.edit ||
          m['platform.accounting.chart']?.delete ||
          legacyView,
      )
    case 'platform.accounting.reports.gl':
      return Boolean(m['platform.accounting.reports_gl']?.view || legacyView)
    case 'platform.accounting.reports.pnl':
      return Boolean(m['platform.accounting.reports_pnl']?.view || legacyView)
    case 'platform.accounting.reports.statement':
      return Boolean(m['platform.accounting.reports_statement']?.view || legacyView)
    case 'platform.accounting.transaction_journal':
      return Boolean(m['platform.accounting.transaction_journal']?.view || legacyView)
    case 'platform.accounting.transaction_journal.approve':
      return Boolean(m['platform.accounting.transaction_journal']?.edit || legacyCreate)
    case 'platform.accounting.export':
      return Boolean(
        legacyExport ||
          m['platform.accounting.reports_gl']?.export ||
          m['platform.accounting.reports_pnl']?.export ||
          m['platform.accounting.reports_statement']?.export,
      )
    default:
      return null
  }
}
