import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Search } from 'lucide-react'

import { AddProductModal } from '../components/products/AddProductModal'
import { ProductDetailsModal } from '../components/products/ProductDetailsModal'
import { ProductThumb } from '../components/products/ProductThumb'
import { FlashNotice } from '../components/ui/FlashNotice'
import { PageTransition } from '../components/ui/PageTransition'
import { SearchableListbox } from '../components/ui/SearchableListbox'
import { useAuth } from '../features/auth/AuthContext'
import type { Product } from '../types'
import {
  ApiError,
  fetchBusinessProductsPaged,
  fetchMenuCategories,
  type MenuCategoryRow,
} from '../services/subscriptionApi'
import { categoryBreadcrumb, leafMenuCategories } from '../utils/menuCategoryTree'
import { isProductCatalogIndustry, isRestaurantIndustry } from '../utils/businessIndustry'

const PAGE_SIZE = 20

export function ProductsPage() {
  const {
    currentOrganization,
    canAccess,
    user,
    refreshBusinessProducts,
  } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [flashMessage, setFlashMessage] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [menuRows, setMenuRows] = useState<MenuCategoryRow[]>([])

  const [listedProducts, setListedProducts] = useState<Product[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listLoadingMore, setListLoadingMore] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)

  const offsetRef = useRef(0)
  const hasMoreRef = useRef(true)
  const appendBusyRef = useRef(false)
  /** False while the first page for the current filters is in flight or not started — blocks premature infinite scroll. */
  const listReadyRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const dismissFlash = useCallback(() => setFlashMessage(null), [])

  const businessId = currentOrganization?.id
  const industryAllowed = isProductCatalogIndustry(currentOrganization?.industry)
  const restaurantMode = isRestaurantIndustry(currentOrganization?.industry)

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => window.clearTimeout(id)
  }, [searchTerm])

  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])

  useEffect(() => {
    if (!businessId || !industryAllowed) {
      setMenuRows([])
      return
    }
    let cancelled = false
    fetchMenuCategories(businessId)
      .then((rows) => {
        if (!cancelled) {
          setMenuRows(rows)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMenuRows([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [businessId, industryAllowed])

  const fetchPage = useCallback(
    async (append: boolean) => {
      if (!businessId || !industryAllowed) {
        return
      }
      if (append) {
        if (appendBusyRef.current || !hasMoreRef.current) {
          return
        }
        appendBusyRef.current = true
      }

      const offset = append ? offsetRef.current : 0
      if (!append) {
        listReadyRef.current = false
        setListLoading(true)
        offsetRef.current = 0
      } else {
        setListLoadingMore(true)
      }
      setListError(null)

      try {
        const { items, hasMore: more } = await fetchBusinessProductsPaged(businessId, {
          limit: PAGE_SIZE,
          offset,
          q: debouncedSearch.trim() || undefined,
          menuCategoryId: categoryFilter ? categoryFilter : undefined,
        })
        if (!append) {
          setListedProducts(items)
          offsetRef.current = items.length
        } else {
          setListedProducts((prev) => [...prev, ...items])
          offsetRef.current += items.length
        }
        setHasMore(more)
        hasMoreRef.current = more
      } catch (error) {
        setListError(
          error instanceof ApiError ? error.message : 'Could not load products.',
        )
        if (!append) {
          setListedProducts([])
          offsetRef.current = 0
        }
        setHasMore(false)
        hasMoreRef.current = false
      } finally {
        setListLoading(false)
        setListLoadingMore(false)
        if (!append) {
          listReadyRef.current = true
        }
        if (append) {
          appendBusyRef.current = false
        }
      }
    },
    [businessId, industryAllowed, debouncedSearch, categoryFilter],
  )

  useEffect(() => {
    if (!businessId || !industryAllowed) {
      listReadyRef.current = false
      setListedProducts([])
      setListError(null)
      setListLoading(false)
      setListLoadingMore(false)
      setHasMore(true)
      hasMoreRef.current = true
      offsetRef.current = 0
      return
    }
    void fetchPage(false)
  }, [businessId, industryAllowed, debouncedSearch, categoryFilter, fetchPage])

  useEffect(() => {
    if (listLoading || !businessId || !industryAllowed || !listReadyRef.current) {
      return
    }
    const el = sentinelRef.current
    if (!el) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return
        }
        void fetchPage(true)
      },
      { root: null, rootMargin: '280px', threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [listLoading, businessId, industryAllowed, fetchPage])

  const reloadFirstPage = useCallback(() => {
    void fetchPage(false)
  }, [fetchPage])

  const canCreateProducts = canAccess('products.create')
  const canEditProducts = canAccess('products.edit')

  const showIndustryGate =
    Boolean(currentOrganization) && !industryAllowed && !user?.isPlatformOwner

  const menuCategoryFilterOptions = useMemo(
    () => [
      { id: '', label: 'All categories' },
      { id: '__uncategorized__', label: 'Uncategorized' },
      ...leafMenuCategories(menuRows).map((row) => ({
        id: row.id,
        label: categoryBreadcrumb(menuRows, row.id),
      })),
    ],
    [menuRows],
  )

  return (
    <PageTransition className="space-y-6">
      <FlashNotice message={flashMessage} onDismiss={dismissFlash} />
      {showIndustryGate ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The product catalog is enabled for <strong>Retail</strong>, <strong>Wholesale</strong>,{' '}
          <strong>Pharmacy</strong>, and <strong>Restaurant</strong> businesses. Your organization industry is “
          {currentOrganization?.industry ?? '—'}”. Update the business industry or register a matching
          business to use this feature.
        </div>
      ) : null}

      {listError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {listError}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-4 pl-10 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-end lg:w-auto">
          {businessId && industryAllowed ? (
            <SearchableListbox
              className="w-full sm:w-auto sm:max-w-[min(100%,22rem)]"
              layout="inline"
              clearable
              fieldLabel={restaurantMode ? 'Menu category' : 'Product category'}
              fieldLabelClassName="text-sm font-medium text-slate-700"
              listId="products-page-menu-category-filter"
              options={menuCategoryFilterOptions}
              value={categoryFilter}
              onChange={setCategoryFilter}
              placeholder="Search categories…"
              selectOnlyViaList
              listMaxHeightClassName="max-h-[10rem]"
            />
          ) : null}
          <button
            type="button"
            disabled={!canCreateProducts || !businessId || !industryAllowed}
            onClick={() => setAddOpen(true)}
            className="flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2 text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Plus className="mr-2 h-4 w-4" />
            {canCreateProducts ? 'Add Product' : 'Plan locked'}
          </button>
        </div>
      </div>

      {listLoading ? (
        <p className="text-center text-sm text-slate-500">Loading products…</p>
      ) : null}

      {!listLoading && listedProducts.length === 0 && !listError && industryAllowed && businessId ? (
        <p className="text-center text-sm text-slate-500">
          No products yet. Add one to set a barcode and product details.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {listedProducts.map((product) => (
          <motion.button
            key={product.id}
            type="button"
            layoutId={`product-${product.id}`}
            onClick={() => setSelectedProduct(product)}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition-shadow hover:shadow-md"
          >
            <ProductThumb
              product={product}
              size="lg"
              imageFit="cover"
              className="h-32 w-full rounded-none rounded-t-xl ring-1 ring-inset ring-slate-900/5"
            />
            <div className="p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="line-clamp-1 font-semibold text-slate-800">{product.name}</h3>
                <span className="font-bold text-teal-600">D{product.price}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{product.category}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    product.stock < 20
                      ? 'bg-red-100 text-red-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {product.stock} in stock
                </span>
              </div>
              <div className="mt-3 text-xs font-medium text-slate-500">
                {canEditProducts ? 'Editing allowed for this plan' : 'Editing limited by plan'}
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {industryAllowed && businessId ? (
        <div ref={sentinelRef} className="flex min-h-8 justify-center py-4" aria-hidden>
          {listLoadingMore ? (
            <span className="text-sm text-slate-500">Loading more…</span>
          ) : null}
        </div>
      ) : null}

      <AnimatePresence>
        {selectedProduct && businessId ? (
          <ProductDetailsModal
            product={selectedProduct}
            businessId={businessId}
            canEdit={canEditProducts}
            onClose={() => setSelectedProduct(null)}
            onUpdated={(updated) => {
              setSelectedProduct(updated)
              void refreshBusinessProducts()
              setListedProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
              setFlashMessage('Product updated successfully.')
            }}
          />
        ) : null}
      </AnimatePresence>

      {addOpen && businessId && industryAllowed ? (
        <AddProductModal
          businessId={businessId}
          mode={restaurantMode ? 'restaurant' : 'retail'}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            void refreshBusinessProducts()
            reloadFirstPage()
            setFlashMessage('Product created successfully.')
          }}
        />
      ) : null}
    </PageTransition>
  )
}
