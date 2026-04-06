import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  Minus,
  Plus,
  ScanLine,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react'
import QRCode from 'react-qr-code'

import { AddProductModal } from '../components/products/AddProductModal'
import { ProductThumb } from '../components/products/ProductThumb'
import { CameraBarcodeScanner } from '../components/scanner/CameraBarcodeScanner'
import { CenteredModal } from '../components/ui/CenteredModal'
import { FlashNotice } from '../components/ui/FlashNotice'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { useAuth } from '../features/auth/AuthContext'
import { useCart } from '../features/cart/useCart'
import {
  cancelSaleOrder,
  confirmCashPayment,
  createSaleOrder,
  fetchOrderCheckoutWallets,
  fetchSaleOrder,
  simulateWalletPayment,
  startWalletCheckout,
  type OrderCheckoutWalletRow,
} from '../services/salesApi'
import { ApiError, fetchDiningTables, type DiningTableRow } from '../services/subscriptionApi'
import type { Product } from '../types'
import { formatMoney } from '../utils/formatMoney'
import { productSellableUnits } from '../utils/productStock'
import { isRestaurantIndustry } from '../utils/businessIndustry'
import { playPosScanError, playPosScanSuccess } from '../utils/posSounds'

type ScanFeedback = { text: string; variant: 'success' | 'error' }

type PosPaymentPhase = 'choose' | 'pick_wallet' | 'wallet'

