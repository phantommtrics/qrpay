import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, ChevronDown, ChevronLeft, Minus, Plus, QrCode, Utensils } from 'lucide-react'

import { ProductThumb } from '../components/products/ProductThumb'
import { BottomSheet } from '../components/ui/BottomSheet'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { useCart, type AddToCartResult } from '../features/cart/useCart'
import { ApiError, fetchRestaurantGuestMenu, type GuestMenuTreeNode } from '../services/subscriptionApi'
import { postPublicRestaurantOrder } from '../services/salesApi'
import type { Product } from '../types'
import { formatMoney } from '../utils/formatMoney'

function MenuBranch({
  node,
  depth,
  onAdd,
  menuHint,
  setMenuHint,
}: {
  node: GuestMenuTreeNode
  depth: number
  onAdd: (item: Product) => AddToCartResult
  menuHint: string | null
  setMenuHint: (v: string | null) => void
}) {
  const [open, setOpen] = useState(depth < 2)
  const hasProducts = node.products.length > 0
  const hasChildren = node.children.length > 0
  const pad = Math.min(depth, 4) * 12

  if (!hasProducts && !hasChildren) {
    return null
  }

  return (
    <div className="mb-3" style={{ paddingLeft: pad ? pad - (depth > 0 ? 8 : 0) : 0 }}>
      {hasChildren || hasProducts ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mb-2 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm"
        >
          <span className="font-semibold text-slate-800">{node.name}</span>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      ) : null}

      {open && hasProducts ? (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {node.products.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
            >
              <ProductThumb product={item} className="h-20 w-20 flex-shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div>
                  <h3 className="font-bold leading-tight text-slate-800">{item.name}</h3>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.description ?? ''}</p>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-bold text-teal-600">{formatMoney(item.price)}</span>
                  {(item.availableStock ?? item.stock) <= 0 ? (
                    <span className="text-xs font-medium text-red-600">Sold out</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const r = onAdd(item)
                        if (!r.ok) {
                          setMenuHint(
                            r.reason === 'out_of_stock'
                              ? `${item.name} is out of stock.`
                              : `Maximum quantity for ${item.name} is already in your cart.`,
                          )
                        }
                      }}
                      aria-label={`Add ${item.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-teal-600 hover:bg-teal-100"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : null}

      {open &&
        node.children.map((child) => (
          <MenuBranch
            key={child.id}
            node={child}
            depth={depth + 1}
            onAdd={onAdd}
            menuHint={menuHint}
            setMenuHint={setMenuHint}
          />
        ))}
    </div>
  )
}

export function RestaurantGuestMenuPage() {
  const { businessSlug = '', tableToken = '' } = useParams()
  const [businessName, setBusinessName] = useState('')
  const [tableLabel, setTableLabel] = useState('')
  const [categories, setCategories] = useState<GuestMenuTreeNode[]>([])
  const [uncategorized, setUncategorized] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [orderNumber, setOrderNumber] = useState<number | null>(null)
  const [publicCode, setPublicCode] = useState<string | null>(null)
  const [orderStatus, setOrderStatus] = useState<'browsing' | 'paying' | 'success'>('browsing')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { cart, total, itemCount, addToCart, updateQuantity, clearCart } = useCart({
    minQuantity: 0,
    removeWhenZero: true,
  })
  const [menuHint, setMenuHint] = useState<string | null>(null)

  const loadMenu = useCallback(async () => {
    if (!businessSlug || !tableToken) {
      setLoadError('This menu link is invalid.')
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const data = await fetchRestaurantGuestMenu(businessSlug, tableToken)
      setBusinessName(data.business.name)
      setTableLabel(data.table.label)
      setCategories(data.menu.categories)
      setUncategorized(data.menu.uncategorizedProducts)
    } catch (error) {
      setBusinessName('')
      setTableLabel('')
      setCategories([])
      setUncategorized([])
      setLoadError(
        error instanceof ApiError ? error.message : 'Could not load this menu.',
      )
    } finally {
      setLoading(false)
    }
  }, [businessSlug, tableToken])

  useEffect(() => {
    void loadMenu()
  }, [loadMenu])

  useEffect(() => {
    if (!menuHint) return
    const t = window.setTimeout(() => setMenuHint(null), 3500)
    return () => window.clearTimeout(t)
  }, [menuHint])

  const handleAdd = useCallback(
    (item: Product) => {
      return addToCart(item)
    },
    [addToCart],
  )

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-slate-600">
        <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
        <p className="mt-4 text-sm">Loading menu…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <p className="max-w-md text-slate-700">{loadError}</p>
        <p className="mt-2 text-sm text-slate-500">
          Ask staff for a current QR code. Menus are only available for restaurant businesses with an active
          table link.
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
        <h1 className="mb-2 text-3xl font-bold text-slate-800">Order placed</h1>
        <p className="mb-2 max-w-sm text-slate-600">
          Show this code to staff if you need help. Table {tableLabel}.
        </p>
        <div className="mb-6 w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="mb-1 text-sm text-slate-500">Order code</p>
          <p className="font-mono text-2xl font-bold text-slate-800">{publicCode}</p>
          {orderNumber !== null ? (
            <p className="mt-3 text-xs text-slate-400">Reference #{orderNumber}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            setOrderStatus('browsing')
            clearCart()
            setPublicCode(null)
            setOrderNumber(null)
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
            type="button"
            onClick={() => {
              setOrderStatus('browsing')
              setSubmitError(null)
            }}
            aria-label="Back to menu"
            className="-ml-2 p-2 text-slate-600"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="ml-2 text-lg font-bold text-slate-800">Checkout</h1>
        </header>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center p-6">
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="mb-2 text-xl font-bold text-slate-800">Pay via wallet</h2>
            <p className="mb-6 text-sm text-slate-500">Scan with your mobile money app (demo)</p>
            <div className="mb-6 inline-block rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-inner">
              <QrCode className="h-48 w-48 text-slate-800" />
            </div>
            <div className="mb-6 flex items-center justify-between border-t border-slate-100 py-4">
              <span className="font-medium text-slate-600">Total</span>
              <span className="text-2xl font-bold text-teal-600">{formatMoney(total)}</span>
            </div>
            {submitError ? (
              <p className="mb-4 text-sm text-red-600">{submitError}</p>
            ) : null}
            <button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitError(null)
                setSubmitting(true)
                try {
                  const lines = cart.map((c) => ({
                    productId: c.product.id,
                    quantity: c.quantity,
                  }))
                  const order = await postPublicRestaurantOrder(businessSlug, tableToken, lines)
                  setPublicCode(order.publicCode)
                  setOrderNumber(Math.floor(Math.random() * 10000))
                  setOrderStatus('success')
                } catch (e) {
                  setSubmitError(
                    e instanceof ApiError ? e.message : 'Could not place order. Try again.',
                  )
                } finally {
                  setSubmitting(false)
                }
              }}
              className="w-full rounded-xl bg-teal-600 py-4 text-lg font-bold text-white shadow-md shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-60"
            >
              {submitting ? 'Placing order…' : 'Place order'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-10 bg-white px-4 pt-6 pb-3 shadow-sm">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold text-slate-800">{businessName || 'Menu'}</h1>
          <p className="mt-1 flex items-center text-sm font-medium text-teal-600">
            <Utensils className="mr-1 h-4 w-4" /> Table {tableLabel}
          </p>
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

        {categories.map((node) => (
          <MenuBranch
            key={node.id}
            node={node}
            depth={0}
            onAdd={handleAdd}
            menuHint={menuHint}
            setMenuHint={setMenuHint}
          />
        ))}

        {uncategorized.length > 0 ? (
          <div className="mt-6">
            <h2 className="mb-3 px-1 text-sm font-semibold tracking-wide text-slate-500 uppercase">
              Other
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {uncategorized.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
                >
                  <ProductThumb product={item} className="h-20 w-20 flex-shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-slate-800">{item.name}</h3>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.description ?? ''}</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-bold text-teal-600">{formatMoney(item.price)}</span>
                      {(item.availableStock ?? item.stock) <= 0 ? (
                        <span className="text-xs font-medium text-red-600">Sold out</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const r = handleAdd(item)
                            if (!r.ok) {
                              setMenuHint(
                                r.reason === 'out_of_stock'
                                  ? `${item.name} is out of stock.`
                                  : `Maximum quantity for ${item.name} is already in your cart.`,
                              )
                            }
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-teal-600 hover:bg-teal-100"
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ) : null}

        {!loading && categories.length === 0 && uncategorized.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">No items in this section.</p>
        ) : null}
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
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="flex w-full items-center justify-between rounded-2xl bg-slate-900 p-4 text-white shadow-xl"
            >
              <div className="flex items-center">
                <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-teal-500 font-bold">
                  {itemCount}
                </div>
                <span className="font-medium">View order</span>
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
                <h2 className="text-xl font-bold text-slate-800">Your order</h2>
                <button
                  type="button"
                  onClick={() => setIsCartOpen(false)}
                  aria-label="Close"
                  className="rounded-full bg-slate-100 p-2 text-slate-400"
                >
                  <ChevronLeft className="h-5 w-5 -rotate-90" />
                </button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-4">
                    <ProductThumb product={item.product} className="h-16 w-16" />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-slate-800">{item.product.name}</h4>
                      <p className="text-sm font-semibold text-teal-600">
                        {formatMoney(item.product.price)}
                      </p>
                    </div>
                    <div className="flex items-center rounded-full bg-slate-100 p-1">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="flex h-8 w-8 items-center justify-center text-slate-600"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                      <button
                        type="button"
                        disabled={
                          item.quantity >= (item.product.availableStock ?? item.product.stock)
                        }
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm disabled:opacity-40"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-t-3xl border-t border-slate-100 bg-slate-50 p-6 pb-8">
                <div className="mb-6 flex items-center justify-between">
                  <span className="font-medium text-slate-500">Total</span>
                  <span className="text-2xl font-bold text-slate-800">{formatMoney(total)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOrderStatus('paying')}
                  className="w-full rounded-xl bg-teal-600 py-4 text-lg font-bold text-white shadow-lg shadow-teal-600/30"
                >
                  Continue to checkout
                </button>
              </div>
            </BottomSheet>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
