import { useCallback, useEffect, useMemo, useState } from 'react'
import Barcode from 'react-barcode'
import { FileText, RefreshCw } from 'lucide-react'

import { FlashNotice } from '../components/ui/FlashNotice'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import {
  ApiError,
  fetchBusinessProducts,
  fetchMenuCategories,
  type MenuCategoryRow,
} from '../services/subscriptionApi'
import type { Product } from '../types'
import { inferBarcodeFormat } from '../utils/barcodeFormat'
import { isRestaurantIndustry } from '../utils/businessIndustry'
import { downloadManualMenuPdf, type ManualMenuPdfCategory } from '../utils/manualMenuPdf'
import { categoryBreadcrumb, orderedCategoryTree } from '../utils/menuCategoryTree'
import { formatMoney } from '../utils/formatMoney'

const UNCATEGORIZED_ID = '__uncategorized__'

type MenuCategoryGroup = ManualMenuPdfCategory & {
  depth: number
}

function groupProductsByCategory(
  products: Product[],
  categories: MenuCategoryRow[],
): MenuCategoryGroup[] {
  const productsByCategory = new Map<string, Product[]>()
  for (const product of products) {
    const key = product.menuCategoryId || UNCATEGORIZED_ID
    productsByCategory.set(key, [...(productsByCategory.get(key) ?? []), product])
  }

  const groups: MenuCategoryGroup[] = orderedCategoryTree(categories)
    .map(({ row, depth }) => ({
      id: row.id,
      name: categoryBreadcrumb(categories, row.id) || row.name,
      depth,
      products: [...(productsByCategory.get(row.id) ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    }))
    .filter((group) => group.products.length > 0)

  const uncategorizedProducts = [...(productsByCategory.get(UNCATEGORIZED_ID) ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
  if (uncategorizedProducts.length > 0) {
    groups.push({
      id: UNCATEGORIZED_ID,
      name: 'Uncategorized',
      depth: 0,
      products: uncategorizedProducts,
    })
  }

  return groups
}

export function RestaurantManualMenuPage() {
  const { currentOrganization, canAccess, user } = useAuth()
  const businessId = currentOrganization?.id
  const businessName = currentOrganization?.name ?? 'Restaurant'
  const allowed = Boolean(currentOrganization && isRestaurantIndustry(currentOrganization.industry))
  const canExport = canAccess('reports.export')

  const [categories, setCategories] = useState<MenuCategoryRow[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const showGate =
    Boolean(currentOrganization) && !allowed && !user?.isPlatformOwner && !user?.isPlatformAdmin

  const loadMenu = useCallback(async () => {
    if (!businessId || !allowed) {
      setCategories([])
      setProducts([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [categoryRows, productRows] = await Promise.all([
        fetchMenuCategories(businessId),
        fetchBusinessProducts(businessId),
      ])
      setCategories(categoryRows)
      setProducts(productRows)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load manual menu.')
      setCategories([])
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [businessId, allowed])

  useEffect(() => {
    void loadMenu()
  }, [loadMenu])

  const groups = useMemo(() => groupProductsByCategory(products, categories), [products, categories])
  const productCount = products.length
  const barcodeCount = products.filter((product) => product.barcodeValue?.trim()).length

  const exportPdf = () => {
    if (!canExport) {
      setFlash('Export needs the Export reports permission.')
      return
    }
    downloadManualMenuPdf({
      businessName,
      categories: groups,
    })
  }

  return (
    <PageTransition className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <FlashNotice message={flash} onDismiss={() => setFlash(null)} />

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-600">Restaurant</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Manual Menu</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            A printable restaurant menu arranged by category. Each product card shows price and barcode details
            for quick inventory checks and kitchen counter use.
          </p>
          {allowed ? (
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
              <span className="rounded-full bg-slate-100 px-3 py-1">{groups.length} categories</span>
              <span className="rounded-full bg-slate-100 px-3 py-1">{productCount} products</span>
              <span className="rounded-full bg-slate-100 px-3 py-1">{barcodeCount} barcodes</span>
            </div>
          ) : null}
        </div>

        {allowed ? (
          <div className="flex shrink-0 flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadMenu()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={exportPdf}
              disabled={loading || groups.length === 0 || !canExport}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:bg-slate-300"
            >
              <FileText className="h-4 w-4" />
              Export PDF
            </button>
          </div>
        ) : null}
      </div>

      {showGate ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Manual Menu is only available when your business industry is Restaurant.
        </div>
      ) : null}

      {allowed && !canExport ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          PDF export needs the <strong>Export reports</strong> permission.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading manual menu...</p> : null}

      {!loading && allowed && groups.length === 0 && !error ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No restaurant products found. Add products and assign menu categories to build this manual menu.
        </div>
      ) : null}

      {!loading && allowed && groups.length > 0 ? (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-1 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{group.name}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {group.products.length} {group.products.length === 1 ? 'product' : 'products'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.products.map((product) => {
                  const barcodeValue = product.barcodeValue?.trim() ?? ''
                  return (
                    <article
                      key={product.id}
                      className="flex min-h-48 flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-base font-semibold leading-6 text-slate-900">{product.name}</h3>
                          <span className="shrink-0 rounded-full bg-teal-50 px-3 py-1 text-sm font-bold text-teal-700">
                            {formatMoney(product.price, { decimals: 2 })}
                          </span>
                        </div>
                        {product.description ? (
                          <p className="line-clamp-2 text-sm leading-5 text-slate-600">{product.description}</p>
                        ) : null}
                      </div>

                      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-3">
                        {barcodeValue ? (
                          <>
                            <div className="flex justify-center overflow-hidden">
                              <Barcode
                                value={barcodeValue}
                                format={inferBarcodeFormat(barcodeValue)}
                                width={1.4}
                                height={42}
                                fontSize={12}
                                margin={0}
                              />
                            </div>
                            <p className="mt-2 break-all text-center font-mono text-xs text-slate-700">
                              {barcodeValue}
                            </p>
                          </>
                        ) : (
                          <p className="py-5 text-center text-sm text-slate-400">No barcode</p>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </PageTransition>
  )
}
