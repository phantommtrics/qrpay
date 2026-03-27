import { useEffect, useState, type FormEvent } from 'react'
import Barcode from 'react-barcode'
import { X } from 'lucide-react'
import QRCode from 'react-qr-code'

import { ModalOverlay } from '../ui/ModalOverlay'
import {
  ApiError,
  createBusinessProduct,
  lookupOpenFoodFactsProduct,
  uploadBusinessProductImage,
} from '../../services/subscriptionApi'
import { inferBarcodeFormat } from '../../utils/barcodeFormat'
import { CameraBarcodeScanner } from '../scanner/CameraBarcodeScanner'

type BarcodeMode = 'auto' | 'manual'
type QrMode = 'auto' | 'manual'

export function AddProductModal({
  businessId,
  onClose,
  onCreated,
  initialBarcode,
}: {
  businessId: string
  onClose: () => void
  onCreated: () => void
  initialBarcode?: string
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('0')
  const [barcodeMode, setBarcodeMode] = useState<BarcodeMode>('auto')
  const [barcodeValue, setBarcodeValue] = useState('')
  const [qrMode, setQrMode] = useState<QrMode>('auto')
  const [qrUrl, setQrUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [lookupInput, setLookupInput] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupMessage, setLookupMessage] = useState<string | null>(null)
  const [packImageUrl, setPackImageUrl] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

  useEffect(() => {
    const incoming = initialBarcode?.trim()
    if (!incoming) {
      return
    }
    setBarcodeMode('manual')
    setBarcodeValue(incoming)
    setLookupInput(incoming)
    if (/^\d{4,14}$/.test(incoming)) {
      void handleOpenFoodFactsLookup(incoming)
    }
    // initialBarcode is only used when modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const previewBarcode =
    barcodeMode === 'manual' && barcodeValue.trim()
      ? barcodeValue.trim()
      : 'SAMPLE123456'
  const previewBarcodeFormat = inferBarcodeFormat(previewBarcode)
  const previewQr =
    qrMode === 'manual' && qrUrl.trim()
      ? qrUrl.trim()
      : typeof window !== 'undefined'
        ? `${window.location.origin}/p/preview-product-id`
        : 'https://example.com/p/preview-product-id'

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    const priceNum = Number(price)
    const stockNum = Number.parseInt(stock, 10)

    if (!name.trim() || !category.trim()) {
      setError('Name and category are required.')
      return
    }

    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError('Enter a valid price greater than zero.')
      return
    }

    if (!Number.isFinite(stockNum) || stockNum < 0) {
      setError('Stock must be zero or a positive whole number.')
      return
    }

    if (barcodeMode === 'manual') {
      const b = barcodeValue.trim()
      if (!/^[A-Za-z0-9]{4,48}$/.test(b)) {
        setError('Manual barcode must be 4–48 letters or digits only.')
        return
      }
    }

    if (qrMode === 'manual') {
      const q = qrUrl.trim()
      if (!q) {
        setError('Enter a full URL for the QR code, or switch to automatic.')
        return
      }
      let parsed: URL
      try {
        parsed = new URL(q)
      } catch {
        setError('QR URL must be a valid http(s) URL.')
        return
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setError('QR URL must use http:// or https://')
        return
      }
    }

    setSubmitting(true)
    try {
      await createBusinessProduct(businessId, {
        name: name.trim(),
        category: category.trim(),
        description: description.trim() || undefined,
        price: priceNum,
        stock: stockNum,
        ...(barcodeMode === 'manual' ? { barcodeValue: barcodeValue.trim() } : {}),
        ...(qrMode === 'manual' ? { qrUrl: qrUrl.trim() } : {}),
        ...(packImageUrl.trim() ? { imageUrl: packImageUrl.trim() } : {}),
      })
      onCreated()
      onClose()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not create product.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenFoodFactsLookup = async (overrideCode?: string) => {
    setLookupMessage(null)
    const code = (overrideCode ?? lookupInput).replace(/\s/g, '')
    if (!/^\d{4,14}$/.test(code)) {
      setLookupMessage('Enter 4–14 digits from the package barcode (EAN-13, UPC, etc.).')
      return
    }

    setLookupLoading(true)
    try {
      const result = await lookupOpenFoodFactsProduct(businessId, code)
      if (!result) {
        setLookupMessage('No match in Open Food Facts. Enter details manually or try another code.')
        return
      }

      setName(result.name)
      setCategory(result.category)
      setDescription(result.description ?? '')
      setBarcodeMode('manual')
      setBarcodeValue(result.code)
      setPackImageUrl(result.imageUrl ?? '')
      setLookupMessage(
        result.imageUrl
          ? 'Loaded name, category, and pack photo from Open Food Facts. Add your price and stock.'
          : 'Loaded name and category from Open Food Facts. Add your price and stock.',
      )
    } catch (err) {
      setLookupMessage(
        err instanceof ApiError ? err.message : 'Lookup failed. Check your connection and try again.',
      )
    } finally {
      setLookupLoading(false)
    }
  }

  const handleManualImageUpload = async (file: File) => {
    setError(null)
    setLookupMessage(null)
    setUploadingImage(true)
    try {
      const imageUrl = await uploadBusinessProductImage(businessId, file)
      setPackImageUrl(imageUrl)
      setLookupMessage('Photo uploaded. It will be used for this product.')
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not upload image.',
      )
    } finally {
      setUploadingImage(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <ModalOverlay
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Add product</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-4">
            <p className="text-sm font-semibold text-slate-900">Pack barcode (Open Food Facts)</p>
            <p className="mt-1 text-xs text-slate-600">
              Type the digits under the bar on the package (food &amp; groceries). We fetch the
              official name, category, and photo when available.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 3017620422003"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value.replace(/[^\d\s]/g, ''))}
                className="min-w-0 flex-1 rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
              />
              <button
                type="button"
                disabled={lookupLoading}
                onClick={() => void handleOpenFoodFactsLookup()}
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {lookupLoading ? 'Looking up…' : 'Look up'}
              </button>
              <button
                type="button"
                disabled={lookupLoading}
                onClick={() => setScannerOpen(true)}
                className="rounded-xl border border-teal-300 bg-white px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60"
              >
                Scan camera
              </button>
            </div>
            {lookupMessage ? (
              <p className="mt-2 text-xs text-slate-700">{lookupMessage}</p>
            ) : null}
            {packImageUrl ? (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <img
                  src={packImageUrl}
                  alt=""
                  className="h-24 w-24 rounded-lg border border-teal-100 bg-white object-contain"
                  referrerPolicy="no-referrer"
                />
                <button
                  type="button"
                  onClick={() => setPackImageUrl('')}
                  className="text-xs font-medium text-teal-800 underline"
                >
                  Remove pack photo
                </button>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                {uploadingImage ? 'Uploading image…' : 'Upload image'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingImage}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    void handleManualImageUpload(file)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
              <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                {uploadingImage ? 'Uploading image…' : 'Take photo'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={uploadingImage}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    void handleManualImageUpload(file)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-slate-500">
              Data © Open Food Facts contributors (
              <a
                href="https://openfoodfacts.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-700 underline"
              >
                openfoodfacts.org
              </a>
              ), ODbL 1.0.
            </p>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-teal-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Category</span>
            <input
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-teal-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Description (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-teal-500"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Price (D)</span>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-teal-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Stock</span>
              <input
                required
                type="number"
                min="0"
                step="1"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-teal-500"
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-sm font-semibold text-slate-800">Barcode (Code128, alphanumeric)</p>
            <div className="mb-3 flex gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="barcodeMode"
                  checked={barcodeMode === 'auto'}
                  onChange={() => setBarcodeMode('auto')}
                />
                Generate automatically
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="barcodeMode"
                  checked={barcodeMode === 'manual'}
                  onChange={() => setBarcodeMode('manual')}
                />
                Enter my own
              </label>
            </div>
            {barcodeMode === 'manual' ? (
              <input
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                placeholder="e.g. SKU42ABC"
                className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            ) : null}
            <div className="flex justify-center overflow-x-auto rounded-lg bg-white p-2">
              <Barcode
                value={previewBarcode}
                format={previewBarcodeFormat}
                width={1.4}
                height={48}
                displayValue
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-sm font-semibold text-slate-800">QR code (URL)</p>
            <div className="mb-3 flex gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="qrMode"
                  checked={qrMode === 'auto'}
                  onChange={() => setQrMode('auto')}
                />
                Use system URL (this app, /p/…)
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="qrMode"
                  checked={qrMode === 'manual'}
                  onChange={() => setQrMode('manual')}
                />
                Use my URL
              </label>
            </div>
            {qrMode === 'manual' ? (
              <input
                value={qrUrl}
                onChange={(e) => setQrUrl(e.target.value)}
                placeholder="https://…"
                className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            ) : null}
            <div className="flex flex-col items-center gap-2 rounded-lg bg-white p-4">
              <QRCode value={previewQr} size={128} />
              <span className="max-w-full truncate text-xs text-slate-500">{previewQr}</span>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Create product'}
            </button>
          </div>
        </form>
      </div>
      <CameraBarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        title="Scan pack barcode"
        onDetected={(raw) => {
          const digits = raw.replace(/[^\d]/g, '')
          setScannerOpen(false)
          setLookupInput(digits || raw)
          void handleOpenFoodFactsLookup(digits || raw)
        }}
      />
    </div>
  )
}
