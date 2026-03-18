import { CheckCircle2, ChefHat, Clock3, Utensils } from 'lucide-react'

import type { Order } from '../../types'

function getStatusColor(status: Order['status']) {
  switch (status) {
    case 'pending':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'preparing':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'served':
      return 'bg-teal-100 text-teal-700 border-teal-200'
    case 'completed':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

function getStatusIcon(status: Order['status']) {
  switch (status) {
    case 'pending':
      return <Clock3 className="h-4 w-4" />
    case 'preparing':
      return <ChefHat className="h-4 w-4" />
    case 'served':
      return <Utensils className="h-4 w-4" />
    case 'completed':
      return <CheckCircle2 className="h-4 w-4" />
    default:
      return null
  }
}

export function OrderStatusBadge({
  status,
  showIcon = true,
  bordered = true,
}: {
  status: Order['status']
  showIcon?: boolean
  bordered?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
        bordered ? 'border' : ''
      } ${getStatusColor(
        status,
      )}`}
    >
      {showIcon ? getStatusIcon(status) : null}
      {status}
    </span>
  )
}
