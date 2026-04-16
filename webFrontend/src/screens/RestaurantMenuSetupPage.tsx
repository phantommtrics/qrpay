import { Link } from 'react-router-dom'

import { MenuCategoriesSalesBlock } from '../components/menu/MenuCategoriesSalesBlock'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { isRestaurantIndustry } from '../utils/businessIndustry'

export function RestaurantMenuSetupPage() {
  const { currentOrganization, canAccess, user } = useAuth()
  const businessId = currentOrganization?.id
  const allowed = Boolean(currentOrganization && isRestaurantIndustry(currentOrganization.industry))
  const canCreate = canAccess('products.create')
  /** Menu categories use the same permission as adding categories (not `products.delete`). */
  const canDeleteCategory = canCreate
  const canExportReports = canAccess('reports.export')

  const showGate =
    Boolean(currentOrganization) && !allowed && !user?.isPlatformOwner && !user?.isPlatformAdmin

  return (
    <PageTransition className="mx-auto max-w-6xl space-y-8 px-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Menu setup</h1>
          <p className="mt-1 text-sm text-slate-600">
            Build your menu tree: top-level sections and nested sub-menus. Products are added under{' '}
            <span className="font-medium text-slate-800">leaf</span> categories (no children below them).
          </p>
        </div>
        {allowed ? (
          <Link
            to={APP_PATHS.restaurantTables}
            className="shrink-0 text-sm font-medium text-teal-600 hover:text-teal-700 hover:underline"
          >
            Dining tables &amp; QR →
          </Link>
        ) : null}
      </div>

      {showGate ? (
        <div className="border-b border-amber-200 bg-amber-50/90 py-3 text-sm text-amber-900">
          Menu setup is only available when your business industry is Restaurant.
        </div>
      ) : null}

      <MenuCategoriesSalesBlock
        businessId={businessId}
        businessName={currentOrganization?.name}
        allowed={allowed}
        variant="restaurant"
        canCreate={canCreate}
        canDeleteCategory={canDeleteCategory}
        canExportReports={canExportReports}
      />
    </PageTransition>
  )
}
