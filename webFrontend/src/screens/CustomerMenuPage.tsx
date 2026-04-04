import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCircle2,
  ChevronLeft,
  Minus,
  Plus,
  QrCode,
  Utensils,
} from 'lucide-react'

import { ProductThumb } from '../components/products/ProductThumb'
import { BottomSheet } from '../components/ui/BottomSheet'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { useCart } from '../features/cart/useCart'
import { ApiError, fetchPublicBusinessMenu } from '../services/subscriptionApi'
import type { Product } from '../types'
import { formatMoney } from '../utils/formatMoney'

export function CustomerMenuPage() {
  const { businessId = '', tableId = 'T-01' } = useParams()
  const [activeCategory, setActiveCategory] = useState('All')
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [orderNumber, setOrderNumber] = useState<number | null>(null)
  const [orderStatus, setOrderStatus] = useState<'browsing' | 'paying' | 'success'>(
    'browsing',
  )
  const { cart, total, itemCount, addToCart, updateQuantity, clearCart } = useCart(
    {
      minQuantity: 0,
      removeWhenZero: true,
    },
  )

  const [menuItems, setMenuItems] = useState<Product[]>([])
  const [businessName, setBusinessName] = useState('')
  const [menuLoading, setMenuLoading] = useState(false)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [menuHint, setMenuHint] = useState<string | null>(null)

  const missingBusinessId = !businessId
  const displayMenuLoading = missingBusinessId ? false : menuLoading
  const displayMenuError = missingBusinessId
    ? 'This menu link is missing a business ID.'
    : menuError
  const displayMenuItems = missingBusinessId ? [] : menuItems

  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      setMenuLoading(true)
      setMenuError(null)
      try {
        const { business, products } = await fetchPublicBusinessMenu(businessId)
        if (!cancelled) {
          setBusinessName(business.name)
          setMenuItems(products)
        }
      } catch (error) {
        if (!cancelled) {
          setMenuItems([])
          setBusinessName('')
          setMenuError(
            error instanceof ApiError ? error.message : 'Could not load this menu.',
          )
        }
      } finally {
        if (!cancelled) {
          setMenuLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [businessId])

  useEffect(() => {
    if (!menuHint) return
    const t = window.setTimeout(() => setMenuHint(null), 3500)
    return () => window.clearTimeout(t)
  }, [menuHint])

  const categories = ['All', ...new Set(displayMenuItems.map((item) => item.category))]
  const filteredItems =
    activeCategory === 'All'
      ? displayMenuItems
      : displayMenuItems.filter((item) => item.category === activeCategory)

  if (displayMenuLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-slate-600">
        Loading menu…
      </div>
    )
  }

  if (displayMenuError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <p className="max-w-md text-slate-700">{displayMenuError}</p>
        <p className="mt-2 text-sm text-slate-500">
          The restaurant menu is only available for businesses with industry set to Restaurant.
        </p>
      </div>
    )
  }

  if (orderStatus === 'success') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
        >
          <CheckCircle2 className="h-12 w-12" />
        </motion.div>
        <h1 className="mb-2 text-3xl font-bold text-slate-800">Order Placed!</h1>
        <p className="mb-8 max-w-sm text-slate-600">
          Your order has been sent to the kitchen. We will bring it to {tableId}{' '}
          shortly.
        </p>
        <div className="mb-8 w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="mb-1 text-sm text-slate-500">Order Number</p>
          <p className="font-mono text-2xl font-bold text-slate-800">
            #ORD-{orderNumber ?? 0}
          </p>
        </div>
        <button
          onClick={() => {
            setOrderStatus('browsing')
            clearCart()
          }}
          className="font-medium text-teal-600 hover:underline"
        >
          Order more items
        </button>
      </div>
    )
  }

  if (orderStatus === 'paying') {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <header className="sticky top-0 z-10 flex items-center border-b border-slate-200 bg-white p-4">
          <button
            onClick={() => setOrderStatus('browsing')}
            aria-label="Back to menu"
            className="-ml-2 p-2 text-slate-600"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="ml-2 text-lg font-bold text-slate-800">Checkout</h1>
        </header>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center p-6">
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="mb-2 text-xl font-bold text-slate-800">Pay via Wallet</h2>
            <p className="mb-8 text-sm text-slate-500">Scan with your mobile money app</p>
            <div className="mb-8 inline-block rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-inner">
              <QrCode className="h-48 w-48 text-slate-800" />
            </div>
            <div className="mb-6 flex items-center justify-between border-t border-slate-100 py-4">
              <span className="font-medium text-slate-600">Total to pay</span>
              <span className="text-2xl font-bold text-teal-600">{formatMoney(total)}</span>
            </div>
            <button
              onClick={() => {
                setOrderNumber(Math.floor(Math.random() * 10000))
                setOrderStatus('success')
              }}
              className="w-full rounded-xl bg-teal-600 py-4 text-lg font-bold text-white shadow-md shadow-teal-600/20 transition-colors hover:bg-teal-700"
            >
              Simulate Payment
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-10 bg-white px-4 pt-8 pb-4 shadow-sm">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                {businessName || 'Menu'}
              </h1>
              <p className="mt-1 flex items-center font-medium text-teal-600">
                <Utensils className="mr-1 h-4 w-4" /> {tableId}
              </p>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`rounded-full px-5 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeCategory === category
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-4">
        {menuHint ? (
          <p
            role="status"
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900"
          >
            {menuHint}
          </p>
        ) : null}
        {filteredItems.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            No items in this menu yet. Add products in the merchant dashboard.
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filteredItems.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
            >
              <ProductThumb product={item} className="h-24 w-24 flex-shrink-0" />
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <h3 className="mb-1 font-bold leading-tight text-slate-800">
                    {item.name}
                  </h3>
                  <p className="line-clamp-2 text-xs text-slate-500">
                    {item.description ?? ''}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-bold text-teal-600">D{item.price}</span>
                  {(item.availableStock ?? item.stock) <= 0 ? (
                    <span className="text-xs font-medium text-red-600">Sold out</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const r = addToCart(item)
                        if (!r.ok) {
                          setMenuHint(
                            r.reason === 'out_of_stock'
                              ? `${item.name} is out of stock.`
                              : `Maximum quantity for ${item.name} is already in your cart.`,
                          )
                        }
                      }}
                      aria-label={`Add ${item.name} to cart`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-teal-600 transition-colors hover:bg-teal-100"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </main>

      <AnimatePresence>
        {itemCount > 0 && !isCartOpen ? (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed right-0 bottom-6 left-0 z-20 mx-auto max-w-3xl px-4"
          >
            <button
              onClick={() => setIsCartOpen(true)}
              className="flex w-full items-center justify-between rounded-2xl bg-slate-900 p-4 text-white shadow-xl"
            >
              <div className="flex items-center">
                <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-teal-500 font-bold">
                  {itemCount}
                </div>
                <span className="font-medium">View Order</span>
              </div>
              <span className="font-bold">{formatMoney(total)}</span>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isCartOpen ? (
          <>
            <ModalOverlay
              className="fixed inset-0 z-30 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsCartOpen(false)}
            />
            <BottomSheet className="fixed right-0 bottom-0 left-0 z-40 mx-auto flex max-h-[85vh] max-w-3xl flex-col rounded-t-3xl bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 p-4">
                <h2 className="text-xl font-bold text-slate-800">Your Order</h2>
                <button
                  onClick={() => setIsCartOpen(false)}
                  aria-label="Close order sheet"
                  className="rounded-full bg-slate-100 p-2 text-slate-400"
                >
                  <ChevronLeft className="h-5 w-5 -rotate-90" />
                </button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-4">
                    <ProductThumb product={item.product} className="h-16 w-16" />
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-slate-800">
                        {item.product.name}
                      </h4>
                      <p className="text-sm font-semibold text-teal-600">
                        D{item.product.price}
                      </p>
                    </div>
                    <div className="flex items-center rounded-full bg-slate-100 p-1">
                      <button
                        onClick={() => updateQuantity(item.product.id, -1)}
                        aria-label={`Decrease quantity for ${item.product.name}`}
                        className="flex h-8 w-8 items-center justify-center text-slate-600"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={
                          item.quantity >=
                          (item.product.availableStock ?? item.product.stock)
                        }
                        onClick={() => updateQuantity(item.product.id, 1)}
                        aria-label={`Increase quantity for ${item.product.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-t-3xl border-t border-slate-100 bg-slate-50 p-6 pb-8">
                <div className="mb-6 flex items-center justify-between">
                  <span className="font-medium text-slate-500">Total Amount</span>
                  <span className="text-2xl font-bold text-slate-800">
                    {formatMoney(total)}
                  </span>
                </div>
                <button
                  onClick={() => setOrderStatus('paying')}
                  className="w-full rounded-xl bg-teal-600 py-4 text-lg font-bold text-white shadow-lg shadow-teal-600/30 transition-transform active:scale-[0.98]"
                >
                  Place Order & Pay
                </button>
              </div>
            </BottomSheet>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
