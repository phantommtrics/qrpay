import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  fetchOrderCheckoutWallets,
  fetchSaleOrder,
  fetchSaleOrders,
  simulateWalletPayment,
  startWalletCheckout,
  type OrderCheckoutWalletRow,
  type SaleOrder,
  type SalePayment,
} from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'
import type { Order } from '../types'
import { formatMoney } from '../utils/formatMoney'

type OrderTab = 'all' | 'pending_payment' | 'paid' | 'cancelled'

type DetailStep = 'summary' | 'payment'
type PaymentPhase = 'choose' | 'pick_wallet' | 'wallet'

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

function saleOrderStatusLabel(status: string): string {
  if (status === 'paid') return 'Paid'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'pending_payment') return 'Awaiting payment'
  return status.replace(/_/g, ' ')
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
  const [checkoutWallets, setCheckoutWallets] = useState<OrderCheckoutWalletRow[]>([])
  const [selectedGatewayCode, setSelectedGatewayCode] = useState<string | null>(null)
  const [yonnaPhone, setYonnaPhone] = useState('')
  const [walletLaunchUrl, setWalletLaunchUrl] = useState<string | null>(null)
  const [walletPaymentHtml, setWalletPaymentHtml] = useState<string | null>(null)
  const [walletCheckoutAdapter, setWalletCheckoutAdapter] = useState<string | null>(null)
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  /** Prefetch target for wallet list so the Wallet tap avoids a cold GET when possible. */
  const checkoutWalletsCacheRef = useRef<{
    businessId: string
    wallets: OrderCheckoutWalletRow[]
  } | null>(null)
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
    checkoutWalletsCacheRef.current = null
    setDetailStep('summary')
    setPaymentPhase('choose')
    setQrPayload(null)
    setCheckoutWallets([])
    setSelectedGatewayCode(null)
    setYonnaPhone('')
    setWalletLaunchUrl(null)
    setWalletPaymentHtml(null)
    setWalletCheckoutAdapter(null)
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
    const hasWalletUi =
      Boolean(qrPayload) || Boolean(walletPaymentHtml) || Boolean(walletLaunchUrl)
    if (
      detailStep !== 'payment' ||
      paymentPhase !== 'wallet' ||
      !hasWalletUi ||
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
    walletPaymentHtml,
    walletLaunchUrl,
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
    setCheckoutWallets([])
    setSelectedGatewayCode(null)
    setYonnaPhone('')
    setWalletLaunchUrl(null)
    setWalletPaymentHtml(null)
    setWalletCheckoutAdapter(null)
    checkoutWalletsCacheRef.current = null
    if (businessId) {
      void fetchOrderCheckoutWallets(businessId)
        .then((wallets) => {
          checkoutWalletsCacheRef.current = { businessId, wallets }
        })
        .catch(() => {
          checkoutWalletsCacheRef.current = null
        })
    }
  }, [businessId])

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

  const applyWalletStartResult = useCallback(
    (r: {
      qrPayload: string
      launchUrl: string
      paymentHtml: string | null
      checkoutAdapter: string
    }) => {
      setQrPayload(r.qrPayload)
      setWalletLaunchUrl(r.launchUrl?.trim() ? r.launchUrl.trim() : null)
      setWalletPaymentHtml(r.paymentHtml)
      setWalletCheckoutAdapter(r.checkoutAdapter)
    },
    [],
  )

  const handleWalletEntryClick = useCallback(async () => {
    if (!businessId || !detail) return
    setPaymentError(null)

    const cached = checkoutWalletsCacheRef.current
    let wallets: OrderCheckoutWalletRow[]
    if (cached && cached.businessId === businessId) {
      wallets = cached.wallets
    } else {
      setPaymentBusy(true)
      try {
        wallets = await fetchOrderCheckoutWallets(businessId)
        checkoutWalletsCacheRef.current = { businessId, wallets }
      } catch (e) {
        setPaymentError(e instanceof ApiError ? e.message : 'Could not load wallets.')
        setPaymentBusy(false)
        return
      }
      setPaymentBusy(false)
    }

    setCheckoutWallets(wallets)

    const startCheckout = async (body: { gatewayCode?: string; payerPhone?: string }) => {
      setPaymentPhase('wallet')
      setQrPayload(null)
      setWalletLaunchUrl(null)
      setWalletPaymentHtml(null)
      setWalletCheckoutAdapter(null)
      setPaymentBusy(true)
      try {
        const r = await startWalletCheckout(businessId, detail.id, body)
        applyWalletStartResult(r)
      } catch (e) {
        setPaymentPhase('choose')
        setPaymentError(e instanceof ApiError ? e.message : 'Could not start wallet payment.')
      } finally {
        setPaymentBusy(false)
      }
    }

    if (wallets.length === 0) {
      await startCheckout({})
      return
    }

    if (wallets.length === 1) {
      const only = wallets[0]!
      setSelectedGatewayCode(only.code)
      if (only.checkoutAdapter === 'yonna_wallet' && !only.hasStoredPayerPhone) {
        setYonnaPhone((p) => (p.trim() === '' ? '+220' : p))
      } else if (only.checkoutAdapter === 'yonna_wallet' && only.hasStoredPayerPhone) {
        setYonnaPhone('')
      }
    } else {
      setSelectedGatewayCode(null)
    }
    setPaymentPhase('pick_wallet')
  }, [applyWalletStartResult, businessId, detail])

  const handleConfirmWalletSelection = useCallback(async () => {
    if (!businessId || !detail || !selectedGatewayCode) return
    const w = checkoutWallets.find((x) => x.code === selectedGatewayCode)
    const yonnaNeedsManualPhone =
      w?.checkoutAdapter === 'yonna_wallet' && !w.hasStoredPayerPhone
    if (yonnaNeedsManualPhone) {
      const digits = yonnaPhone.replace(/\D/g, '')
      if (digits.length < 7) {
        setPaymentError('Enter the customer phone number after +220 (at least 7 digits).')
        return
      }
    }
    setPaymentError(null)
    setPaymentPhase('wallet')
    setQrPayload(null)
    setWalletLaunchUrl(null)
    setWalletPaymentHtml(null)
    setWalletCheckoutAdapter(null)
    setPaymentBusy(true)
    try {
      const r = await startWalletCheckout(businessId, detail.id, {
        gatewayCode: selectedGatewayCode,
        payerPhone: yonnaNeedsManualPhone ? yonnaPhone.trim() : undefined,
      })
      applyWalletStartResult(r)
    } catch (e) {
      setPaymentPhase('pick_wallet')
      setPaymentError(e instanceof ApiError ? e.message : 'Could not start wallet payment.')
    } finally {
      setPaymentBusy(false)
    }
  }, [
    applyWalletStartResult,
    businessId,
    checkoutWallets,
    detail,
    selectedGatewayCode,
    yonnaPhone,
  ])

  const handleSimulateWallet = useCallback(async () => {
    if (!businessId || !detail || walletCheckoutAdapter !== 'simulator') return
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
  }, [businessId, detail, load, refreshBusinessProducts, resetPaymentUi, walletCheckoutAdapter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (!tabMatches(activeTab, o.status)) return false
      if (!q) return true
      if (o.publicCode.toLowerCase().includes(q)) return true
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
                placeholder="Search by order number or item…"
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
            <CenteredModal className="relative z-10 flex max-h-[min(92vh,920px)] w-[min(70vw,calc(100vw-2rem))] min-w-0 flex-col overflow-hidden rounded-2xl bg-white">
              <div className="flex shrink-0 items-start justify-between gap-4 px-6 py-5">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {detailStep === 'payment' ? (
                    <button
                      type="button"
                      onClick={backToOrderSummary}
                      className="-ml-1 mt-0.5 shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-200/60"
                      aria-label="Back to order"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  ) : null}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      {detailStep === 'payment' ? 'Payment' : 'Order'}
                    </p>
                    <h2 className="mt-1 truncate font-mono text-2xl font-bold tracking-tight text-slate-900">
                      {detail?.publicCode ?? '…'}
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {detailStep === 'payment'
                        ? 'Choose how the customer will pay.'
                        : detail
                          ? saleOrderStatusLabel(detail.status)
                          : 'Loading…'}
                    </p>
                  </div>
                </div>
                {detail && detailStep === 'summary' ? (
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-xs font-medium text-slate-500">Total</p>
                    <p className="text-xl font-bold tabular-nums text-slate-900">
                      {formatMoney(detail.total, { decimals: 2 })}
                    </p>
                    <p className="text-xs text-slate-500">{detail.currency}</p>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={closeDetail}
                  className="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-800"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
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
                    className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_min(320px,34%)] lg:items-start"
                  >
                    <div className="space-y-5">
                      {paymentError ? (
                        <p className="bg-red-50 px-1 py-2 text-sm text-red-800">{paymentError}</p>
                      ) : null}

                      {paymentPhase === 'choose' ? (
                        <div>
                          <p className="mb-4 text-sm font-medium text-slate-700">
                            Total due{' '}
                            <span className="font-semibold text-slate-900">
                              {formatMoney(detail.total, { decimals: 2 })}
                            </span>
                          </p>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <button
                              type="button"
                              disabled={paymentBusy}
                              onClick={() => void handleCashPayment()}
                              className="flex min-h-[8.5rem] flex-col items-start gap-3 p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                            >
                              <span className="text-teal-600">
                                {paymentBusy ? (
                                  <Loader2 className="h-8 w-8 animate-spin" />
                                ) : (
                                  <Banknote className="h-8 w-8 stroke-[1.25]" />
                                )}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-base font-semibold text-slate-900">Cash</span>
                                <span className="mt-1 block text-sm leading-snug text-slate-500">
                                  Record payment received at the counter.
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={paymentBusy}
                              onClick={() => void handleWalletEntryClick()}
                              className="flex min-h-[8.5rem] flex-col items-start gap-3 p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                            >
                              <span className="text-slate-800">
                                {paymentBusy ? (
                                  <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
                                ) : (
                                  <CreditCard className="h-8 w-8 stroke-[1.25]" />
                                )}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-base font-semibold text-slate-900">Wallet</span>
                                <span className="mt-1 block text-sm leading-snug text-slate-500">
                                  Show a QR code for the customer to scan and pay.
                                </span>
                              </span>
                            </button>
                          </div>
                        </div>
                      ) : paymentPhase === 'pick_wallet' ? (
                        <div className="space-y-4">
                          <p className="text-sm font-medium text-slate-700">
                            Select the payment provider (as in{' '}
                            <span className="font-semibold text-slate-900">Merchant API</span>), then
                            generate the QR code.
                          </p>
                          <ul className="space-y-2">
                            {checkoutWallets.map((w) => {
                              const selected = selectedGatewayCode === w.code
                              return (
                                <li key={w.gatewayId}>
                                  <button
                                    type="button"
                                    disabled={paymentBusy}
                                    onClick={() => {
                                      setSelectedGatewayCode(w.code)
                                      if (w.checkoutAdapter === 'yonna_wallet') {
                                        if (w.hasStoredPayerPhone) {
                                          setYonnaPhone('')
                                        } else {
                                          setYonnaPhone((prev) => {
                                            const t = prev.trim()
                                            if (t === '' || t === '+') return '+220'
                                            return prev
                                          })
                                        }
                                      } else {
                                        setYonnaPhone('')
                                      }
                                      setPaymentError(null)
                                    }}
                                    className={`w-full rounded-xl border-2 p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50 ${
                                      selected
                                        ? 'border-teal-500 bg-teal-50/70 shadow-sm ring-2 ring-teal-500/25'
                                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
                                    }`}
                                  >
                                    <span className="block font-semibold text-slate-900">{w.name}</span>
                                    <span className="mt-0.5 block text-xs text-slate-500">{w.code}</span>
                                    {selected ? (
                                      <span className="mt-2 inline-block text-xs font-medium text-teal-700">
                                        Selected
                                      </span>
                                    ) : null}
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                          {(() => {
                            const sel = checkoutWallets.find((x) => x.code === selectedGatewayCode)
                            if (!sel || sel.checkoutAdapter !== 'yonna_wallet') return null
                            if (sel.hasStoredPayerPhone) {
                              return (
                                <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                                  Wallet number is saved under{' '}
                                  <span className="font-medium text-slate-800">Merchant API</span> — no need to
                                  type it here.
                                </p>
                              )
                            }
                            return (
                              <div>
                                <label className="block text-xs font-semibold tracking-wide text-slate-500 uppercase">
                                  Customer phone
                                </label>
                                <input
                                  type="tel"
                                  value={yonnaPhone}
                                  onChange={(e) => setYonnaPhone(e.target.value)}
                                  placeholder="+220 — then type the number"
                                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                                <p className="mt-1 text-xs text-slate-500">
                                  Or save a default under Merchant API to skip this step.
                                </p>
                              </div>
                            )
                          })()}
                          {selectedGatewayCode ? (
                            <button
                              type="button"
                              disabled={paymentBusy}
                              onClick={() => void handleConfirmWalletSelection()}
                              className="w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
                            >
                              {paymentBusy ? 'Starting…' : 'Get QR code'}
                            </button>
                          ) : (
                            <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-sm text-slate-600">
                              Choose a provider above to enable{' '}
                              <span className="font-medium text-slate-800">Get QR code</span>.
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentPhase('choose')
                              setCheckoutWallets([])
                              setSelectedGatewayCode(null)
                              setYonnaPhone('')
                              setPaymentError(null)
                            }}
                            className="w-full text-sm font-medium text-teal-600 hover:underline"
                          >
                            Back
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-5">
                          <p className="w-full text-center text-sm font-semibold text-slate-800">
                            Customer pays with their wallet
                          </p>
                          {walletPaymentHtml && walletCheckoutAdapter !== 'yonna_wallet' ? (
                            <iframe
                              title="Wallet checkout"
                              className="mx-auto h-[min(420px,50vh)] w-full max-w-md rounded-lg border border-slate-200 bg-white"
                              srcDoc={walletPaymentHtml}
                              sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
                            />
                          ) : null}
                          <div className="flex w-full flex-col items-center text-center">
                            {qrPayload ? (
                              <div className="flex w-full justify-center p-1">
                                <QRCode value={qrPayload} size={200} level="M" />
                              </div>
                            ) : walletPaymentHtml && walletCheckoutAdapter !== 'yonna_wallet' ? null : (
                              <div className="flex justify-center py-8">
                                <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
                              </div>
                            )}
                            {walletLaunchUrl?.trim() && walletCheckoutAdapter !== 'yonna_wallet' ? (
                              <a
                                href={walletLaunchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 text-center text-sm font-medium text-teal-600 hover:underline"
                              >
                                Open payment page
                              </a>
                            ) : null}
                            {qrPayload ? (
                              <button
                                type="button"
                                onClick={() => void navigator.clipboard.writeText(qrPayload)}
                                className="mt-2 text-sm font-medium text-teal-600 hover:underline"
                              >
                                Copy link for QR
                              </button>
                            ) : null}
                          </div>
                          {walletCheckoutAdapter === 'simulator' ? (
                            <button
                              type="button"
                              disabled={paymentBusy}
                              onClick={() => void handleSimulateWallet()}
                              className="w-full py-3 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none disabled:opacity-50"
                            >
                              Simulate customer paid (demo)
                            </button>
                          ) : (
                            <p className="text-xs text-slate-500">
                              When the customer completes payment in their app, this order will move to
                              paid (after provider confirmation). Pull to refresh or reopen the order if
                              needed.
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentPhase('choose')
                              setQrPayload(null)
                              setWalletLaunchUrl(null)
                              setWalletPaymentHtml(null)
                              setWalletCheckoutAdapter(null)
                              setCheckoutWallets([])
                              setSelectedGatewayCode(null)
                              setYonnaPhone('')
                              setPaymentError(null)
                            }}
                            className="w-full text-sm font-medium text-teal-600 hover:underline"
                          >
                            Change payment method
                          </button>
                        </div>
                      )}
                    </div>

                    <aside className="p-1 lg:sticky lg:top-0 lg:pl-6">
                      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                        Order recap
                      </p>
                      <p className="mt-1 font-mono text-lg font-bold text-slate-900">{detail.publicCode}</p>
                      <p className="mt-3 text-sm text-slate-600">
                        {detail.lines.length} line{detail.lines.length === 1 ? '' : 's'} ·{' '}
                        {new Date(detail.createdAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                      {detail.tableLabel?.trim() ? (
                        <p className="mt-2 text-sm text-slate-700">
                          <span className="font-medium text-slate-900">Table</span>{' '}
                          {detail.tableLabel.trim()}
                        </p>
                      ) : null}
                      <div className="mt-4 pt-4">
                        <ul className="max-h-40 space-y-2.5 overflow-y-auto text-sm text-slate-600">
                          {detail.lines.map((line) => (
                            <li key={line.id} className="flex justify-between gap-2">
                              <span className="min-w-0 truncate">
                                {line.quantity}× {line.productName}
                              </span>
                              <span className="shrink-0 tabular-nums font-medium text-slate-800">
                                {formatMoney(line.lineTotal, { decimals: 2 })}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="mt-4 space-y-1 pt-4 text-sm text-slate-600">
                        <div className="flex justify-between text-slate-600">
                          <span>Subtotal</span>
                          <span className="tabular-nums">{formatMoney(detail.subtotal, { decimals: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Tax</span>
                          <span className="tabular-nums">{formatMoney(detail.taxAmount, { decimals: 2 })}</span>
                        </div>
                        <div className="flex justify-between pt-2 text-base font-bold text-slate-900">
                          <span>Due</span>
                          <span className="tabular-nums">{formatMoney(detail.total, { decimals: 2 })}</span>
                        </div>
                      </div>
                    </aside>
                  </motion.div>
                ) : detail ? (
                  <motion.div
                    key="summary"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="min-w-0 py-1">
                        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Status</p>
                        <div className="mt-2">
                          <OrderStatusBadge status={saleStatusToBadgeStatus(detail.status)} />
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{saleOrderStatusLabel(detail.status)}</p>
                      </div>
                      <div className="min-w-0 py-1">
                        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Placed</p>
                        <p className="mt-2 text-sm font-medium text-slate-900">
                          {new Date(detail.createdAt).toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                        <p className="text-sm text-slate-600">
                          {new Date(detail.createdAt).toLocaleTimeString(undefined, {
                            timeStyle: 'short',
                          })}
                        </p>
                      </div>
                      <div className="min-w-0 py-1">
                        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Table</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">
                          {detail.tableLabel?.trim() || '—'}
                        </p>
                        <p className="text-xs text-slate-500">Dine-in assignment</p>
                      </div>
                      <div className="min-w-0 py-1">
                        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Items</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{detail.lines.length}</p>
                        <p className="text-xs text-slate-500">Line items on this order</p>
                      </div>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_min(300px,32%)] lg:items-start">
                      <section className="min-w-0">
                        <div className="mb-3">
                          <h3 className="text-sm font-semibold text-slate-900">Line items</h3>
                          <p className="text-xs text-slate-500">Products and quantities</p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[320px] text-left text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                                <th className="px-4 py-2.5 font-medium">Product</th>
                                <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                                <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">
                                  Unit
                                </th>
                                <th className="px-4 py-2.5 text-right font-medium">Line total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {detail.lines.map((line) => (
                                <tr key={line.id} className="text-slate-800">
                                  <td className="px-4 py-3 font-medium">{line.productName}</td>
                                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                                    {line.quantity}
                                  </td>
                                  <td className="hidden px-4 py-3 text-right tabular-nums text-slate-600 sm:table-cell">
                                    {formatMoney(line.unitPrice, { decimals: 2 })}
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                                    {formatMoney(line.lineTotal, { decimals: 2 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      <aside className="space-y-4 lg:sticky lg:top-0">
                        <div className="py-1">
                          <h3 className="text-sm font-semibold text-slate-900">Amounts</h3>
                          <p className="mt-0.5 text-xs text-slate-500">Currency {detail.currency}</p>
                          <dl className="mt-4 space-y-2 text-sm">
                            <div className="flex justify-between text-slate-600">
                              <dt>Subtotal</dt>
                              <dd className="tabular-nums font-medium text-slate-800">
                                {formatMoney(detail.subtotal, { decimals: 2 })}
                              </dd>
                            </div>
                            <div className="flex justify-between text-slate-600">
                              <dt>Tax</dt>
                              <dd className="tabular-nums font-medium text-slate-800">
                                {formatMoney(detail.taxAmount, { decimals: 2 })}
                              </dd>
                            </div>
                            <div className="flex justify-between pt-3 text-base font-bold text-slate-900">
                              <dt>Total</dt>
                              <dd className="tabular-nums">{formatMoney(detail.total, { decimals: 2 })}</dd>
                            </div>
                          </dl>
                          {detail.status === 'pending_payment' ? (
                            <p className="mt-3 text-xs text-amber-900">Outstanding until payment is recorded.</p>
                          ) : null}
                        </div>

                        {detail.receipt ? (
                          <div className="py-1">
                            <h3 className="text-sm font-semibold text-slate-900">Receipt</h3>
                            <p className="mt-2 font-mono text-base font-semibold text-teal-700">
                              {detail.receipt.publicCode}
                            </p>
                            {detail.receipt.receiptNumber != null ? (
                              <p className="mt-1 text-sm text-slate-600">
                                Receipt #{detail.receipt.receiptNumber}
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        {detail.payments && detail.payments.length > 0 ? (
                          <div className="py-1">
                            <h3 className="text-sm font-semibold text-slate-900">Payments</h3>
                            <ul className="mt-4 space-y-5">
                              {detail.payments.map((p) => (
                                <li key={p.id} className="text-sm">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-semibold text-slate-800">
                                      {paymentMethodLabel(p.method)}
                                    </span>
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                        p.status === 'completed'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : p.status === 'failed'
                                            ? 'bg-red-100 text-red-800'
                                            : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {paymentStatusLabel(p.status)}
                                    </span>
                                  </div>
                                  <div className="mt-2 flex flex-wrap justify-between gap-2 text-slate-600">
                                    <span className="font-mono text-xs">{p.reference}</span>
                                    <span className="font-semibold tabular-nums text-slate-900">
                                      {formatMoney(p.amount, { decimals: 2 })}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {new Date(p.createdAt).toLocaleString(undefined, {
                                      dateStyle: 'medium',
                                      timeStyle: 'short',
                                    })}
                                    {p.completedAt
                                      ? ` · Completed ${new Date(p.completedAt).toLocaleString(undefined, {
                                          timeStyle: 'short',
                                        })}`
                                      : null}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <p className="py-2 text-center text-sm text-slate-500">No payments recorded yet.</p>
                        )}

                        {canCollectPayment ? (
                          <button
                            type="button"
                            onClick={handleProcessToPayment}
                            className="w-full rounded-xl bg-teal-600 py-3.5 text-sm font-bold text-white transition-colors hover:bg-teal-700"
                          >
                            Process to payment
                          </button>
                        ) : null}
                        {detail.status === 'pending_payment' &&
                        detailStep === 'summary' &&
                        !canCollectPaymentApi ? (
                          <p className="text-xs text-amber-900">
                            You need POS or order-management access to collect payment from this screen.
                          </p>
                        ) : null}
                      </aside>
                    </div>
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
