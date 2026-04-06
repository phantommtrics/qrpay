import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'

import { ConfirmModal } from '../components/ui/ConfirmModal'
import { SearchableListbox } from '../components/ui/SearchableListbox'
import { FlashNotice } from '../components/ui/FlashNotice'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  ApiError,
  createMenuCategory,
  deleteMenuCategory,
  fetchMenuCategories,
  type MenuCategoryRow,
} from '../services/subscriptionApi'
import { categoryBreadcrumb, orderedCategoryTree } from '../utils/menuCategoryTree'
import { isRestaurantIndustry } from '../utils/businessIndustry'

export function RestaurantMenuSetupPage() {
  const { currentOrganization, canAccess, user } = useAuth()
  const businessId = currentOrganization?.id
  const allowed = Boolean(currentOrganization && isRestaurantIndustry(currentOrganization.industry))

  const [categories, setCategories] = useState<MenuCategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const [newCatName, setNewCatName] = useState('')
  const [newCatParent, setNewCatParent] = useState<string>('')

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
    hasChildren: boolean
  } | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  const canCreate = canAccess('products.create')
  /** Menu categories use the same permission as adding categories (not `products.delete`, which is for SKU removal on many plans). */
  const canDeleteCategory = canCreate

  const load = useCallback(async () => {
    if (!businessId || !allowed) {
      setCategories([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const c = await fetchMenuCategories(businessId)
      setCategories(c)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load menu categories.')
    } finally {
      setLoading(false)
    }
  }, [businessId, allowed])

  useEffect(() => {
    void load()
  }, [load])

  const treeOrdered = useMemo(() => orderedCategoryTree(categories), [categories])

  const parentPickerOptions = useMemo(
    () =>
      treeOrdered.map(({ row, depth }) => ({
        id: row.id,
        label: categoryBreadcrumb(categories, row.id),
        depth,
      })),
    [treeOrdered, categories],
  )

  const showGate =
    Boolean(currentOrganization) && !allowed && !user?.isPlatformOwner && !user?.isPlatformAdmin

  const closeDeleteModal = () => {
    if (!deleteSubmitting) {
      setDeleteTarget(null)
    }
  }

  const runDeleteCategory = () => {
    if (!businessId || !deleteTarget) return
    void (async () => {
      setDeleteSubmitting(true)
      try {
        await deleteMenuCategory(businessId, deleteTarget.id)
        setFlash(deleteTarget.hasChildren ? 'Category tree deleted.' : 'Category deleted.')
        setDeleteTarget(null)
        void load()
      } catch (err) {
        setFlash(err instanceof ApiError ? err.message : 'Could not delete.')
      } finally {
        setDeleteSubmitting(false)
      }
    })()
  }

  return (
    <PageTransition className="mx-auto max-w-4xl space-y-8 px-4 py-6">
      <FlashNotice message={flash} onDismiss={() => setFlash(null)} />

      <ConfirmModal
        open={deleteTarget != null}
        title={
          deleteTarget == null
            ? ''
            : deleteTarget.hasChildren
              ? `Delete “${deleteTarget.name}” and subcategories?`
              : `Delete “${deleteTarget.name}”?`
        }
        variant="danger"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleteSubmitting}
        onCancel={closeDeleteModal}
        onConfirm={runDeleteCategory}
      >
        {deleteTarget?.hasChildren ? (
          <p>
            This removes the whole branch under this category. Products in any of those categories will be
            unassigned from the menu until you assign a category again when editing each product.
          </p>
        ) : (
          <p>
            Products that use this category will be unassigned from the menu until you assign another
            category.
          </p>
        )}
      </ConfirmModal>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Menu setup</h1>
          <p className="mt-1 text-sm text-slate-600">
            Build your menu tree: top-level sections and nested sub-menus. Products are added under{' '}
            <span className="font-medium text-slate-800">leaf</span> categories (no children below them).
          </p>
        </div>
        {allowed ? (
          <Link
            to={APP_PATHS.restaurantTables}
            className="shrink-0 text-sm font-medium text-teal-600 hover:text-teal-700 hover:underline"
          >
            Dining tables &amp; QR →
          </Link>
        ) : null}
      </div>

      {showGate ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Menu setup is only available when your business industry is Restaurant.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading && allowed ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {!loading && allowed ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Categories</h2>
          <p className="mt-1 text-sm text-slate-600">
            Categories below follow tree order (parent, then children). Use “Main menu” to nest under an
            existing category or leave as top level.
          </p>

          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!businessId || !canCreate || !newCatName.trim()) return
              try {
                await createMenuCategory(businessId, {
                  name: newCatName.trim(),
                  parentId: newCatParent || null,
                })
                setNewCatName('')
                setNewCatParent('')
                setFlash('Category created.')
                void load()
              } catch (err) {
                setFlash(err instanceof ApiError ? err.message : 'Could not create category.')
              }
            }}
          >
            <label className="block flex-1">
              <span className="mb-1 block text-xs font-medium text-slate-600">Menu name</span>
              <input
                value={newCatName}
                onChange={(ev) => setNewCatName(ev.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                placeholder="e.g. Starters"
              />
            </label>
            <div className="w-full sm:w-64 sm:shrink-0">
              <SearchableListbox
                fieldLabel="Main menu"
                options={parentPickerOptions}
                value={newCatParent}
                onChange={setNewCatParent}
                placeholder="Top level — leave empty, or search to nest under…"
                listId="restaurant-menu-parent-picker"
                disabled={!canCreate}
              />
            </div>
            <button
              type="submit"
              disabled={!canCreate}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:bg-slate-300"
            >
              <Plus className="h-4 w-4" />
              Add category
            </button>
          </form>

          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80">
            {categories.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No categories yet.</p>
            ) : (
              <ul className="divide-y divide-slate-200 bg-white">
                {treeOrdered.map(({ row, depth }) => {
                  const path = categoryBreadcrumb(categories, row.id)
                  const isRoot = depth === 0
                  const hasChildren = categories.some((c) => c.parentId === row.id)
                  return (
                    <li key={row.id} className="group">
                      <div className="flex flex-wrap items-start justify-between gap-3 px-3 py-3 sm:px-4 sm:py-3.5">
                        <div
                          className="min-w-0 flex-1 border-l-2 border-teal-200/80 pl-3 transition-colors group-hover:border-teal-400/90"
                          style={{ marginLeft: `${depth * 0.75}rem` }}
                        >
                          <p className="font-medium text-slate-900">{row.name}</p>
                          {!isRoot ? (
                            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{path}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          disabled={!canDeleteCategory}
                          onClick={() => {
                            if (!canDeleteCategory) return
                            setDeleteTarget({
                              id: row.id,
                              name: row.name,
                              hasChildren,
                            })
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </PageTransition>
  )
}
