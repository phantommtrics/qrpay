import { useCallback, useEffect, useMemo, useState, type FormEvent, type DragEvent } from 'react'
import Barcode from 'react-barcode'
import { ChevronLeft, ImageIcon, Upload, X } from 'lucide-react'

import { ModalOverlay } from '../ui/ModalOverlay'
import { SearchableListbox } from '../ui/SearchableListbox'
import { ProductThumb } from './ProductThumb'
import {
  ApiError,
  createBusinessProduct,
  fetchMenuCategories,
  type MenuCategoryRow,
  uploadBusinessProductImage,
} from '../../services/subscriptionApi'
import type { Product } from '../../types'
import { inferBarcodeFormat } from '../../utils/barcodeFormat'
import { categoryBreadcrumb, leafMenuCategories } from '../../utils/menuCategoryTree'
import {
  prepareProductImageForUpload,
  productImageExceedsUploadLimit,
  PRODUCT_IMAGE_MAX_BYTES,
  validateProductImageFile,
} from '../../utils/imageUpload'

type Step = 1 | 2

const STEP_LABELS = ['Barcode', 'Details & save'] as const

export function AddProductModal({
  businessId,
  onClose,
  onCreated,
  mode = 'retail',
}: {
  businessId: string
  onClose: () => void
  onCreated: () => void
  mode?: 'retail' | 'restaurant'
}) {
  const isRestaurant = mode === 'restaurant'
  const [step, setStep] = useState<Step>(isRestaurant ? 2 : 1)

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [menuCategoryId, setMenuCategoryId] = useState('')
  const [menuRows, setMenuRows] = useState<MenuCategoryRow[]>([])
  const [menuLoadError, setMenuLoadError] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('0')

  const [packImageUrl, setPackImageUrl] = useState('')
  const [imageHint, setImageHint] = useState<string | null>(null)
  const [imageFieldError, setImageFieldError] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const previewBarcodeValue = 'AUTOASSIGN'
  const previewBarcodeFormat = inferBarcodeFormat(previewBarcodeValue)

  useEffect(() => {
    if (!isRestaurant) {
      setMenuRows([])
      setMenuLoadError(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const rows = await fetchMenuCategories(businessId)
        if (!cancelled) {
          setMenuRows(rows)
          setMenuLoadError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setMenuRows([])
          setMenuLoadError(
            e instanceof ApiError ? e.message : 'Could not load menu categories.',
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [businessId, isRestaurant])

  const leafRows = useMemo(() => leafMenuCategories(menuRows), [menuRows])

  const leafPickerOptions = useMemo(
    () =>
      leafRows.map((r) => ({
        id: r.id,
        label: categoryBreadcrumb(menuRows, r.id),
      })),
    [leafRows, menuRows],
  )

  const detailsComplete = useMemo(() => {
    const priceNum = Number(price)
    const stockNum = Number.parseInt(stock, 10)
    const base =
      name.trim().length > 0 &&
      Number.isFinite(priceNum) &&
      priceNum > 0 &&
      Number.isFinite(stockNum) &&
      stockNum >= 0
    if (isRestaurant) {
      return base && menuCategoryId.length > 0 && !menuLoadError
    }
    return base && category.trim().length > 0
  }, [name, category, price, stock, isRestaurant, menuCategoryId, menuLoadError])

  const canSaveProduct = detailsComplete && !uploadingImage && !submitting

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

    if (!canSaveProduct) {
      return
    }

    const priceNum = Number(price)
    const stockNum = Number.parseInt(stock, 10)

    setSubmitting(true)
    try {
      await createBusinessProduct(businessId, {
        name: name.trim(),
        ...(isRestaurant
          ? { menuCategoryId: menuCategoryId.trim() }
          : { category: category.trim() }),
        description: description.trim() || undefined,
        price: priceNum,
        stock: stockNum,
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
    category: isRestaurant
      ? (menuCategoryId ? categoryBreadcrumb(menuRows, menuCategoryId) : 'Category')
      : category.trim() || 'Category',
    stock: Number.isFinite(Number.parseInt(stock, 10)) ? Number.parseInt(stock, 10) : 0,
    imageColor: 'bg-slate-100',
    imageEmoji: '📦',
    imageUrl: packImageUrl || null,
    barcodeValue: undefined,
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
              {isRestaurant
                ? 'Restaurant menu item (leaf category)'
                : `Step ${step} of 2 — ${STEP_LABELS[step - 1]}`}
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

        {!isRestaurant ? (
          <ol className="mb-6 flex items-center justify-center gap-2 sm:gap-4" aria-hidden>
            {([1, 2] as const).map((n) => (
              <li key={n} className="flex items-center gap-2 sm:gap-4">
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
                {n < 2 ? <span className="hidden w-10 border-t border-slate-200 sm:block" /> : null}
              </li>
            ))}
          </ol>
        ) : null}

        {!isRestaurant && step === 1 ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Barcode is generated automatically by the system for POS and printing labels. Continue to
              fill in product details.
            </p>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-center text-xs font-medium text-slate-500">Preview</p>
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
                onClick={() => setStep(2)}
                className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {(isRestaurant || step === 2) ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            {!isRestaurant ? (
              <button
                type="button"
                onClick={() => {
                  setStep(1)
                  setSubmitError(null)
                }}
                className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-800"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            ) : null}

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">Product photo</p>
              <p className="mb-2 text-xs text-slate-500">
                JPEG, PNG, WebP, or GIF — up to 5MB. Large photos are resized automatically.
              </p>
              <div
                className={`relative flex h-52 w-full max-w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-slate-50 transition-colors ${
                  dragActive ? 'border-teal-500 bg-teal-50/80' : 'border-slate-200'
                } ${uploadingImage ? 'pointer-events-none opacity-70' : ''}`}
                role="region"
                aria-label="Product image"
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
              >
                {packImageUrl ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setPackImageUrl('')
                        setImageFieldError(null)
                      }}
                      className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70 text-white shadow-md hover:bg-slate-900"
                      aria-label="Remove image"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <img
                      src={packImageUrl}
                      alt=""
                      className="max-h-full max-w-full object-contain p-3"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 flex-wrap justify-center gap-2">
                      <label className="cursor-pointer rounded-lg bg-white/95 px-3 py-1 text-xs font-medium text-teal-700 shadow-sm ring-1 ring-slate-200 backdrop-blur-sm hover:bg-white">
                        Replace
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          aria-label="Replace product image"
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
                  </>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Drop product image here or use browse to select a file"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        document.getElementById('add-product-file-input')?.click()
                      }
                    }}
                    className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center"
                  >
                    <ImageIcon className="h-10 w-10 text-slate-400" />
                    <p className="text-sm text-slate-600">Drag and drop, browse, or take a photo</p>
                    <div className="mt-1 flex flex-wrap justify-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-teal-700 shadow-sm ring-1 ring-slate-200 hover:bg-teal-50">
                        <Upload className="h-3.5 w-3.5" />
                        Browse
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
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                        Camera
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
                )}
              </div>
              {imageHint ? <p className="mt-2 text-xs text-teal-700">{imageHint}</p> : null}
              {imageFieldError ? <p className="mt-2 text-sm text-red-600">{imageFieldError}</p> : null}
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
            {isRestaurant ? (
              <div>
                <SearchableListbox
                  fieldLabel="Menu category (leaf)"
                  fieldLabelClassName="text-sm font-medium text-slate-700"
                  options={leafPickerOptions}
                  value={menuCategoryId}
                  onChange={setMenuCategoryId}
                  placeholder="Search categories…"
                  listId="add-product-menu-category-list"
                  disabled={Boolean(menuLoadError)}
                />
                {menuLoadError ? (
                  <p className="mt-1 text-xs text-red-600">{menuLoadError}</p>
                ) : leafRows.length === 0 && !menuLoadError ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Create a leaf category under Restaurant setup first.
                  </p>
                ) : null}
              </div>
            ) : (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Category</span>
                <input
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-teal-500"
                />
              </label>
            )}
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
                <div className="h-28 w-full overflow-hidden bg-slate-100">
                  <ProductThumb
                    product={previewProduct}
                    size="lg"
                    imageFit="cover"
                    className="h-28 w-full max-w-none rounded-none"
                  />
                </div>
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
                disabled={!canSaveProduct}
                className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-80"
              >
                {submitting ? 'Saving…' : 'Save product'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  )
}
