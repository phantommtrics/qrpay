import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  ChefHat,
  Clock3,
  Filter,
  Search,
  Utensils,
} from 'lucide-react'

import { MOCK_ORDERS } from '../data/mockData'
import type { Order } from '../types'

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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
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

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
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
                  <td className="p-4 font-semibold text-slate-800">D{order.total}</td>
                  <td className="p-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${getStatusColor(order.status)}`}
                    >
                      {getStatusIcon(order.status)}
                      {order.status}
                    </span>
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
      </div>
    </motion.div>
  )
}
