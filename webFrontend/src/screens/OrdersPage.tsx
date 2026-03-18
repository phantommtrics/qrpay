import { useState } from 'react'
import { Filter, Search } from 'lucide-react'

import { OrderStatusBadge } from '../components/status/OrderStatusBadge'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { MOCK_ORDERS } from '../data/mockData'
import { formatMoney } from '../utils/formatMoney'

export function OrdersPage() {
  const [activeTab, setActiveTab] = useState<
    'All' | 'Pending' | 'Preparing' | 'Served' | 'Completed'
  >('All')
  const tabs = ['All', 'Pending', 'Preparing', 'Served', 'Completed'] as const
  const filteredOrders =
    activeTab === 'All'
      ? MOCK_ORDERS
      : MOCK_ORDERS.filter(
          (order) => order.status.toLowerCase() === activeTab.toLowerCase(),
        )

  return (
    <PageTransition className="space-y-6">
      <PageCard className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search orders..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-4 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <button className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
              <Filter className="h-4 w-4" />
            </button>
          </div>
        </div>
      </PageCard>

      <PageCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm text-slate-500">
                <th className="p-4 font-medium">Order ID</th>
                <th className="p-4 font-medium">Date & Time</th>
                <th className="p-4 font-medium">Items</th>
                <th className="p-4 font-medium">Table</th>
                <th className="p-4 font-medium">Total</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="group transition-colors hover:bg-slate-50">
                  <td className="p-4 font-mono text-sm font-medium text-slate-800">
                    {order.id}
                  </td>
                  <td className="p-4 text-sm text-slate-500">
                    {new Date(order.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="p-4">
                    <div className="text-sm text-slate-800">
                      {order.items.length} items
                    </div>
                    <div className="max-w-[200px] truncate text-xs text-slate-500">
                      {order.items.map((item) => item.productName).join(', ')}
                    </div>
                  </td>
                  <td className="p-4 text-sm font-medium text-slate-600">
                    {order.tableId ?? '-'}
                  </td>
                  <td className="p-4 font-semibold text-slate-800">
                    {formatMoney(order.total, { decimals: 0 })}
                  </td>
                  <td className="p-4">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="p-4 text-right">
                    <button className="text-sm font-medium text-teal-600 opacity-0 transition-opacity hover:underline group-hover:opacity-100">
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageCard>
    </PageTransition>
  )
}
