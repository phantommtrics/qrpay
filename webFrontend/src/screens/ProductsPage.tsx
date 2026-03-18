import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Edit, Filter, Plus, QrCode, Search, X } from 'lucide-react'

import { MOCK_PRODUCTS } from '../data/mockData'
import type { Product } from '../types'

export function ProductsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const filteredProducts = MOCK_PRODUCTS.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
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
          <button className="flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50">
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </button>
          <button className="flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2 text-white shadow-sm transition-colors hover:bg-teal-700">
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {filteredProducts.map((product) => (
          <motion.button
            key={product.id}
            layoutId={`product-${product.id}`}
            onClick={() => setSelectedProduct(product)}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition-shadow hover:shadow-md"
          >
            <div
              className={`flex h-32 items-center justify-center text-5xl ${product.imageColor}`}
            >
              {product.imageEmoji}
            </div>
            <div className="p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="line-clamp-1 font-semibold text-slate-800">
                  {product.name}
                </h3>
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
            </div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {selectedProduct ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setSelectedProduct(null)}
            />
            <motion.div
              layoutId={`product-${selectedProduct.id}`}
              className="relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl md:flex-row"
            >
              <div className="flex-1 border-b border-slate-100 p-6 md:border-r md:border-b-0">
                <div className="mb-6 flex items-start justify-between">
                  <div
                    className={`flex h-16 w-16 items-center justify-center rounded-xl text-3xl ${selectedProduct.imageColor}`}
                  >
                    {selectedProduct.imageEmoji}
                  </div>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <h2 className="mb-1 text-2xl font-bold text-slate-800">
                  {selectedProduct.name}
                </h2>
                <p className="mb-6 text-slate-500">{selectedProduct.category}</p>

                <div className="space-y-4">
                  <div className="flex justify-between border-b border-slate-100 py-3">
                    <span className="text-slate-500">Price</span>
                    <span className="font-semibold text-slate-800">
                      D{selectedProduct.price}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 py-3">
                    <span className="text-slate-500">Current Stock</span>
                    <span className="font-semibold text-slate-800">
                      {selectedProduct.stock} units
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 py-3">
                    <span className="text-slate-500">Product ID</span>
                    <span className="font-mono text-sm text-slate-600">
                      {selectedProduct.id}
                    </span>
                  </div>
                </div>

                <button className="mt-8 flex w-full items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Details
                </button>
              </div>

              <div className="relative flex flex-1 flex-col items-center justify-center bg-slate-50 p-6 text-center">
                <div className="mb-6 flex h-48 w-48 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-4">
                  <QrCode className="mb-2 h-16 w-16 text-slate-400" />
                  <p className="text-sm text-slate-500">
                    Generate unique QR codes for inventory
                  </p>
                </div>
                <h3 className="mb-2 font-semibold text-slate-800">Inventory QR Codes</h3>
                <p className="mb-6 text-sm text-slate-500">
                  Print these to stick on physical items for fast POS scanning.
                </p>

                <div className="w-full space-y-3">
                  <button className="flex w-full items-center justify-center rounded-lg bg-teal-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-teal-700">
                    <QrCode className="mr-2 h-4 w-4" />
                    Generate {selectedProduct.stock} Codes
                  </button>
                  <button className="flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-50">
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}