export function POSPage() {
  const { businessProducts, currentOrganization, refreshBusinessProducts } = useAuth()
  const restaurantPos = Boolean(
    currentOrganization && isRestaurantIndustry(currentOrganization.industry),
  )
  const [diningTables, setDiningTables] = useState<DiningTableRow[]>([])
  const [diningTablesError, setDiningTablesError] = useState<string | null>(null)
  const [selectedTableId, setSelectedTableId] = useState('')
  const [placeOrderBusy, setPlaceOrderBusy] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null)
  const [missingBarcode, setMissingBarcode] = useState<string | null>(null)
  const [addProductOpen, setAddProductOpen] = useState(false)
  const [productFlash, setProductFlash] = useState<string | null>(null)
  const dismissProductFlash = useCallback(() => setProductFlash(null), [])
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<'waiting' | 'success'>('waiting')
  const [paymentPhase, setPaymentPhase] = useState<PosPaymentPhase>('choose')
  const [checkoutOrderId, setCheckoutOrderId] = useState<string | null>(null)
  const [checkoutTotal, setCheckoutTotal] = useState(0)
  const [qrPayload, setQrPayload] = useState<string | null>(null)
  const [walletLaunchUrl, setWalletLaunchUrl] = useState<string | null>(null)
  const [walletPaymentHtml, setWalletPaymentHtml] = useState<string | null>(null)
  const [walletCheckoutAdapter, setWalletCheckoutAdapter] = useState<string | null>(null)
  const [checkoutWallets, setCheckoutWallets] = useState<OrderCheckoutWalletRow[]>([])
  const [selectedGatewayCode, setSelectedGatewayCode] = useState<string | null>(null)
  const [yonnaPhone, setYonnaPhone] = useState('')
  const [walletLoading, setWalletLoading] = useState(false)
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [receiptLabel, setReceiptLabel] = useState<string | null>(null)
  const checkoutWalletsCacheRef = useRef<{
    businessId: string
    wallets: OrderCheckoutWalletRow[]
  } | null>(null)

  const isTableServiceOrder = restaurantPos && Boolean(selectedTableId)

  const getProductById = useCallback(
    (productId: string) => businessProducts.find((p) => p.id === productId),
    [businessProducts],
  )

  const sellableForLine = useCallback(
    (fallback: Product) => {
      const live = getProductById(fallback.id) ?? fallback
      return productSellableUnits(live)
    },
    [getProductById],
  )

  const catalogStockSignature = useMemo(
    () =>
      businessProducts
        .map(
          (p) =>
            `${p.id}:${p.stock}:${p.reservedStock ?? 0}:${p.availableStock ?? ''}`,
        )
        .sort()
        .join('|'),
    [businessProducts],
  )

  const {
    cart,
    total: subtotal,
    itemCount,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
  } = useCart({ getProductById, catalogStockSignature })

  useEffect(() => {
    const orgId = currentOrganization?.id
    if (!orgId) return
    const poll = () => {
      void refreshBusinessProducts()
    }
    const intervalMs = 1000
    const id = window.setInterval(poll, intervalMs)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshBusinessProducts()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [currentOrganization?.id, refreshBusinessProducts])

  const products = businessProducts

  useEffect(() => {
    setSelectedTableId('')
    setDiningTables([])
    setDiningTablesError(null)
    if (!currentOrganization?.id || !restaurantPos) {
      return
    }
    let cancelled = false
    void fetchDiningTables(currentOrganization.id)
      .then((rows) => {
        if (!cancelled) {
          setDiningTables(rows.filter((t) => t.isActive))
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setDiningTablesError(
            e instanceof ApiError ? e.message : 'Could not load tables.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [currentOrganization?.id, restaurantPos])

  const handleProductAdd = useCallback(
    (product: (typeof products)[number]) => {
      const result = addToCart(product)
      if (result.ok) {
        void playPosScanSuccess()
        setScanFeedback({ variant: 'success', text: `${product.name} added to cart.` })
        return
      }
      void playPosScanError()
      if (result.reason === 'out_of_stock') {
        setScanFeedback({
          variant: 'error',
          text: `Out of stock — ${product.name} cannot be added.`,
        })
      } else {
        setScanFeedback({
          variant: 'error',
          text: `Cannot add more — ${product.name} is already at the available quantity limit (including items in this cart or reserved for checkout).`,
        })
      }
    },
    [addToCart],
  )

  const handleDetectedBarcode = (rawValue: string) => {
    setScannerOpen(false)
    setMissingBarcode(null)
    if (products.length === 0) {
      void playPosScanError()
      setScanFeedback({ variant: 'error', text: 'No products available to scan.' })
      return
    }

    const normalized = rawValue.replace(/\s+/g, '').toLowerCase()
    const matched = products.find(
      (product) => (product.barcodeValue ?? '').replace(/\s+/g, '').toLowerCase() === normalized,
    )

    if (!matched) {
      void playPosScanError()
      setMissingBarcode(rawValue)
      setScanFeedback({
        variant: 'error',
        text: `Barcode ${rawValue} is not in this catalog yet.`,
      })
      return
    }

    handleProductAdd(matched)
  }

  const resetCheckoutUi = useCallback(() => {
    setCheckoutOrderId(null)
    setPaymentPhase('choose')
    setQrPayload(null)
    setWalletLaunchUrl(null)
    setWalletPaymentHtml(null)
    setWalletCheckoutAdapter(null)
    setCheckoutWallets([])
    setSelectedGatewayCode(null)
    setYonnaPhone('')
    setCheckoutError(null)
    setWalletLoading(false)
    setPaymentBusy(false)
    setReceiptLabel(null)
    setPaymentStatus('waiting')
    checkoutWalletsCacheRef.current = null
  }, [])

  const closePaymentModal = useCallback(() => {
    const orderId = checkoutOrderId
    const orgId = currentOrganization?.id
    const shouldReleaseStock = paymentStatus === 'waiting' && orderId && orgId
    setPaymentModalOpen(false)
    resetCheckoutUi()
    if (shouldReleaseStock) {
      void cancelSaleOrder(orgId, orderId)
        .then(() => refreshBusinessProducts())
        .catch(() => {
          /* release is best-effort; order may already be paid */
        })
    }
  }, [
    checkoutOrderId,
    currentOrganization?.id,
    paymentStatus,
    resetCheckoutUi,
    refreshBusinessProducts,
  ])

  /** Walk-in / counter or non-restaurant: create order and open payment on this device. */
  const handleCharge = async () => {
    if (!currentOrganization || cart.length === 0) return
    if (isTableServiceOrder) return
    setCheckoutError(null)
    setReceiptLabel(null)
    setPaymentStatus('waiting')
    setPaymentPhase('choose')
    setQrPayload(null)
    setWalletLaunchUrl(null)
    setWalletPaymentHtml(null)
    setWalletCheckoutAdapter(null)
    setCheckoutWallets([])
    setSelectedGatewayCode(null)
    setYonnaPhone('')
    checkoutWalletsCacheRef.current = null
    setCheckoutOrderId(null)
    setPaymentModalOpen(true)
    setWalletLoading(true)
    try {
      const lines = cart.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
      }))
      const order = await createSaleOrder(currentOrganization.id, lines)
      setCheckoutOrderId(order.id)
      setCheckoutTotal(order.total)
      void refreshBusinessProducts()
    } catch (e) {
      setCheckoutError(e instanceof ApiError ? e.message : 'Could not create order.')
      setPaymentModalOpen(false)
    } finally {
      setWalletLoading(false)
    }
  }

  /** Restaurant + table: only create awaiting-payment order; staff collects payment from Orders. */
  const handlePlaceTableOrder = async () => {
    if (!currentOrganization || cart.length === 0 || !selectedTableId) return
    setPlaceOrderBusy(true)
    setScanFeedback(null)
    try {
      const lines = cart.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
      }))
      const order = await createSaleOrder(currentOrganization.id, lines, {
        diningTableId: selectedTableId,
      })
      clearCart()
      void refreshBusinessProducts()
      void playPosScanSuccess()
      setScanFeedback({
        variant: 'success',
        text: `Order ${order.publicCode} placed for this table. Open Orders → View details to collect payment.`,
      })
    } catch (e) {
      void playPosScanError()
      setScanFeedback({
        variant: 'error',
        text: e instanceof ApiError ? e.message : 'Could not place order.',
      })
    } finally {
      setPlaceOrderBusy(false)
    }
  }

  const handlePrimaryCheckout = () => {
    if (isTableServiceOrder) {
      void handlePlaceTableOrder()
    } else {
      void handleCharge()
    }
  }

  useEffect(() => {
    if (
      !paymentModalOpen ||
      !checkoutOrderId ||
      !currentOrganization ||
      paymentStatus !== 'waiting'
    ) {
      return
    }
    let cancelled = false
    void fetchOrderCheckoutWallets(currentOrganization.id)
      .then((wallets) => {
        if (!cancelled) {
          checkoutWalletsCacheRef.current = {
            businessId: currentOrganization.id,
            wallets,
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          checkoutWalletsCacheRef.current = null
        }
      })
    return () => {
      cancelled = true
    }
  }, [paymentModalOpen, checkoutOrderId, currentOrganization, paymentStatus])

  useEffect(() => {
    const hasWalletUi =
      Boolean(qrPayload) || Boolean(walletPaymentHtml) || Boolean(walletLaunchUrl)
    if (
      !paymentModalOpen ||
      !checkoutOrderId ||
      !currentOrganization ||
      paymentStatus !== 'waiting' ||
      paymentPhase !== 'wallet' ||
      !hasWalletUi
    ) {
      return
    }
    const tick = () => {
      void (async () => {
        try {
          const order = await fetchSaleOrder(currentOrganization.id, checkoutOrderId)
          if (order.status === 'paid') {
            setReceiptLabel(
              order.receipt
                ? `Receipt ${order.receipt.publicCode}`
                : 'Paid',
            )
            setPaymentStatus('success')
            clearCart()
            void refreshBusinessProducts()
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
    paymentModalOpen,
    checkoutOrderId,
    currentOrganization,
    paymentStatus,
    paymentPhase,
    qrPayload,
    walletPaymentHtml,
    walletLaunchUrl,
    clearCart,
    refreshBusinessProducts,
  ])

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
    if (!currentOrganization || !checkoutOrderId) return
    setCheckoutError(null)

    const cached = checkoutWalletsCacheRef.current
    let wallets: OrderCheckoutWalletRow[]
    if (cached && cached.businessId === currentOrganization.id) {
      wallets = cached.wallets
    } else {
      setPaymentBusy(true)
      try {
        wallets = await fetchOrderCheckoutWallets(currentOrganization.id)
        checkoutWalletsCacheRef.current = {
          businessId: currentOrganization.id,
          wallets,
        }
      } catch (e) {
        setCheckoutError(
          e instanceof ApiError ? e.message : 'Could not load wallets.',
        )
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
        const r = await startWalletCheckout(
          currentOrganization.id,
          checkoutOrderId,
          body,
        )
        applyWalletStartResult(r)
      } catch (e) {
        setPaymentPhase('choose')
        setCheckoutError(
          e instanceof ApiError ? e.message : 'Could not start wallet payment.',
        )
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
  }, [applyWalletStartResult, checkoutOrderId, currentOrganization])

  const handleConfirmWalletSelection = useCallback(async () => {
    if (!currentOrganization || !checkoutOrderId || !selectedGatewayCode) return
    const w = checkoutWallets.find((x) => x.code === selectedGatewayCode)
    const yonnaNeedsManualPhone =
      w?.checkoutAdapter === 'yonna_wallet' && !w.hasStoredPayerPhone
    if (yonnaNeedsManualPhone) {
      const digits = yonnaPhone.replace(/\D/g, '')
      if (digits.length < 7) {
        setCheckoutError(
          'Enter the customer phone number after +220 (at least 7 digits).',
        )
        return
      }
    }
    setCheckoutError(null)
    setPaymentPhase('wallet')
    setQrPayload(null)
    setWalletLaunchUrl(null)
    setWalletPaymentHtml(null)
    setWalletCheckoutAdapter(null)
    setPaymentBusy(true)
    try {
      const r = await startWalletCheckout(currentOrganization.id, checkoutOrderId, {
        gatewayCode: selectedGatewayCode,
        payerPhone: yonnaNeedsManualPhone ? yonnaPhone.trim() : undefined,
      })
      applyWalletStartResult(r)
    } catch (e) {
      setPaymentPhase('pick_wallet')
      setCheckoutError(
        e instanceof ApiError ? e.message : 'Could not start wallet payment.',
      )
    } finally {
      setPaymentBusy(false)
    }
  }, [
    applyWalletStartResult,
    checkoutOrderId,
    checkoutWallets,
    currentOrganization,
    selectedGatewayCode,
    yonnaPhone,
  ])

  const handleCashPay = async () => {
    if (!currentOrganization || !checkoutOrderId) return
    setCheckoutError(null)
    setPaymentBusy(true)
    try {
      const result = await confirmCashPayment(currentOrganization.id, checkoutOrderId)
      setReceiptLabel(`Receipt ${result.receipt.publicCode}`)
      setPaymentStatus('success')
      clearCart()
      void refreshBusinessProducts()
    } catch (e) {
      setCheckoutError(e instanceof ApiError ? e.message : 'Cash payment failed.')
    } finally {
      setPaymentBusy(false)
    }
  }

  const handleSimulateWallet = async () => {
    if (!currentOrganization || !checkoutOrderId || walletCheckoutAdapter !== 'simulator') return
    setCheckoutError(null)
    setPaymentBusy(true)
    try {
      await simulateWalletPayment(currentOrganization.id, checkoutOrderId)
      const order = await fetchSaleOrder(currentOrganization.id, checkoutOrderId)
      if (order.status === 'paid') {
        setReceiptLabel(
          order.receipt ? `Receipt ${order.receipt.publicCode}` : 'Paid',
        )
        setPaymentStatus('success')
        clearCart()
        void refreshBusinessProducts()
      }
    } catch (e) {
      setCheckoutError(
        e instanceof ApiError ? e.message : 'Could not complete wallet payment.',
      )
    } finally {
      setPaymentBusy(false)
    }
  }

  return (
    <div className="relative flex h-auto flex-col gap-6 lg:h-[calc(100vh-8rem)] lg:flex-row">
      <FlashNotice message={productFlash} onDismiss={dismissProductFlash} />
      <div className="flex flex-1 flex-col gap-6">
        <div className="relative flex min-h-[240px] flex-col items-center justify-center overflow-hidden rounded-2xl bg-slate-900 p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.25),transparent_55%)] opacity-60" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="relative mb-4 flex h-48 w-48 items-center justify-center rounded-xl border-2 border-teal-500/50">
              {scannerOpen ? (
                <motion.div
                  animate={{ y: [-80, 80, -80] }}
                  transition={{
                    repeat: Number.POSITIVE_INFINITY,
                    duration: 1.5,
                    ease: 'linear',
                  }}
                  className="h-1 w-full bg-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.8)]"
                />
              ) : (
                <ScanLine className="h-12 w-12 text-teal-500/50" />
              )}
            </div>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              disabled={scannerOpen || paymentModalOpen || placeOrderBusy}
              className="rounded-full bg-teal-600 px-6 py-2 font-medium text-white shadow-lg shadow-teal-900/50 transition-colors hover:bg-teal-500 disabled:opacity-70"
            >
              {scannerOpen ? 'Scanning...' : 'Scan barcode'}
            </button>
            {scanFeedback ? (
              <p
                role="status"
                aria-live="polite"
                className={`mt-3 text-sm ${
                  scanFeedback.variant === 'success' ? 'text-teal-200' : 'text-amber-300'
                }`}
              >
                {scanFeedback.text}
              </p>
            ) : null}
            {missingBarcode ? (
              <button
                type="button"
                onClick={() => setAddProductOpen(true)}
                className="mt-2 inline-flex items-center text-sm font-medium text-teal-200 underline hover:text-white"
              >
                Add this product now
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Manual product browse — desktop / large screens only (mobile POS is scan + cart) */}
        <div className="hidden flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:flex">
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search products manually..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-4 pl-10 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {products
                .filter((product) =>
                  product.name.toLowerCase().includes(searchTerm.toLowerCase()),
                )
                .map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    disabled={paymentModalOpen || placeOrderBusy}
                    onClick={() => handleProductAdd(product)}
                    className="flex flex-col items-center rounded-xl border border-slate-100 p-3 text-center transition-all hover:border-teal-500 hover:bg-teal-50 disabled:opacity-50"
                  >
                    <ProductThumb product={product} size="sm" className="mb-2 rounded-full" />
                    <span className="line-clamp-1 w-full text-sm font-medium text-slate-700">
                      {product.name}
                    </span>
                    <span className="mt-1 text-xs font-bold text-teal-600">
                      D{product.price}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex w-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm lg:max-h-none lg:w-96 lg:shrink-0">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="text-lg font-bold text-slate-800">Current Order</h2>
          <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
            {itemCount} items
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <AnimatePresence mode="popLayout">
            {cart.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full flex-col items-center justify-center space-y-4 text-slate-400"
              >
                <ShoppingCart className="h-16 w-16 opacity-20" />
                <p>Scan items to add to cart</p>
              </motion.div>
            ) : (
              cart.map((item) => (
                <motion.div
                  key={item.product.id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <h4 className="truncate text-sm font-medium text-slate-800">
                      {item.product.name}
                    </h4>
                    <p className="text-sm font-semibold text-teal-600">
                      D{item.product.price}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center rounded-lg border border-slate-200 bg-white">
                      <button
                        type="button"
                        disabled={paymentModalOpen || placeOrderBusy}
                        onClick={() => updateQuantity(item.product.id, -1)}
                        aria-label={`Decrease quantity for ${item.product.name}`}
                        className="p-1.5 text-slate-500 hover:text-teal-600"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={
                          paymentModalOpen ||
                          placeOrderBusy ||
                          item.quantity >= sellableForLine(item.product)
                        }
                        onClick={() => updateQuantity(item.product.id, 1)}
                        aria-label={`Increase quantity for ${item.product.name}`}
                        className="p-1.5 text-slate-500 hover:text-teal-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={paymentModalOpen || placeOrderBusy}
                      onClick={() => removeFromCart(item.product.id)}
                      aria-label={`Remove ${item.product.name} from cart`}
                      className="rounded-lg p-2 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        <div className="rounded-b-2xl border-t border-slate-100 bg-slate-50 p-4">
          {restaurantPos ? (
            <div className="mb-4">
              <label
                htmlFor="pos-table-select"
                className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-500 uppercase"
              >
                Table (manual order)
              </label>
              <select
                id="pos-table-select"
                value={selectedTableId}
                disabled={paymentModalOpen || placeOrderBusy}
                onChange={(e) => setSelectedTableId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
              >
                <option value="">Walk-in / counter (no table)</option>
                {diningTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              {selectedTableId ? (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  {/* Uses <strong>Order placement</strong> only — payment is completed from{' '}
                  <strong>Orders</strong> → View details. */}
                </p>
              ) : null}
              {diningTablesError ? (
                <p className="mt-1 text-xs text-amber-700">{diningTablesError}</p>
              ) : diningTables.length === 0 && !diningTablesError ? (
                <p className="mt-1 text-xs text-slate-500">
                  Add tables in Restaurant setup to assign orders to a table.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="mb-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Tax (0%)</span>
              <span>D0.00</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-bold text-slate-800">
              <span>Total</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={clearCart}
              disabled={cart.length === 0 || paymentModalOpen || placeOrderBusy}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => void handlePrimaryCheckout()}
              disabled={cart.length === 0 || paymentModalOpen || placeOrderBusy}
              className="flex flex-1 flex-col items-center justify-center rounded-xl bg-teal-600 py-3 text-lg font-bold text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
            >
              {placeOrderBusy ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Placing…
                </span>
              ) : isTableServiceOrder ? (
                <>
                  <span>Order placement</span>
                  <span className="mt-0.5 text-sm font-semibold opacity-90">
                    {formatMoney(subtotal)}
                  </span>
                </>
              ) : (
                <>Charge {formatMoney(subtotal)}</>
              )}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {paymentModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <ModalOverlay
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => {
                if (paymentStatus === 'waiting') {
                  closePaymentModal()
                }
              }}
            />
            <CenteredModal className="relative z-10 flex max-h-[min(92vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              {paymentStatus === 'waiting' ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                  <div className="shrink-0 px-6 pt-6 text-center">
                    <h2 className="text-2xl font-bold text-slate-800">Checkout</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      cash or wallet
                    </p>
                  </div>
                  {walletLoading || !checkoutOrderId ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16">
                      <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
                      <span className="text-sm text-slate-500">Creating order…</span>
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1 space-y-4 px-6 pb-6 pt-4">
                      <div className="rounded-xl bg-slate-50 p-4 text-center">
                        <p className="mb-1 text-sm text-slate-500">Amount due</p>
                        <p className="text-3xl font-bold text-teal-600">
                          {formatMoney(checkoutTotal)}
                        </p>
                      </div>
                      {checkoutError ? (
                        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                          {checkoutError}
                        </p>
                      ) : null}

                      {paymentPhase === 'choose' ? (
                        <div className="space-y-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <button
                              type="button"
                              disabled={paymentBusy}
                              onClick={() => void handleCashPay()}
                              className="flex min-h-[7rem] flex-col items-start gap-2 rounded-xl border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-teal-300 hover:bg-teal-50/40 disabled:pointer-events-none disabled:opacity-50"
                            >
                              <span className="text-teal-600">
                                {paymentBusy ? (
                                  <Loader2 className="h-7 w-7 animate-spin" />
                                ) : (
                                  <Banknote className="h-7 w-7 stroke-[1.25]" />
                                )}
                              </span>
                              <span>
                                <span className="block text-sm font-semibold text-slate-900">Cash</span>
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={paymentBusy}
                              onClick={() => void handleWalletEntryClick()}
                              className="flex min-h-[7rem] flex-col items-start gap-2 rounded-xl border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-teal-300 hover:bg-teal-50/40 disabled:pointer-events-none disabled:opacity-50"
                            >
                              <span className="text-slate-800">
                                {paymentBusy ? (
                                  <Loader2 className="h-7 w-7 animate-spin text-slate-600" />
                                ) : (
                                  <CreditCard className="h-7 w-7 stroke-[1.25]" />
                                )}
                              </span>
                              <span>
                                <span className="block text-sm font-semibold text-slate-900">Wallet</span>
                              </span>
                            </button>
                          </div>
                        </div>
                      ) : paymentPhase === 'pick_wallet' ? (
                        <div className="space-y-3 text-left">
                          <ul className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">
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
                                      setCheckoutError(null)
                                    }}
                                    className={`w-full rounded-xl border-2 p-3 text-left text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50 ${
                                      selected
                                        ? 'border-teal-500 bg-teal-50/70 shadow-sm ring-2 ring-teal-500/20'
                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                  >
                                    <span className="font-semibold text-slate-900">{w.name}</span>
                                    <span className="mt-0.5 block text-xs text-slate-500">{w.code}</span>
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
                                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                  Pay phone is saved under Merchant API — no need to type it here.
                                </p>
                              )
                            }
                            return (
                              <div>
                                <label className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                                  Customer phone
                                </label>
                                <input
                                  type="tel"
                                  value={yonnaPhone}
                                  onChange={(e) => setYonnaPhone(e.target.value)}
                                  placeholder="+220 — then type the number"
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                              </div>
                            )
                          })()}
                          {selectedGatewayCode ? (
                            <button
                              type="button"
                              disabled={paymentBusy}
                              onClick={() => void handleConfirmWalletSelection()}
                              className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                            >
                              {paymentBusy ? 'Starting…' : 'Get QR code'}
                            </button>
                          ) : (
                            <p className="rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-600">
                              Choose a provider to enable Get QR code.
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentPhase('choose')
                              setCheckoutWallets([])
                              setSelectedGatewayCode(null)
                              setYonnaPhone('')
                              setCheckoutError(null)
                            }}
                            className="w-full text-sm font-medium text-teal-600 hover:underline"
                          >
                            Back
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4 text-center">
                          <p className="text-sm font-semibold text-slate-800">
                            Customer pays with their wallet
                          </p>
                          {walletPaymentHtml && walletCheckoutAdapter !== 'yonna_wallet' ? (
                            <iframe
                              title="Wallet checkout"
                              className="mx-auto h-[min(320px,42vh)] w-full max-w-sm rounded-lg border border-slate-200 bg-white"
                              srcDoc={walletPaymentHtml}
                              sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
                            />
                          ) : null}
                          <div className="flex flex-col items-center">
                            {qrPayload ? (
                              <div className="flex justify-center p-1">
                                <QRCode value={qrPayload} size={180} level="M" />
                              </div>
                            ) : walletPaymentHtml && walletCheckoutAdapter !== 'yonna_wallet' ? null : (
                              <div className="flex justify-center py-6">
                                <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
                              </div>
                            )}
                            {walletLaunchUrl?.trim() && walletCheckoutAdapter !== 'yonna_wallet' ? (
                              <a
                                href={walletLaunchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 text-sm font-medium text-teal-600 hover:underline"
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
                              className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              Simulate customer paid (demo)
                            </button>
                          ) : (
                            <p className="text-xs text-slate-500">
                              When the customer completes payment, this screen will confirm automatically.
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
                              setCheckoutError(null)
                            }}
                            className="w-full text-sm font-medium text-teal-600 hover:underline"
                          >
                            Change payment method
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center bg-emerald-50 p-10 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring' }}
                    className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
                  >
                    <CheckCircle2 className="h-10 w-10" />
                  </motion.div>
                  <h2 className="mb-2 text-2xl font-bold text-emerald-800">Payment Successful!</h2>
                  <p className="mb-2 font-medium text-emerald-600">
                    {formatMoney(checkoutTotal)} received
                  </p>
                  {receiptLabel ? (
                    <p className="mb-8 text-sm text-emerald-700">{receiptLabel}</p>
                  ) : (
                    <p className="mb-8 text-sm text-emerald-700">Recorded</p>
                  )}
                  <button
                    type="button"
                    onClick={() => closePaymentModal()}
                    className="w-full rounded-xl bg-emerald-600 py-3 font-bold text-white transition-colors hover:bg-emerald-700"
                  >
                    New Order
                  </button>
                </div>
              )}
            </CenteredModal>
          </div>
        ) : null}
      </AnimatePresence>
      <CameraBarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        minimalUI
        onDetected={handleDetectedBarcode}
      />
      {addProductOpen && currentOrganization ? (
        <AddProductModal
          businessId={currentOrganization.id}
          onClose={() => setAddProductOpen(false)}
          onCreated={() => {
            void refreshBusinessProducts()
            setProductFlash('Product created successfully.')
          }}
        />
      ) : null}
    </div>
  )
}
