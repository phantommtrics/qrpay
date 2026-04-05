import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Banknote,
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  Filter,
  Loader2,
  Search,
  X,
} from 'lucide-react'
import QRCode from 'react-qr-code'

import { OrderStatusBadge } from '../components/status/OrderStatusBadge'
import { CenteredModal } from '../components/ui/CenteredModal'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import {
  confirmCashPayment,
  fetchSaleOrder,
  fetchSaleOrders,
  simulateWalletPayment,
  startWalletCheckout,
  type SaleOrder,
  type SalePayment,
} from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'
import type { Order } from '../types'
import { formatMoney } from '../utils/formatMoney'

type OrderTab = 'all' | 'pending_payment' | 'paid' | 'cancelled'

type DetailStep = 'summary' | 'payment'
type PaymentPhase = 'choose' | 'wallet'

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

function paymentMethodLabel(method: SalePayment['method']): string {
  if (method === 'qr_wallet') return 'QR wallet'
  if (method === 'cash') return 'Cash'
  return method
}

function paymentStatusLabel(status: SalePayment['status']): string {
  if (status === 'completed') return 'Completed'
  if (status === 'failed') return 'Failed'
  return 'Pending'
}

export function OrdersPage() {
  const { currentOrganization, refreshBusinessProducts, canAccess } = useAuth()
  const businessId = currentOrganization?.id
  const canCollectPaymentApi = canAccess('pos.access') || canAccess('orders.manage')

  const [orders, setOrders] = useState<SaleOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<OrderTab>('all')
  const [search, setSearch] = useState('')

  const [detailOrderId, setDetailOrderId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SaleOrder | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [detailStep, setDetailStep] = useState<DetailStep>('summary')
  const [paymentPhase, setPaymentPhase] = useState<PaymentPhase>('choose')
  const [qrPayload, setQrPayload] = useState<string | null>(null)
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<{
    title: string
    message: string
  } | null>(null)

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

  const resetPaymentUi = useCallback(() => {
    setDetailStep('summary')
    setPaymentPhase('choose')
    setQrPayload(null)
    setPaymentBusy(false)
    setPaymentError(null)
  }, [])

  const closeDetail = useCallback(() => {
    setPaymentSuccessMessage(null)
    setDetailOrderId(null)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(false)
    resetPaymentUi()
  }, [resetPaymentUi])

  const dismissPaymentSuccess = useCallback(() => {
    setPaymentSuccessMessage(null)
  }, [])

  const openDetail = useCallback(
    async (orderId: string) => {
      if (!businessId) return
      setDetailOrderId(orderId)
      setDetail(null)
      setDetailError(null)
      setDetailLoading(true)
      resetPaymentUi()
      try {
        const o = await fetchSaleOrder(businessId, orderId)
        setDetail(o)
      } catch (e) {
        setDetailError(e instanceof ApiError ? e.message : 'Could not load order.')
      } finally {
        setDetailLoading(false)
      }
    },
    [businessId, resetPaymentUi],
  )

  useEffect(() => {
    if (!detailOrderId && !paymentSuccessMessage) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        if (paymentSuccessMessage) {
          dismissPaymentSuccess()
        } else {
          closeDetail()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailOrderId, paymentSuccessMessage, closeDetail, dismissPaymentSuccess])

  useEffect(() => {
    if (
      detailStep !== 'payment' ||
      paymentPhase !== 'wallet' ||
      !qrPayload ||
      !businessId ||
      !detailOrderId
    ) {
      return
    }

    const tick = () => {
      void (async () => {
        try {
          const o = await fetchSaleOrder(businessId, detailOrderId)
          setDetail(o)
          if (o.status === 'paid') {
            void load()
            void refreshBusinessProducts()
            const receiptPart = o.receipt
              ? `Receipt ${o.receipt.publicCode}.`
              : 'Order marked paid.'
            setPaymentSuccessMessage({
              title: 'Payment confirmed',
              message: `Wallet payment received. ${receiptPart} Total ${formatMoney(o.total, { decimals: 2 })}.`,
            })
            resetPaymentUi()
          }
        } catch {
          /* ignore transient poll errors */
        }
      })()
    }

    tick()
    const interval = window.setInterval(tick, 2000)
    return () => window.clearInterval(interval)
  }, [
    detailStep,
    paymentPhase,
    qrPayload,
    businessId,
    detailOrderId,
    load,
    refreshBusinessProducts,
    resetPaymentUi,
  ])

  const handleProcessToPayment = useCallback(() => {
    setPaymentError(null)
    setDetailStep('payment')
    setPaymentPhase('choose')
    setQrPayload(null)
  }, [])

  const backToOrderSummary = useCallback(() => {
    resetPaymentUi()
  }, [resetPaymentUi])

  const handleCashPayment = useCallback(async () => {
    if (!businessId || !detail) return
    setPaymentBusy(true)
    setPaymentError(null)
    try {
      const result = await confirmCashPayment(businessId, detail.id)
      const o = await fetchSaleOrder(businessId, detail.id)
      setDetail(o)
      void load()
      void refreshBusinessProducts()
      resetPaymentUi()
      setPaymentSuccessMessage({
        title: 'Payment confirmed',
        message: `Cash recorded. Receipt ${result.receipt.publicCode}. Amount ${formatMoney(result.receipt.total, { decimals: 2 })}.`,
      })
    } catch (e) {
      setPaymentError(e instanceof ApiError ? e.message : 'Cash payment failed.')
    } finally {
      setPaymentBusy(false)
    }
  }, [businessId, detail, load, refreshBusinessProducts, resetPaymentUi])

  const handleStartWallet = useCallback(async () => {
    if (!businessId || !detail) return
    setPaymentBusy(true)
    setPaymentError(null)
    try {
      const { qrPayload: payload } = await startWalletCheckout(businessId, detail.id)
      setQrPayload(payload)
      setPaymentPhase('wallet')
    } catch (e) {
      setPaymentError(e instanceof ApiError ? e.message : 'Could not start wallet payment.')
    } finally {
      setPaymentBusy(false)
    }
  }, [businessId, detail])

  const handleSimulateWallet = useCallback(async () => {
    if (!businessId || !detail) return
    setPaymentBusy(true)
    setPaymentError(null)
    try {
      await simulateWalletPayment(businessId, detail.id)
      const o = await fetchSaleOrder(businessId, detail.id)
      setDetail(o)
      if (o.status === 'paid') {
        void load()
        void refreshBusinessProducts()
        const receiptPart = o.receipt
          ? `Receipt ${o.receipt.publicCode}.`
          : 'Order marked paid.'
        setPaymentSuccessMessage({
          title: 'Payment confirmed',
          message: `Wallet payment received (demo). ${receiptPart} Total ${formatMoney(o.total, { decimals: 2 })}.`,
        })
        resetPaymentUi()
      }
    } catch (e) {
      setPaymentError(e instanceof ApiError ? e.message : 'Could not complete test payment.')
    } finally {
      setPaymentBusy(false)
    }
  }, [businessId, detail, load, refreshBusinessProducts, resetPaymentUi])

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

  const canCollectPayment =
    detail?.status === 'pending_payment' &&
    detailStep === 'summary' &&
    canCollectPaymentApi

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
                        onClick={() => void openDetail(order.id)}
                        className="text-sm font-medium text-teal-600 hover:underline"
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

      <AnimatePresence>
        {detailOrderId ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <ModalOverlay
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={closeDetail}
            />
            <CenteredModal className="relative z-10 flex max-h-[min(90vh,800px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
                <div className="flex min-w-0 flex-1 items-start gap-2 pr-2">
                  {detailStep === 'payment' ? (
                    <button
                      type="button"
                      onClick={backToOrderSummary}
                      className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                      aria-label="Back to order"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  ) : null}
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-slate-900">
                      {detailStep === 'payment' ? 'Collect payment' : 'Order details'}
                    </h2>
                    <p className="mt-0.5 font-mono text-sm text-slate-600">
                      {detail?.publicCode ?? '…'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeDetail}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {detailLoading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                    <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
                    <p className="text-sm">Loading order…</p>
                  </div>
                ) : detailError ? (
                  <p className="py-8 text-center text-sm text-red-600">{detailError}</p>
                ) : detailStep === 'payment' && detail ? (
                  <motion.div
                    key="payment"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-5"
                  >
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                      <p className="text-slate-600">
                        Total due{' '}
                        <span className="font-semibold text-slate-900">
                          {formatMoney(detail.total, { decimals: 2 })}
                        </span>
                      </p>
                    </div>

                    {paymentError ? (
                      <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">
                        {paymentError}
                      </p>
                    ) : null}

                    {paymentPhase === 'choose' ? (
                      <div className="flex flex-col gap-3">
                        <button
                          type="button"
                          disabled={paymentBusy}
                          onClick={() => void handleCashPayment()}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white py-4 font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50"
                        >
                          {paymentBusy ? (
                            <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
                          ) : (
                            <Banknote className="h-5 w-5 text-teal-600" />
                          )}
                          Pay by cash
                        </button>
                        <button
                          type="button"
                          disabled={paymentBusy}
                          onClick={() => void handleStartWallet()}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-4 font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                        >
                          {paymentBusy ? (
                            <Loader2 className="h-5 w-5 animate-spin text-white" />
                          ) : (
                            <CreditCard className="h-5 w-5" />
                          )}
                          Pay by wallet
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4 text-center">
                        <p className="text-sm font-medium text-slate-800">
                          Customer scans to pay
                        </p>
                        {qrPayload ? (
                          <div className="mx-auto inline-block rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-inner">
                            <QRCode value={qrPayload} size={200} level="M" />
                          </div>
                        ) : (
                          <div className="flex justify-center py-8">
                            <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
                          </div>
                        )}
                        {qrPayload ? (
                          <button
                            type="button"
                            onClick={() => void navigator.clipboard.writeText(qrPayload)}
                            className="text-sm font-medium text-teal-600 hover:underline"
                          >
                            Copy pay link
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={paymentBusy}
                          onClick={() => void handleSimulateWallet()}
                          className="w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Simulate customer paid (demo)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentPhase('choose')
                            setQrPayload(null)
                            setPaymentError(null)
                          }}
                          className="text-sm font-medium text-teal-600 hover:underline"
                        >
                          Change payment method
                        </button>
                      </div>
                    )}
                  </motion.div>
                ) : detail ? (
                  <motion.div
                    key="summary"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-5"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <OrderStatusBadge status={saleStatusToBadgeStatus(detail.status)} />
                      <span className="text-sm text-slate-600">
                        {new Date(detail.createdAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>
                    {detail.tableLabel?.trim() ? (
                      <p className="text-sm text-slate-700">
                        <span className="font-medium text-slate-900">Table:</span>{' '}
                        {detail.tableLabel.trim()}
                      </p>
                    ) : null}
                    <p className="font-mono text-xs text-slate-400 break-all">ID: {detail.id}</p>

                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-slate-900">Line items</h3>
                      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                        {detail.lines.map((line) => (
                          <li
                            key={line.id}
                            className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800">{line.productName}</p>
                              <p className="text-xs text-slate-500">
                                {line.quantity} × {formatMoney(line.unitPrice, { decimals: 2 })}
                              </p>
                            </div>
                            <p className="shrink-0 font-medium text-slate-900">
                              {formatMoney(line.lineTotal, { decimals: 2 })}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-sm">
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>Subtotal</span>
                        <span>{formatMoney(detail.subtotal, { decimals: 2 })}</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>Tax</span>
                        <span>{formatMoney(detail.taxAmount, { decimals: 2 })}</span>
                      </div>
                      <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                        <span>Total</span>
                        <span>{formatMoney(detail.total, { decimals: 2 })}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">Amount payable (if still unpaid)</p>
                    </div>

                    {canCollectPayment ? (
                      <button
                        type="button"
                        onClick={handleProcessToPayment}
                        className="w-full rounded-xl bg-teal-600 py-3.5 text-sm font-bold text-white shadow-md shadow-teal-600/20 transition-colors hover:bg-teal-700"
                      >
                        Process to payment
                      </button>
                    ) : null}
                    {detail.status === 'pending_payment' &&
                    detailStep === 'summary' &&
                    !canCollectPaymentApi ? (
                      <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        You need POS or order-management access to collect payment from this screen.
                      </p>
                    ) : null}

                    {detail.payments && detail.payments.length > 0 ? (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-slate-900">Payments</h3>
                        <ul className="space-y-2">
                          {detail.payments.map((p) => (
                            <li
                              key={p.id}
                              className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-medium text-slate-800">
                                  {paymentMethodLabel(p.method)}
                                </span>
                                <span className="text-slate-600">{paymentStatusLabel(p.status)}</span>
                              </div>
                              <div className="mt-1 flex justify-between text-slate-600">
                                <span className="font-mono text-xs">{p.reference}</span>
                                <span>{formatMoney(p.amount, { decimals: 2 })}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {detail.receipt ? (
                      <p className="text-sm text-slate-700">
                        <span className="font-medium text-slate-900">Receipt:</span>{' '}
                        <span className="font-mono">{detail.receipt.publicCode}</span>
                        {detail.receipt.receiptNumber != null ? (
                          <span className="text-slate-500">
                            {' '}
                            (#{detail.receipt.receiptNumber})
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </motion.div>
                ) : null}
              </div>
            </CenteredModal>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {paymentSuccessMessage ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <ModalOverlay
              className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
              onClick={dismissPaymentSuccess}
            />
            <motion.div
              key="payment-success"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">{paymentSuccessMessage.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {paymentSuccessMessage.message}
              </p>
              <button
                type="button"
                onClick={dismissPaymentSuccess}
                className="mt-6 w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
              >
                OK
              </button>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </PageTransition>
  )
}
