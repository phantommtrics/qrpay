import type { Payment } from '../../types'

function getStatusColor(status: Payment['status']) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-700'
    case 'pending':
      return 'bg-amber-100 text-amber-700'
    case 'reversed':
      return 'bg-slate-100 text-slate-700'
    default:
      return 'bg-red-100 text-red-700'
  }
}

export function PaymentStatusBadge({ status }: { status: Payment['status'] }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium capitalize ${getStatusColor(
        status,
      )}`}
    >
      {status}
    </span>
  )
}
