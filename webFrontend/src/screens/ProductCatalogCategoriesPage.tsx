import { Link } from 'react-router-dom'

import { MenuCategoriesSalesBlock } from '../components/menu/MenuCategoriesSalesBlock'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  isPetrolStationIndustry,
  isRetailOrWholesaleIndustry,
  isRestaurantIndustry,
} from '../utils/businessIndustry'

export function ProductCatalogCategoriesPage() {
  const { currentOrganization, canAccess, user } = useAuth()
  const businessId = currentOrganization?.id
  const industry = currentOrganization?.industry
  const isPartner = Boolean(currentOrganization?.isInternalPartner)
  const retailLike = Boolean(
    currentOrganization &&
      (isRetailOrWholesaleIndustry(industry) || isPetrolStationIndustry(industry)),
  )
  const isRestaurant = Boolean(currentOrganization && isRestaurantIndustry(industry))
  const allowed =
    Boolean(currentOrganization) &&
    (retailLike || isPartner) &&
    canAccess('products.categories')
  const canExportReports = canAccess('reports.export')
  const canCreate = canAccess('products.create') && !isPartner

  const showWrongIndustry =
    Boolean(currentOrganization) &&
    !retailLike &&
    !isRestaurant &&
    !isPartner &&
    !user?.isPlatformOwner &&
    !user?.isPlatformAdmin

  const showRestaurantHint =
    Boolean(currentOrganization) &&
    isRestaurant &&
    !user?.isPlatformOwner &&
    !user?.isPlatformAdmin

  const showPlanGate =
    (retailLike || isPartner) && !canAccess('products.categories')

  return (
    <PageTransition className="mx-auto max-w-6xl space-y-8 px-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
        </div>
        {allowed && !isPartner ? (
          <Link
            to={APP_PATHS.products}
            className="shrink-0 text-sm font-medium text-teal-600 hover:text-teal-700 hover:underline"
          >
            Products →
          </Link>
        ) : null}
      </div>

      {showWrongIndustry ? (
        <div className="border-b border-amber-200 bg-amber-50/90 py-3 text-sm text-amber-900">
          Categories are available for Retail, Wholesale, Pharmacy, and Petrol station businesses.
        </div>
      ) : null}

      {showRestaurantHint ? (
        <div className="border-b border-slate-200 bg-slate-50 py-3 text-sm text-slate-700">
          Restaurant businesses manage categories under{' '}
          <Link to={APP_PATHS.restaurantMenuSetup} className="font-medium text-teal-600 hover:underline">
            Menu setup
          </Link>
          .
        </div>
      ) : null}

      {showPlanGate ? (
        <div className="border-b border-amber-200 bg-amber-50/90 py-3 text-sm text-amber-900">
          Your plan or assigned features do not include the Categories module. Ask the business owner to enable{' '}
          <strong>Categories</strong> in configuration.
        </div>
      ) : null}

      <MenuCategoriesSalesBlock
        businessId={businessId}
        businessName={currentOrganization?.name}
        allowed={allowed}
        variant="catalog"
        canCreate={canCreate}
        canDeleteCategory={canCreate}
        canExportReports={canExportReports}
      />
    </PageTransition>
  )
}
