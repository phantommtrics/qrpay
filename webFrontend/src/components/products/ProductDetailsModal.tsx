import { motion } from 'framer-motion'
import { Download, Edit, QrCode, X } from 'lucide-react'

import { ModalOverlay } from '../ui/ModalOverlay'
import type { Product } from '../../types'

export function ProductDetailsModal({
  product,
  onClose,
}: {
  product: Product
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <ModalOverlay
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        layoutId={`product-${product.id}`}
        className="relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl md:flex-row"
      >
        <div className="flex-1 border-b border-slate-100 p-6 md:border-r md:border-b-0">
          <div className="mb-6 flex items-start justify-between">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-xl text-3xl ${product.imageColor}`}
            >
              {product.imageEmoji}
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <h2 className="mb-1 text-2xl font-bold text-slate-800">{product.name}</h2>
          <p className="mb-6 text-slate-500">{product.category}</p>

          <div className="space-y-4">
            <div className="flex justify-between border-b border-slate-100 py-3">
              <span className="text-slate-500">Price</span>
              <span className="font-semibold text-slate-800">D{product.price}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-3">
              <span className="text-slate-500">Current Stock</span>
              <span className="font-semibold text-slate-800">{product.stock} units</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-3">
              <span className="text-slate-500">Product ID</span>
              <span className="font-mono text-sm text-slate-600">{product.id}</span>
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
              Generate {product.stock} Codes
            </button>
            <button className="flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-50">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
