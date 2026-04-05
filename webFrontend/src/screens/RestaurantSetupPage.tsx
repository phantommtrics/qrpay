import { Navigate } from 'react-router-dom'

import { APP_PATHS } from '../config/navigation'

/** @deprecated Use `/restaurant/tables` or `/restaurant/menu` — kept for bookmarks and old links. */
export function RestaurantSetupPage() {
  return <Navigate to={APP_PATHS.restaurantTables} replace />
}
