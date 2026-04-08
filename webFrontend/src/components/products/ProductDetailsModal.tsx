import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import Barcode from 'react-barcode'
import { Download, Edit, ImageIcon, Loader2, X } from 'lucide-react'

import { ModalOverlay } from '../ui/ModalOverlay'
import { SearchableListbox } from '../ui/SearchableListbox'
import { useAuth } from '../../features/auth/AuthContext'
import type { Product } from '../../types'
import {
  ApiError,
  fetchMenuCategories,
  updateBusinessProduct,
  uploadBusinessProductImage,
  type MenuCategoryRow,
} from '../../services/subscriptionApi'
import { inferBarcodeFormat, type RetailBarcodeFormat } from '../../utils/barcodeFormat'
import { isProductCatalogIndustry, isRestaurantIndustry } from '../../utils/businessIndustry'
import { categoryBreadcrumb, leafMenuCategories } from '../../utils/menuCategoryTree'
import { ProductThumb } from './ProductThumb'
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
  const barcodeHostRef = useRef<HTMLDivElement>(null)
  const { currentOrganization } = useAuth()
  const isRestaurantProduct = isRestaurantIndustry(currentOrganization?.industry)
  const usesCatalogMenuCategories = isProductCatalogIndustry(currentOrganization?.industry)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(product.name)
  const [category, setCategory] = useState(product.category)
  const [description, setDescription] = useState(product.description ?? '')
  const [price, setPrice] = useState(String(product.price))
  const [stock, setStock] = useState(String(product.stock))
  const [packImageUrl, setPackImageUrl] = useState(product.imageUrl ?? '')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageFieldError, setImageFieldError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloadingBarcode, setDownloadingBarcode] = useState(false)

  const [menuRows, setMenuRows] = useState<MenuCategoryRow[]>([])
  const [menuLoadError, setMenuLoadError] = useState<string | null>(null)
  const [menuCategoryIdEdit, setMenuCategoryIdEdit] = useState(product.menuCategoryId ?? '')

  useEffect(() => {
    setEditing(false)
    const s = syncFormFromProduct(product)
    setName(s.name)
    setCategory(s.category)
    setDescription(s.description)
    setPrice(s.price)
    setStock(s.stock)
    setPackImageUrl(s.packImageUrl)
    setMenuCategoryIdEdit(product.menuCategoryId ?? '')
    setSaveError(null)
    setImageFieldError(null)
    setDownloadError(null)
  }, [product])

  useEffect(() => {
    if (!editing || !usesCatalogMenuCategories || !businessId) {
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
          setMenuLoadError(e instanceof ApiError ? e.message : 'Could not load menu categories.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editing, businessId, usesCatalogMenuCategories])

  const leafRows = useMemo(() => leafMenuCategories(menuRows), [menuRows])
  const leafPickerOptions = useMemo(
    () =>
      leafRows.map((r) => ({
        id: r.id,
        label: categoryBreadcrumb(menuRows, r.id),
      })),
    [leafRows, menuRows],
  )

  const barcodeVal = product.barcodeValue ?? ''
  const barcodeFormat: RetailBarcodeFormat = inferBarcodeFormat(barcodeVal || 'x')

  const displayProduct: Product = editing
    ? {
        ...product,
        name: name.trim() || product.name,
        category: usesCatalogMenuCategories
          ? menuCategoryIdEdit.trim()
            ? categoryBreadcrumb(menuRows, menuCategoryIdEdit) || product.category
            : product.category
          : category.trim() || product.category,
        price: Number(price) || product.price,
        stock: Number.parseInt(stock, 10) || product.stock,
        description: description.trim() || undefined,
        imageUrl: packImageUrl || null,
        menuCategoryId: usesCatalogMenuCategories ? menuCategoryIdEdit.trim() || null : product.menuCategoryId,
      }
    : product

  const isDirty = useMemo(() => {
    if (!editing) {
      return false
    }
    const d0 = (product.description ?? '').trim()
    const d1 = description.trim()
    const img0 = product.imageUrl ?? ''
    const img1 = packImageUrl.trim()
    const catDirty = usesCatalogMenuCategories
      ? menuCategoryIdEdit !== (product.menuCategoryId ?? '')
      : category.trim() !== product.category
    return (
      name.trim() !== product.name ||
      catDirty ||
      d0 !== d1 ||
      Number(price) !== product.price ||
      Number.parseInt(stock, 10) !== product.stock ||
      img0 !== img1
    )
  }, [
    editing,
    name,
    category,
    menuCategoryIdEdit,
    description,
    price,
    stock,
    packImageUrl,
    product,
    usesCatalogMenuCategories,
  ])

  const baseName = sanitizeDownloadBasename(product.name)

  const handleDownloadBarcode = async () => {
    setDownloadError(null)
    if (!barcodeVal) {
      setDownloadError('No barcode to export.')
      return
    }
    setDownloadingBarcode(true)
    try {
      const svg = barcodeHostRef.current?.querySelector('svg')
      await downloadSvgAsPng(svg ?? null, `${baseName}-barcode`)
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Could not download barcode.')
    } finally {
      setDownloadingBarcode(false)
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

    if (!isDirty) {
      return
    }

    const priceNum = Number(price)
    const stockNum = Number.parseInt(stock, 10)

    if (!name.trim()) {
      setSaveError('Name is required.')
      return
    }
    if (usesCatalogMenuCategories) {
      if (!menuCategoryIdEdit.trim()) {
        setSaveError('Select a category (leaf).')
        return
      }
    } else if (!category.trim()) {
      setSaveError('Category is required.')
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

    setSaving(true)
    try {
      const updated = await updateBusinessProduct(businessId, product.id, {
        name: name.trim(),
        ...(usesCatalogMenuCategories
          ? { menuCategoryId: menuCategoryIdEdit.trim() }
          : { category: category.trim() }),
        description: description.trim() ? description.trim() : null,
        price: priceNum,
        stock: stockNum,
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
    setPackImageUrl(s.packImageUrl)
    setMenuCategoryIdEdit(product.menuCategoryId ?? '')
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
          {!editing ? (
            <div className="relative mb-6 w-full">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] ring-1 ring-inset ring-slate-900/5">
                <div className="absolute inset-0">
                  <ProductThumb
                    product={displayProduct}
                    size="fill"
                    imageFit="cover"
                    imageAlt={displayProduct.name}
                    className="rounded-none"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="absolute top-3 right-3 z-10 rounded-full bg-white/95 p-2 text-slate-600 shadow-md ring-1 ring-slate-200/90 backdrop-blur-sm transition-colors hover:bg-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}

          {!editing ? (
            <>
              <h2 className="mb-1 text-2xl font-bold text-slate-800">{product.name}</h2>
              {usesCatalogMenuCategories && !product.menuCategoryId ? (
                <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {isRestaurantProduct
                    ? 'This item has no menu category (for example if the category was deleted). Edit the product and choose a leaf category to put it back on the guest menu.'
                    : 'This item has no category (for example if the category was deleted). Edit the product and choose a leaf category.'}
                </p>
              ) : null}
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
              <p className="mb-3 text-xs text-slate-500">
                Barcode and product link are fixed after creation. Update name, pricing, stock, or photo
                below.
              </p>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                </label>
                {usesCatalogMenuCategories ? (
                  <div>
                    {!product.menuCategoryId ? (
                      <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        {isRestaurantProduct
                          ? 'Select a leaf category so this product appears on the guest menu again.'
                          : 'Select a leaf category for this product.'}
                      </p>
                    ) : null}
                    <SearchableListbox
                      fieldLabel={isRestaurantProduct ? 'Menu category (leaf)' : 'Product category (leaf)'}
                      fieldLabelClassName="text-xs font-medium text-slate-600"
                      options={leafPickerOptions}
                      value={menuCategoryIdEdit}
                      onChange={setMenuCategoryIdEdit}
                      placeholder="Search categories…"
                      listId="edit-product-menu-category-list"
                      disabled={Boolean(menuLoadError)}
                    />
                    {menuLoadError ? (
                      <p className="mt-1 text-xs text-red-600">{menuLoadError}</p>
                    ) : leafRows.length === 0 && !menuLoadError ? (
                      <p className="mt-1 text-xs text-amber-700">
                        {isRestaurantProduct
                          ? 'Create a leaf category under Menu setup first.'
                          : 'Create a leaf category under Catalog → Categories first.'}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Category</span>
                    <input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                    />
                  </label>
                )}
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

                <div>
                  <span className="mb-2 block text-xs font-medium text-slate-600">Photo</span>
                  <div className="relative aspect-[4/3] w-full max-w-md overflow-hidden rounded-xl bg-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] ring-1 ring-inset ring-slate-900/5">
                    {packImageUrl ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setPackImageUrl('')
                            setImageFieldError(null)
                          }}
                          className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-md ring-1 ring-slate-200/90 backdrop-blur-sm hover:bg-white"
                          aria-label="Remove image"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <img
                          src={packImageUrl}
                          alt={name.trim() || 'Product photo'}
                          className="absolute inset-0 h-full w-full object-cover object-center"
                          referrerPolicy="no-referrer"
                        />
                      </>
                    ) : null}
                    {uploadingImage ? (
                      <div className="absolute inset-0 z-[5] flex items-center justify-center bg-slate-900/25 backdrop-blur-[2px]">
                        <Loader2 className="h-9 w-9 animate-spin text-white drop-shadow-md" />
                      </div>
                    ) : null}
                    {!packImageUrl ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                        <ImageIcon className="h-8 w-8 text-slate-400" />
                        <p className="text-xs text-slate-600">Take a photo or upload</p>
                        <div className="flex flex-wrap justify-center gap-2">
                          <label className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-teal-700 shadow-sm ring-1 ring-slate-200 hover:bg-teal-50">
                            {uploadingImage ? 'Uploading…' : 'Upload'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              className="hidden"
                              disabled={uploadingImage}
                              aria-label="Upload product image"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                e.currentTarget.value = ''
                                if (file) {
                                  void processImageFile(file)
                                }
                              }}
                            />
                          </label>
                          <label className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                            Camera
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              capture="environment"
                              className="hidden"
                              disabled={uploadingImage}
                              aria-label="Take product photo"
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
                    ) : null}
                  </div>
                  {imageFieldError ? (
                    <p className="mt-2 text-xs text-red-600">{imageFieldError}</p>
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
                  disabled={!isDirty || saving || uploadingImage}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-teal-600 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-80"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="flex w-full flex-col items-center justify-center bg-slate-50 p-6 text-center md:w-[min(100%,22rem)] md:shrink-0">
          <h3 className="mb-4 font-semibold text-slate-800">Barcode</h3>

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

          <button
            type="button"
            disabled={!barcodeVal || downloadingBarcode}
            onClick={() => void handleDownloadBarcode()}
            className="mt-6 flex w-full max-w-xs items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloadingBarcode ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download barcode (PNG)
          </button>
        </div>
      </motion.div>
    </div>
  )
}
