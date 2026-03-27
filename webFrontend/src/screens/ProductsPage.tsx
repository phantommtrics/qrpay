import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Filter, Plus, Search } from 'lucide-react'

import { AddProductModal } from '../components/products/AddProductModal'
import { ProductDetailsModal } from '../components/products/ProductDetailsModal'
import { ProductThumb } from '../components/products/ProductThumb'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import type { Product } from '../types'
import { isRetailOrWholesaleIndustry } from '../utils/businessIndustry'

export function ProductsPage() {
  const {
    currentOrganization,
    canAccess,
    user,
    businessProducts,
    businessProductsLoading,
    businessProductsError,
    refreshBusinessProducts,
  } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const businessId = currentOrganization?.id
  const industryAllowed = isRetailOrWholesaleIndustry(currentOrganization?.industry)
  const products = businessProducts
  const loading = businessProductsLoading
  const loadError = businessProductsError

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const canCreateProducts = canAccess('products.create')
  const canEditProducts = canAccess('products.edit')

  const showIndustryGate =
    Boolean(currentOrganization) && !industryAllowed && !user?.isPlatformOwner

  return (
    <PageTransition className="space-y-6">
      {showIndustryGate ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Product catalog with barcodes and QR is enabled for <strong>Retail</strong> and{' '}
          <strong>Wholesale</strong> businesses in phase 1. Your organization industry is “
          {currentOrganization?.industry ?? '—'}”. Update the business industry or register a
          retail/wholesale business to use this feature.
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-4 pl-10 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className="flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </button>
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

      {loading ? (
        <p className="text-center text-sm text-slate-500">Loading products…</p>
      ) : null}

      {!loading && filteredProducts.length === 0 && !loadError && industryAllowed && businessId ? (
        <p className="text-center text-sm text-slate-500">
          No products yet. Add one to generate a barcode and product URL QR code.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {filteredProducts.map((product) => (
          <motion.button
            key={product.id}
            type="button"
            layoutId={`product-${product.id}`}
            onClick={() => setSelectedProduct(product)}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition-shadow hover:shadow-md"
          >
            <ProductThumb product={product} size="lg" className="h-32 w-full rounded-none rounded-t-xl" />
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

      <AnimatePresence>
        {selectedProduct ? (
          <ProductDetailsModal
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
          />
        ) : null}
      </AnimatePresence>

      {addOpen && businessId && industryAllowed ? (
        <AddProductModal
          businessId={businessId}
          onClose={() => setAddOpen(false)}
          onCreated={() => void refreshBusinessProducts()}
        />
      ) : null}
    </PageTransition>
  )
}
