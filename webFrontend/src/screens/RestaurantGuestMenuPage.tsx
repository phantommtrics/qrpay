import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Utensils,
} from 'lucide-react'

import { ProductThumb } from '../components/products/ProductThumb'
import { BottomSheet } from '../components/ui/BottomSheet'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { useCart, type AddToCartResult } from '../features/cart/useCart'
import { ApiError, fetchRestaurantGuestMenu, type GuestMenuTreeNode } from '../services/subscriptionApi'
import { postPublicRestaurantOrder } from '../services/salesApi'
import type { Product } from '../types'
import { formatMoney } from '../utils/formatMoney'
import { productSellableUnits } from '../utils/productStock'

function sortGuestNodesByOrder(nodes: GuestMenuTreeNode[]): GuestMenuTreeNode[] {
  return [...nodes].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

/** Leaf subcategories first, then branches; within each group by sort order. */
function sortGuestChildrenLeavesFirst(nodes: GuestMenuTreeNode[]): GuestMenuTreeNode[] {
  return [...nodes].sort((a, b) => {
    const aLeaf = a.children.length === 0
    const bLeaf = b.children.length === 0
    if (aLeaf !== bLeaf) {
      return aLeaf ? -1 : 1
    }
    return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  })
}

/** Square frame: photo fills with cover; emoji tiles align to same box. */
function GuestProductImageFrame({
  product,
  className = 'h-20 w-20',
}: {
  product: Product
  className?: string
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-inset ring-slate-900/5 ${className}`}
    >
      <div className="absolute inset-0">
        <ProductThumb
          product={product}
          size="fill"
          imageFit="cover"
          imageAlt={product.name}
          className="rounded-none"
        />
      </div>
    </div>
  )
}

type GuestMenuBanner = { message: string; variant: 'success' | 'warning' } | null

function GuestMenuProductCard({
  item,
  onAdd,
  setMenuHint,
}: {
  item: Product
  onAdd: (item: Product) => AddToCartResult
  setMenuHint: Dispatch<SetStateAction<GuestMenuBanner>>
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
    >
      <GuestProductImageFrame product={item} />
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <h3 className="font-bold leading-tight text-slate-800">{item.name}</h3>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.description ?? ''}</p>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-bold text-teal-600">{formatMoney(item.price)}</span>
          {productSellableUnits(item) <= 0 ? (
            <span className="text-xs font-medium text-red-600">Sold out</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                const r = onAdd(item)
                if (!r.ok) {
                  setMenuHint({
                    message:
                      r.reason === 'out_of_stock'
                        ? `${item.name} is out of stock.`
                        : `Maximum quantity for ${item.name} is already in your cart.`,
                    variant: 'warning',
                  })
                } else {
                  setMenuHint({
                    message: `${item.name} added to your cart.`,
                    variant: 'success',
                  })
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
  const [menuHint, setMenuHint] = useState<GuestMenuBanner>(null)
  /** Drill-down path: empty = top-level categories only. */
  const [navStack, setNavStack] = useState<GuestMenuTreeNode[]>([])

  const productById = useMemo(() => {
    const m = new Map<string, Product>()
    const walk = (nodes: GuestMenuTreeNode[]) => {
      for (const n of nodes) {
        for (const p of n.products) {
          m.set(p.id, p)
        }
        walk(n.children)
      }
    }
    walk(categories)
    for (const p of uncategorized) {
      m.set(p.id, p)
    }
    return m
  }, [categories, uncategorized])

  const getProductById = useCallback(
    (productId: string) => productById.get(productId),
    [productById],
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
      Array.from(productById.values())
        .map(
          (p) =>
            `${p.id}:${p.stock}:${p.reservedStock ?? 0}:${p.availableStock ?? ''}`,
        )
        .sort()
        .join('|'),
    [productById],
  )

  const { cart, total, itemCount, addToCart, updateQuantity, clearCart } = useCart({
    minQuantity: 0,
    removeWhenZero: true,
    getProductById,
    catalogStockSignature,
  })

  const refreshMenuStock = useCallback(async () => {
    if (!businessSlug || !tableToken) return
    try {
      const data = await fetchRestaurantGuestMenu(businessSlug, tableToken)
      setCategories(data.menu.categories)
      setUncategorized(data.menu.uncategorizedProducts)
    } catch {
      /* keep last loaded menu */
    }
  }, [businessSlug, tableToken])

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
    if (orderStatus !== 'browsing') return
    const tick = () => {
      void refreshMenuStock()
    }
    const iv = window.setInterval(tick, 1000)
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void refreshMenuStock()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [orderStatus, refreshMenuStock])

  useEffect(() => {
    if (!menuHint) return
    const t = window.setTimeout(() => setMenuHint(null), 3500)
    return () => window.clearTimeout(t)
  }, [menuHint])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
  }, [navStack])

  const currentNode = navStack.length > 0 ? navStack[navStack.length - 1] : null
  const ancestorTrail =
    navStack.length > 1 ? navStack.slice(0, -1).map((n) => n.name).join(' · ') : null

  const goBackMenu = () => {
    setNavStack((s) => s.slice(0, -1))
  }

  const enterCategory = (node: GuestMenuTreeNode) => {
    setNavStack((s) => [...s, node])
  }

  const handleAdd = useCallback(
    (item: Product) => {
      return addToCart(item)
    },
    [addToCart],
  )

  const rootCategories = useMemo(
    () =>
      sortGuestNodesByOrder(categories).filter(
        (n) => n.children.length > 0 || n.products.length > 0,
      ),
    [categories],
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
            setIsCartOpen(false)
            setMenuHint(null)
            setSubmitError(null)
            setNavStack([])
            void loadMenu()
            if (typeof window !== 'undefined') {
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }
          }}
          className="rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white shadow-md shadow-teal-600/25 hover:bg-teal-700"
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
          <h1 className="ml-2 text-lg font-bold text-slate-800">Confirm</h1>
        </header>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col p-6 pb-10">
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-800">Order summary</h2>
            <ul className="mb-6 max-h-[min(50vh,22rem)] space-y-3 overflow-y-auto border-b border-slate-100 pb-4">
              {cart.map((line) => (
                <li key={line.product.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{line.product.name}</p>
                    <p className="mt-0.5 text-slate-500">
                      {formatMoney(line.product.price)} × {line.quantity}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-slate-800">
                    {formatMoney(line.product.price * line.quantity)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mb-6 flex items-center justify-between">
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
                  clearCart()
                  setIsCartOpen(false)
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
              {submitting ? 'Confirming…' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white shadow-sm">
        <div className="mx-auto max-w-3xl px-4 pt-4 pb-3">
          {currentNode ? (
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={goBackMenu}
                aria-label="Back"
                className="-ml-2 mt-0.5 shrink-0 rounded-full p-2 text-slate-600 hover:bg-slate-100"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold leading-tight text-slate-900 sm:text-2xl">
                  {currentNode.name}
                </h1>
                {ancestorTrail ? (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{ancestorTrail}</p>
                ) : null}
                <p className="mt-1 flex items-center text-sm font-medium text-teal-600">
                  <Utensils className="mr-1 h-4 w-4 shrink-0" /> Table {tableLabel}
                </p>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-800">{businessName || 'Menu'}</h1>
              <p className="mt-1 flex items-center text-sm font-medium text-teal-600">
                <Utensils className="mr-1 h-4 w-4" /> Table {tableLabel}
              </p>
              <p className="mt-2 text-sm text-slate-500">Choose a category to browse the menu.</p>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-4">
        {menuHint ? (
          <p
            role="status"
            className={
              menuHint.variant === 'success'
                ? 'mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-center text-sm text-teal-900'
                : 'mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900'
            }
          >
            {menuHint.message}
          </p>
        ) : null}

        <AnimatePresence mode="wait">
          <motion.div
            key={navStack.map((n) => n.id).join('/') || 'root'}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {!currentNode ? (
              <>
                <h2 className="mb-3 px-1 text-sm font-semibold tracking-wide text-slate-500 uppercase">
                  Menu
                </h2>
                <div className="space-y-2">
                  {rootCategories.map((node) => {
                    const isLeaf = node.children.length === 0
                    const subCount = node.children.length
                    const productCount = node.products.length
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => enterCategory(node)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50/40"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900">{node.name}</span>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {isLeaf
                              ? productCount === 1
                                ? '1 item'
                                : `${productCount} items`
                              : subCount === 1
                                ? '1 subcategory'
                                : `${subCount} subcategories`}
                            {!isLeaf && productCount > 0
                              ? ` · ${productCount} item${productCount === 1 ? '' : 's'} here`
                              : ''}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                      </button>
                    )
                  })}
                </div>

                {uncategorized.length > 0 ? (
                  <div className="mt-8">
                    <h2 className="mb-3 px-1 text-sm font-semibold tracking-wide text-slate-500 uppercase">
                      Other
                    </h2>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {uncategorized.map((item) => (
                        <GuestMenuProductCard
                          key={item.id}
                          item={item}
                          onAdd={handleAdd}
                          setMenuHint={setMenuHint}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : currentNode.children.length === 0 ? (
              <>
                <h2 className="mb-3 px-1 text-sm font-semibold tracking-wide text-slate-500 uppercase">
                  Items
                </h2>
                {currentNode.products.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-500">No dishes in this category yet.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {currentNode.products.map((item) => (
                      <GuestMenuProductCard
                        key={item.id}
                        item={item}
                        onAdd={handleAdd}
                        setMenuHint={setMenuHint}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="mb-3 px-1 text-sm font-semibold tracking-wide text-slate-500 uppercase">
                  Categories
                </h2>
                <div className="space-y-2">
                  {sortGuestChildrenLeavesFirst(currentNode.children)
                    .filter((c) => c.children.length > 0 || c.products.length > 0)
                    .map((child) => {
                    const isLeaf = child.children.length === 0
                    const subCount = child.children.length
                    const productCount = child.products.length
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => enterCategory(child)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50/40"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900">{child.name}</span>
                          {isLeaf ? (
                            <p className="mt-0.5 text-xs text-teal-700">
                              {productCount === 0
                                ? 'No items yet'
                                : productCount === 1
                                  ? '1 item'
                                  : `${productCount} items`}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-xs text-slate-500">
                              {subCount === 1 ? '1 subcategory' : `${subCount} subcategories`}
                              {productCount > 0
                                ? ` · ${productCount} item${productCount === 1 ? '' : 's'} here`
                                : ''}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                      </button>
                    )
                  })}
                </div>

                {currentNode.products.length > 0 ? (
                  <div className="mt-8">
                    <h2 className="mb-3 px-1 text-sm font-semibold tracking-wide text-slate-500 uppercase">
                      In this section
                    </h2>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {currentNode.products.map((item) => (
                        <GuestMenuProductCard
                          key={item.id}
                          item={item}
                          onAdd={handleAdd}
                          setMenuHint={setMenuHint}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </motion.div>
        </AnimatePresence>

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
                    <GuestProductImageFrame product={item.product} className="h-16 w-16" />
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
                        disabled={item.quantity >= sellableForLine(item.product)}
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
                  Continue
                </button>
              </div>
            </BottomSheet>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
