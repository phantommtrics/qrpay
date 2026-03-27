import { motion } from 'framer-motion'
import Barcode from 'react-barcode'
import { Download, Edit, X } from 'lucide-react'
import QRCode from 'react-qr-code'

import { ModalOverlay } from '../ui/ModalOverlay'
import type { Product } from '../../types'
import { inferBarcodeFormat, type RetailBarcodeFormat } from '../../utils/barcodeFormat'
import { ProductThumb } from './ProductThumb'

export function ProductDetailsModal({
  product,
  onClose,
}: {
  product: Product
  onClose: () => void
}) {
  const qrTarget = product.qrUrl ?? ''
  const barcodeVal = product.barcodeValue ?? ''
  const barcodeFormat: RetailBarcodeFormat =
    product.barcodeType &&
    /^(CODE128|EAN13|EAN8|UPC|ITF14|ITF)$/.test(product.barcodeType)
      ? (product.barcodeType as RetailBarcodeFormat)
      : inferBarcodeFormat(barcodeVal || 'x')

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
            <ProductThumb product={product} className="h-16 w-16" />
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
              aria-label="Close"
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
            {barcodeVal ? (
              <div className="flex justify-between border-b border-slate-100 py-3">
                <span className="text-slate-500">Barcode</span>
                <span className="font-mono text-sm text-slate-800">{barcodeVal}</span>
              </div>
            ) : null}
            {qrTarget ? (
              <div className="border-b border-slate-100 py-3">
                <span className="text-slate-500">QR URL</span>
                <p className="mt-1 break-all font-mono text-xs text-teal-700">{qrTarget}</p>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="mt-8 flex w-full items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit Details
          </button>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center bg-slate-50 p-6 text-center">
          <h3 className="mb-4 font-semibold text-slate-800">Scan codes</h3>

          {qrTarget ? (
            <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <QRCode value={qrTarget} size={160} />
              <p className="mt-2 text-xs text-slate-500">Opens product URL when scanned</p>
            </div>
          ) : (
            <div className="mb-6 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
              No QR URL on this product
            </div>
          )}

          {barcodeVal ? (
            <div className="w-full max-w-xs overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
              <Barcode
                value={barcodeVal}
                format={barcodeFormat}
                width={1.4}
                height={56}
                displayValue
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500">No barcode value</p>
          )}

          <button
            type="button"
            className="mt-8 flex w-full max-w-xs items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Download className="mr-2 h-4 w-4" />
            Download (coming soon)
          </button>
        </div>
      </motion.div>
    </div>
  )
}
