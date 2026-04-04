import { useCallback, useEffect, useMemo, useState } from 'react'
import { Filter, Search } from 'lucide-react'

import { OrderStatusBadge } from '../components/status/OrderStatusBadge'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import { fetchSaleOrders, type SaleOrder } from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'
import type { Order } from '../types'
import { formatMoney } from '../utils/formatMoney'

type OrderTab = 'all' | 'pending_payment' | 'paid' | 'cancelled'

const TABS: { id: OrderTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending_payment', label: 'Awaiting payment' },
  { id: 'paid', label: 'Paid' },
  { id: 'cancelled', label: 'Cancelled' },
]

function tabMatches(tab: OrderTab, status: string): boolean {
  if (tab === 'all') return true
  if (tab === 'pending_payment') return status === 'pending_payment'
  if (tab === 'paid') return status === 'paid'
  if (tab === 'cancelled') return status === 'cancelled'
  return true
}

function saleStatusToBadgeStatus(status: string): Order['status'] {
  if (status === 'paid') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  return 'pending'
}

export function OrdersPage() {
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id

  const [orders, setOrders] = useState<SaleOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<OrderTab>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!businessId) {
      setOrders([])
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const data = await fetchSaleOrders(businessId)
      setOrders(data)
    } catch (e) {
      setOrders([])
      setLoadError(e instanceof ApiError ? e.message : 'Could not load orders.')
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (!tabMatches(activeTab, o.status)) return false
      if (!q) return true
      if (o.publicCode.toLowerCase().includes(q)) return true
      if (o.id.toLowerCase().includes(q)) return true
      return o.lines.some((l) => l.productName.toLowerCase().includes(q))
    })
  }, [orders, activeTab, search])

  return (
    <PageTransition className="space-y-6">
      <PageCard className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by code or item…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-4 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <button
              type="button"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              aria-label="Filters"
            >
              <Filter className="h-4 w-4" />
            </button>
          </div>
        </div>
      </PageCard>

      {loadError ? (
        <PageCard className="border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</PageCard>
      ) : null}

      <PageCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm text-slate-500">
                <th className="p-4 font-medium">Order</th>
                <th className="p-4 font-medium">Date &amp; time</th>
                <th className="p-4 font-medium">Items</th>
                <th className="p-4 font-medium">Table</th>
                <th className="p-4 font-medium">Total</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-sm text-slate-500">
                    Loading orders…
                  </td>
                </tr>
              ) : !businessId ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-sm text-slate-500">
                    Select a business to view orders.
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-sm text-slate-500">
                    No orders match this view. POS and guest table orders appear here.
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className="group transition-colors hover:bg-slate-50">
                    <td className="p-4">
                      <div className="font-mono text-sm font-semibold text-slate-800">
                        {order.publicCode}
                      </div>
                      <div className="mt-0.5 max-w-[140px] truncate font-mono text-xs text-slate-400">
                        {order.id}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      {new Date(order.createdAt).toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="p-4">
                      <div className="text-sm text-slate-800">{order.lines.length} items</div>
                      <div className="max-w-[220px] truncate text-xs text-slate-500">
                        {order.lines.map((item) => item.productName).join(', ')}
                      </div>
                    </td>
                    <td className="p-4 text-sm font-medium text-slate-600">
                      {order.tableLabel?.trim() || '—'}
                    </td>
                    <td className="p-4 font-semibold text-slate-800">
                      {formatMoney(order.total, { decimals: 2 })}
                    </td>
                    <td className="p-4">
                      <OrderStatusBadge status={saleStatusToBadgeStatus(order.status)} />
                    </td>
                    <td className="p-4 text-right">
                      <button
                        type="button"
                        className="text-sm font-medium text-teal-600 opacity-0 transition-opacity hover:underline group-hover:opacity-100"
                      >
                        View details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageCard>
    </PageTransition>
  )
}
