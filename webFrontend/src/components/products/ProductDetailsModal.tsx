import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import Barcode from 'react-barcode'
import { Download, Edit, Loader2, X } from 'lucide-react'
import QRCode from 'react-qr-code'

import { ModalOverlay } from '../ui/ModalOverlay'
import type { Product } from '../../types'
import { inferBarcodeFormat, type RetailBarcodeFormat } from '../../utils/barcodeFormat'
import { ProductThumb } from './ProductThumb'
import {
  ApiError,
  updateBusinessProduct,
  uploadBusinessProductImage,
} from '../../services/subscriptionApi'
import { downloadSvgAsPng, sanitizeDownloadBasename } from '../../utils/downloadSvgAsPng'
import {
  prepareProductImageForUpload,
  PRODUCT_IMAGE_MAX_BYTES,
  validateProductImageFile,
} from '../../utils/imageUpload'

function syncFormFromProduct(p: Product) {
  return {
    name: p.name,
    category: p.category,
    description: p.description ?? '',
    price: String(p.price),
    stock: String(p.stock),
    barcode: (p.barcodeValue ?? '').replace(/\s/g, ''),
    qrUrl: p.qrUrl ?? '',
    packImageUrl: p.imageUrl ?? '',
  }
}

export function ProductDetailsModal({
  product,
  businessId,
  canEdit,
  onClose,
  onUpdated,
}: {
  product: Product
  businessId: string
  canEdit: boolean
  onClose: () => void
  onUpdated?: (product: Product) => void
}) {
  const qrHostRef = useRef<HTMLDivElement>(null)
  const barcodeHostRef = useRef<HTMLDivElement>(null)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(product.name)
  const [category, setCategory] = useState(product.category)
  const [description, setDescription] = useState(product.description ?? '')
  const [price, setPrice] = useState(String(product.price))
  const [stock, setStock] = useState(String(product.stock))
  const [barcode, setBarcode] = useState((product.barcodeValue ?? '').replace(/\s/g, ''))
  const [qrUrl, setQrUrl] = useState(product.qrUrl ?? '')
  const [packImageUrl, setPackImageUrl] = useState(product.imageUrl ?? '')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageFieldError, setImageFieldError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<'qr' | 'barcode' | null>(null)

  useEffect(() => {
    setEditing(false)
    const s = syncFormFromProduct(product)
    setName(s.name)
    setCategory(s.category)
    setDescription(s.description)
    setPrice(s.price)
    setStock(s.stock)
    setBarcode(s.barcode)
    setQrUrl(s.qrUrl)
    setPackImageUrl(s.packImageUrl)
    setSaveError(null)
    setImageFieldError(null)
    setDownloadError(null)
  }, [product])

  const displayProduct: Product = editing
    ? {
        ...product,
        name: name.trim() || product.name,
        category: category.trim() || product.category,
        price: Number(price) || product.price,
        stock: Number.parseInt(stock, 10) || product.stock,
        description: description.trim() || undefined,
        barcodeValue: barcode,
        qrUrl,
        imageUrl: packImageUrl || null,
      }
    : product

  const qrTarget = displayProduct.qrUrl ?? ''
  const barcodeVal = (editing ? barcode : product.barcodeValue) ?? ''
  const barcodeFormat: RetailBarcodeFormat = inferBarcodeFormat(barcodeVal || 'x')

  const baseName = sanitizeDownloadBasename(displayProduct.name)

  const handleDownloadQr = async () => {
    setDownloadError(null)
    if (!qrTarget) {
      setDownloadError('No QR URL to export.')
      return
    }
    setDownloading('qr')
    try {
      const svg = qrHostRef.current?.querySelector('svg')
      await downloadSvgAsPng(svg ?? null, `${baseName}-qr-code`)
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Could not download QR code.')
    } finally {
      setDownloading(null)
    }
  }

  const handleDownloadBarcode = async () => {
    setDownloadError(null)
    if (!barcodeVal) {
      setDownloadError('No barcode to export.')
      return
    }
    setDownloading('barcode')
    try {
      const svg = barcodeHostRef.current?.querySelector('svg')
      await downloadSvgAsPng(svg ?? null, `${baseName}-barcode`)
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Could not download barcode.')
    } finally {
      setDownloading(null)
    }
  }

  const processImageFile = useCallback(
    async (file: File) => {
      setImageFieldError(null)
      const err = validateProductImageFile(file)
      if (err) {
        setImageFieldError(err)
        return
      }
      setUploadingImage(true)
      try {
        const prepared = await prepareProductImageForUpload(file)
        if (prepared.size > PRODUCT_IMAGE_MAX_BYTES) {
          setImageFieldError(
            'Image is still over 5MB after compression. Try a smaller original.',
          )
          return
        }
        const url = await uploadBusinessProductImage(businessId, prepared)
        setPackImageUrl(url)
      } catch (err) {
        setImageFieldError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not upload image.',
        )
      } finally {
        setUploadingImage(false)
      }
    },
    [businessId],
  )

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    setSaveError(null)

    const priceNum = Number(price)
    const stockNum = Number.parseInt(stock, 10)

    if (!name.trim() || !category.trim()) {
      setSaveError('Name and category are required.')
      return
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setSaveError('Enter a valid price greater than zero.')
      return
    }
    if (!Number.isFinite(stockNum) || stockNum < 0) {
      setSaveError('Stock must be zero or a positive whole number.')
      return
    }
    const b = barcode.replace(/\s/g, '')
    if (!/^[A-Za-z0-9]{4,48}$/.test(b)) {
      setSaveError('Barcode must be 4–48 letters or digits.')
      return
    }
    const q = qrUrl.trim()
    if (!q) {
      setSaveError('QR URL is required.')
      return
    }
    try {
      const parsed = new URL(q)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setSaveError('QR URL must use http:// or https://')
        return
      }
    } catch {
      setSaveError('QR URL must be a valid URL.')
      return
    }

    setSaving(true)
    try {
      const updated = await updateBusinessProduct(businessId, product.id, {
        name: name.trim(),
        category: category.trim(),
        description: description.trim() ? description.trim() : null,
        price: priceNum,
        stock: stockNum,
        barcodeValue: b,
        qrUrl: q,
        imageUrl: packImageUrl.trim() ? packImageUrl.trim() : null,
      })
      onUpdated?.(updated)
      setEditing(false)
    } catch (err) {
      setSaveError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not save changes.',
      )
    } finally {
      setSaving(false)
    }
  }

  const cancelEdit = () => {
    const s = syncFormFromProduct(product)
    setName(s.name)
    setCategory(s.category)
    setDescription(s.description)
    setPrice(s.price)
    setStock(s.stock)
    setBarcode(s.barcode)
    setQrUrl(s.qrUrl)
    setPackImageUrl(s.packImageUrl)
    setSaveError(null)
    setImageFieldError(null)
    setEditing(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <ModalOverlay
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        layoutId={`product-${product.id}`}
        className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl md:max-h-[90vh] md:flex-row"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-b border-slate-100 p-6 md:border-r md:border-b-0">
          <div className="mb-6 flex items-start justify-between">
            <ProductThumb product={displayProduct} className="h-16 w-16" />
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {!editing ? (
            <>
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
                {product.description ? (
                  <div className="border-b border-slate-100 py-3">
                    <span className="text-slate-500">Description</span>
                    <p className="mt-1 text-sm text-slate-700">{product.description}</p>
                  </div>
                ) : null}
                {product.barcodeValue ? (
                  <div className="flex justify-between border-b border-slate-100 py-3">
                    <span className="text-slate-500">Barcode</span>
                    <span className="font-mono text-sm text-slate-800">{product.barcodeValue}</span>
                  </div>
                ) : null}
                {product.qrUrl ? (
                  <div className="border-b border-slate-100 py-3">
                    <span className="text-slate-500">QR URL</span>
                    <p className="mt-1 break-all font-mono text-xs text-teal-700">{product.qrUrl}</p>
                  </div>
                ) : null}
              </div>

              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="mt-8 flex w-full items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit details
                </button>
              ) : (
                <p className="mt-8 text-center text-xs text-slate-500">
                  Your plan or role does not allow editing products.
                </p>
              )}
            </>
          ) : (
            <form className="flex flex-1 flex-col" onSubmit={handleSave}>
              <h2 className="mb-4 text-lg font-bold text-slate-800">Edit product</h2>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Category</span>
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Description</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Price (D)</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Stock</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={stock}
                      onChange={(e) => setStock(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Barcode</span>
                  <input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value.replace(/\s/g, ''))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-teal-500"
                    aria-label="Product barcode"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">QR URL</span>
                  <input
                    value={qrUrl}
                    onChange={(e) => setQrUrl(e.target.value)}
                    placeholder="https://…"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-teal-500"
                    aria-label="QR code URL"
                  />
                </label>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <span className="mb-2 block text-xs font-medium text-slate-600">Photo</span>
                  <div className="flex flex-wrap gap-2">
                    <label className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-teal-700 ring-1 ring-slate-200 hover:bg-teal-50">
                      {uploadingImage ? 'Uploading…' : 'Replace image'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        disabled={uploadingImage}
                        aria-label="Replace product image"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.currentTarget.value = ''
                          if (file) {
                            void processImageFile(file)
                          }
                        }}
                      />
                    </label>
                    {packImageUrl ? (
                      <button
                        type="button"
                        onClick={() => setPackImageUrl('')}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Remove photo
                      </button>
                    ) : null}
                  </div>
                  {imageFieldError ? (
                    <p className="mt-2 text-xs text-red-600">{imageFieldError}</p>
                  ) : null}
                  {packImageUrl ? (
                    <img
                      src={packImageUrl}
                      alt=""
                      className="mt-2 h-20 w-20 rounded-md border border-slate-200 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                </div>
              </div>

              {saveError ? (
                <p className="mt-3 text-sm text-red-600">{saveError}</p>
              ) : null}

              <div className="mt-auto flex gap-2 pt-6">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingImage}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-teal-600 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="flex w-full flex-col items-center justify-center bg-slate-50 p-6 text-center md:w-[min(100%,22rem)] md:shrink-0">
          <h3 className="mb-4 font-semibold text-slate-800">Scan codes</h3>

          {qrTarget ? (
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div ref={qrHostRef} className="inline-block">
                <QRCode value={qrTarget} size={160} />
              </div>
              <p className="mt-2 text-xs text-slate-500">Opens URL when scanned</p>
            </div>
          ) : (
            <div className="mb-4 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
              No QR URL
            </div>
          )}

          {barcodeVal ? (
            <div
              ref={barcodeHostRef}
              className="w-full max-w-xs overflow-x-auto rounded-xl border border-slate-200 bg-white p-3"
            >
              <Barcode
                value={barcodeVal}
                format={barcodeFormat}
                width={1.4}
                height={56}
                displayValue
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500">No barcode</p>
          )}

          {downloadError ? (
            <p className="mt-3 max-w-xs text-xs text-red-600">{downloadError}</p>
          ) : null}

          <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
            <button
              type="button"
              disabled={!qrTarget || downloading !== null}
              onClick={() => void handleDownloadQr()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloading === 'qr' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download QR (PNG)
            </button>
            <button
              type="button"
              disabled={!barcodeVal || downloading !== null}
              onClick={() => void handleDownloadBarcode()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloading === 'barcode' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download barcode (PNG)
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
