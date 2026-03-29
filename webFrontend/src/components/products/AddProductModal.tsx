import { useCallback, useEffect, useState, type FormEvent, type DragEvent } from 'react'
import Barcode from 'react-barcode'
import { Camera, ChevronLeft, ImageIcon, Upload, X } from 'lucide-react'
import QRCode from 'react-qr-code'

import { ModalOverlay } from '../ui/ModalOverlay'
import { ProductThumb } from './ProductThumb'
import { CameraBarcodeScanner } from '../scanner/CameraBarcodeScanner'
import {
  ApiError,
  createBusinessProduct,
  uploadBusinessProductImage,
} from '../../services/subscriptionApi'
import type { Product } from '../../types'
import { inferBarcodeFormat } from '../../utils/barcodeFormat'
import {
  prepareProductImageForUpload,
  productImageExceedsUploadLimit,
  PRODUCT_IMAGE_MAX_BYTES,
  validateProductImageFile,
} from '../../utils/imageUpload'

type Step = 1 | 2 | 3
type QrMode = 'auto' | 'manual'

const STEP_LABELS = ['Scan barcode', 'Codes', 'Details & save'] as const

function normalizeBarcode(raw: string): string {
  return raw.replace(/\s+/g, '').trim()
}

function isValidProductBarcode(value: string): boolean {
  return /^[A-Za-z0-9]{4,48}$/.test(value)
}

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
  const [step, setStep] = useState<Step>(1)
  const [useAutoBarcode, setUseAutoBarcode] = useState(false)
  const [barcodeValue, setBarcodeValue] = useState('')
  const [manualBarcodeInput, setManualBarcodeInput] = useState('')
  const [qrMode, setQrMode] = useState<QrMode>('auto')
  const [qrUrl, setQrUrl] = useState('')

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('0')

  const [packImageUrl, setPackImageUrl] = useState('')
  const [imageHint, setImageHint] = useState<string | null>(null)
  const [imageFieldError, setImageFieldError] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const [scannerOpen, setScannerOpen] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    const raw = initialBarcode?.trim()
    if (!raw) {
      return
    }
    const n = normalizeBarcode(raw)
    if (isValidProductBarcode(n)) {
      setBarcodeValue(n)
      setManualBarcodeInput(n)
      setUseAutoBarcode(false)
      setStep(2)
    } else {
      setManualBarcodeInput(n)
      setStep(1)
      setStepError(
        n.length > 0
          ? 'Scanned code must be 4–48 letters or digits. Enter a valid code or generate one automatically.'
          : null,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when modal opens with POS payload
  }, [])

  const previewBarcodeValue = useAutoBarcode
    ? 'AUTOASSIGN'
    : barcodeValue.trim() || 'SAMPLE123456'
  const previewBarcodeFormat = inferBarcodeFormat(previewBarcodeValue)
  const previewQr =
    qrMode === 'manual' && qrUrl.trim()
      ? qrUrl.trim()
      : typeof window !== 'undefined'
        ? `${window.location.origin}/p/your-product-id`
        : 'https://example.com/p/your-product-id'

  const handleScanDetected = (raw: string) => {
    const n = normalizeBarcode(raw)
    setScannerOpen(false)
    if (!isValidProductBarcode(n)) {
      setStepError(
        'That scan is not usable as a catalog barcode (need 4–48 letters or digits). Try again or enter manually.',
      )
      return
    }
    setStepError(null)
    setBarcodeValue(n)
    setManualBarcodeInput(n)
    setUseAutoBarcode(false)
    setStep(2)
  }

  const goNextFromStep1 = () => {
    setStepError(null)
    if (useAutoBarcode) {
      setBarcodeValue('')
      setStep(2)
      return
    }
    const v = normalizeBarcode(manualBarcodeInput)
    if (!isValidProductBarcode(v)) {
      setStepError('Enter 4–48 letters or digits only, or choose “Generate automatically”.')
      return
    }
    setBarcodeValue(v)
    setStep(2)
  }

  const goNextFromStep2 = () => {
    setStepError(null)
    if (!useAutoBarcode) {
      const v = normalizeBarcode(barcodeValue)
      if (!isValidProductBarcode(v)) {
        setStepError('Barcode must be 4–48 letters or digits.')
        return
      }
      setBarcodeValue(v)
    }
    if (qrMode === 'manual') {
      const q = qrUrl.trim()
      if (!q) {
        setStepError('Enter a full URL for the QR code, or switch to the app URL option.')
        return
      }
      try {
        const parsed = new URL(q)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          setStepError('QR URL must use http:// or https://')
          return
        }
      } catch {
        setStepError('QR URL must be a valid http(s) URL.')
        return
      }
    }
    setStep(3)
  }

  const processImageFile = useCallback(
    async (file: File) => {
      setImageFieldError(null)
      setImageHint(null)
      const err = validateProductImageFile(file)
      if (err) {
        setImageFieldError(err)
        return
      }
      if (productImageExceedsUploadLimit(file)) {
        setImageHint('Large file — optimizing before upload…')
      }
      setUploadingImage(true)
      try {
        const prepared = await prepareProductImageForUpload(file)
        if (prepared.size > PRODUCT_IMAGE_MAX_BYTES) {
          setImageFieldError(
            'Image is still over 5MB after compression. Try a smaller original or lower resolution.',
          )
          setImageHint(null)
          return
        }
        const url = await uploadBusinessProductImage(businessId, prepared)
        setPackImageUrl(url)
        setImageHint(null)
      } catch (err) {
        setImageFieldError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not upload image.',
        )
        setImageHint(null)
      } finally {
        setUploadingImage(false)
      }
    },
    [businessId],
  )

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      void processImageFile(file)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitError(null)

    const priceNum = Number(price)
    const stockNum = Number.parseInt(stock, 10)

    if (!name.trim() || !category.trim()) {
      setSubmitError('Name and category are required.')
      return
    }

    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setSubmitError('Enter a valid price greater than zero.')
      return
    }

    if (!Number.isFinite(stockNum) || stockNum < 0) {
      setSubmitError('Stock must be zero or a positive whole number.')
      return
    }

    if (!useAutoBarcode) {
      const v = normalizeBarcode(barcodeValue)
      if (!isValidProductBarcode(v)) {
        setSubmitError('Invalid barcode. Go back to the Codes step.')
        return
      }
    }

    if (qrMode === 'manual') {
      const q = qrUrl.trim()
      if (!q) {
        setSubmitError('QR URL is missing. Go back to the Codes step.')
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
        ...(!useAutoBarcode ? { barcodeValue: normalizeBarcode(barcodeValue) } : {}),
        ...(qrMode === 'manual' ? { qrUrl: qrUrl.trim() } : {}),
        ...(packImageUrl.trim() ? { imageUrl: packImageUrl.trim() } : {}),
      })
      onCreated()
      onClose()
    } catch (err) {
      setSubmitError(
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

  const previewProduct: Product = {
    id: 'preview',
    businessId,
    name: name.trim() || 'Product name',
    price: Number(price) && Number(price) > 0 ? Number(price) : 0,
    category: category.trim() || 'Category',
    stock: Number.isFinite(Number.parseInt(stock, 10)) ? Number.parseInt(stock, 10) : 0,
    imageColor: 'bg-slate-100',
    imageEmoji: '📦',
    imageUrl: packImageUrl || null,
    barcodeValue: useAutoBarcode ? undefined : barcodeValue,
    qrUrl: qrMode === 'manual' ? qrUrl : previewQr,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <ModalOverlay
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Add product</h2>
            <p className="mt-1 text-xs text-slate-500">
              Step {step} of 3 — {STEP_LABELS[step - 1]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ol className="mb-6 flex items-center justify-center gap-1 sm:gap-2" aria-hidden>
          {([1, 2, 3] as const).map((n) => (
            <li key={n} className="flex items-center gap-1 sm:gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  step === n
                    ? 'bg-teal-600 text-white'
                    : step > n
                      ? 'bg-teal-100 text-teal-800'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {n}
              </span>
              {n < 3 ? (
                <span className="hidden w-6 border-t border-slate-200 sm:block sm:w-10" />
              ) : null}
            </li>
          ))}
        </ol>

        {step === 1 ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Scan the barcode on the package or shelf label, type it yourself, or let the system assign
              a unique code.
            </p>
            {barcodeValue && !useAutoBarcode ? (
              <div className="rounded-xl border border-teal-200 bg-teal-50/80 px-3 py-2 text-sm text-teal-900">
                Current code: <span className="font-mono font-semibold">{barcodeValue}</span>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700"
            >
              <Camera className="h-5 w-5" />
              Scan with camera
            </button>
            <div className="relative py-2 text-center text-xs font-medium text-slate-400">
              <span className="bg-white px-2">or enter manually</span>
              <div className="absolute top-1/2 right-0 left-0 -z-10 h-px bg-slate-200" />
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Barcode (4–48 letters or digits)</span>
              <input
                value={manualBarcodeInput}
                onChange={(e) => {
                  setManualBarcodeInput(e.target.value.replace(/\s/g, ''))
                  setUseAutoBarcode(false)
                }}
                placeholder="e.g. 5901234123457 or SKU42ABC"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-teal-500"
                disabled={useAutoBarcode}
              />
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <input
                type="checkbox"
                checked={useAutoBarcode}
                onChange={(e) => {
                  setUseAutoBarcode(e.target.checked)
                  if (e.target.checked) {
                    setStepError(null)
                  }
                }}
                className="mt-1"
              />
              <span className="text-sm text-slate-700">
                <span className="font-medium text-slate-900">Generate barcode automatically</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  We create a unique alphanumeric code when you save (still scannable with your POS).
                </span>
              </span>
            </label>
            {stepError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {stepError}
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
                type="button"
                onClick={goNextFromStep1}
                className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => {
                setStep(1)
                setStepError(null)
              }}
              className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-800"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">Barcode</p>
              {useAutoBarcode ? (
                <p className="text-sm text-slate-600">
                  A unique code will be assigned when you save. POS and labels will use that value.
                </p>
              ) : (
                <input
                  value={barcodeValue}
                  onChange={(e) => setBarcodeValue(e.target.value.replace(/\s/g, ''))}
                  aria-label="Product barcode value"
                  placeholder="4–48 letters or digits"
                  className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
                />
              )}
              <div className="flex justify-center overflow-x-auto rounded-lg bg-white p-2">
                <Barcode
                  value={previewBarcodeValue}
                  format={previewBarcodeFormat}
                  width={1.4}
                  height={48}
                  displayValue
                />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">QR code (URL)</p>
              <div className="mb-3 flex flex-col gap-2 text-sm sm:flex-row sm:gap-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="qrMode"
                    checked={qrMode === 'auto'}
                    onChange={() => setQrMode('auto')}
                  />
                  App product page (/p/…)
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="qrMode"
                    checked={qrMode === 'manual'}
                    onChange={() => setQrMode('manual')}
                  />
                  Custom URL
                </label>
              </div>
              {qrMode === 'manual' ? (
                <input
                  value={qrUrl}
                  onChange={(e) => setQrUrl(e.target.value)}
                  placeholder="https://…"
                  aria-label="Custom QR code URL"
                  className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              ) : null}
              <div className="flex flex-col items-center gap-2 rounded-lg bg-white p-4">
                <QRCode value={previewQr} size={128} />
                <span className="max-w-full truncate text-xs text-slate-500">{previewQr}</span>
              </div>
            </div>
            {stepError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {stepError}
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setStep(1)
                  setStepError(null)
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={goNextFromStep2}
                className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <button
              type="button"
              onClick={() => {
                setStep(2)
                setSubmitError(null)
              }}
              className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-800"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">Product photo</p>
              <p className="mb-2 text-xs text-slate-500">
                JPEG, PNG, WebP, or GIF — up to 5MB on the server. Large photos are resized automatically.
              </p>
              <div
                role="button"
                tabIndex={0}
                aria-label="Drop product image here or use browse to select a file"
                onDragEnter={(e) => {
                  e.preventDefault()
                  setDragActive(true)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  setDragActive(false)
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    document.getElementById('add-product-file-input')?.click()
                  }
                }}
                className={`rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                  dragActive
                    ? 'border-teal-500 bg-teal-50/80'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                } ${uploadingImage ? 'pointer-events-none opacity-70' : ''}`}
              >
                <ImageIcon className="mx-auto mb-2 h-10 w-10 text-slate-400" />
                <p className="text-sm text-slate-600">
                  {uploadingImage ? 'Uploading…' : 'Drag and drop an image here, or choose a file'}
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-teal-700 shadow-sm ring-1 ring-slate-200 hover:bg-teal-50">
                    <Upload className="h-4 w-4" />
                    Browse files
                    <input
                      id="add-product-file-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      aria-label="Choose product image file"
                      className="hidden"
                      disabled={uploadingImage}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.currentTarget.value = ''
                        if (file) {
                          void processImageFile(file)
                        }
                      }}
                    />
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                    Take photo
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      capture="environment"
                      aria-label="Take product photo with camera"
                      className="hidden"
                      disabled={uploadingImage}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.currentTarget.value = ''
                        if (file) {
                          void processImageFile(file)
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
              {imageHint ? (
                <p className="mt-2 text-xs text-teal-700">{imageHint}</p>
              ) : null}
              {imageFieldError ? (
                <p className="mt-2 text-sm text-red-600">{imageFieldError}</p>
              ) : null}
              {packImageUrl ? (
                <div className="mt-4 flex flex-wrap items-start gap-4 rounded-xl border border-slate-100 bg-white p-3">
                  <img
                    src={packImageUrl}
                    alt="Product preview"
                    className="h-32 w-32 rounded-lg border border-slate-200 object-contain"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-500">Current image</p>
                    <p className="mt-1 break-all font-mono text-[10px] text-slate-400">{packImageUrl}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setPackImageUrl('')
                        setImageFieldError(null)
                      }}
                      className="mt-2 text-xs font-medium text-red-600 underline hover:text-red-700"
                    >
                      Remove image
                    </button>
                  </div>
                </div>
              ) : null}
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
              <p className="mb-3 text-sm font-semibold text-slate-800">Preview</p>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm">
                <ProductThumb
                  product={previewProduct}
                  size="lg"
                  className="h-28 w-full rounded-none rounded-t-xl"
                />
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-1 font-semibold text-slate-800">{previewProduct.name}</h3>
                    <span className="shrink-0 font-bold text-teal-600">D{previewProduct.price || '—'}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{previewProduct.category}</p>
                  <p className="mt-2 text-xs text-slate-600">{previewProduct.stock} in stock</p>
                </div>
              </div>
            </div>

            {submitError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {submitError}
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
                disabled={submitting || uploadingImage}
                className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {submitting ? 'Saving…' : 'Save product'}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      <CameraBarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        title="Scan product barcode"
        onDetected={handleScanDetected}
      />
    </div>
  )
}
