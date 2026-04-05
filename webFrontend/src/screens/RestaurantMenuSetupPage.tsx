import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'

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
import { isRestaurantIndustry } from '../utils/businessIndustry'

function categoryBreadcrumb(rows: MenuCategoryRow[], id: string): string {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const parts: string[] = []
  let cur: MenuCategoryRow | undefined = byId.get(id)
  let guard = 0
  while (cur && guard++ < 32) {
    parts.unshift(cur.name)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return parts.join(' → ')
}

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

  const canCreate = canAccess('products.create')
  const canDelete = canAccess('products.delete')

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

  const parentOptions = useMemo(() => categories, [categories])

  const showGate =
    Boolean(currentOrganization) && !allowed && !user?.isPlatformOwner && !user?.isPlatformAdmin

  return (
    <PageTransition className="mx-auto max-w-4xl space-y-8 px-4 py-6">
      <FlashNotice message={flash} onDismiss={() => setFlash(null)} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Menu setup</h1>
          <p className="mt-1 text-sm text-slate-600">
            {/* Build your category tree. Products are assigned to a <strong>leaf</strong> category (no
            subcategories under it). */}
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
            {/* Add top-level sections (e.g. Starters) or nest under a parent for sub-menus. */}
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
              <span className="mb-1 block text-xs font-medium text-slate-600">Menu Name</span>
              <input
                value={newCatName}
                onChange={(ev) => setNewCatName(ev.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="e.g. Starters"
              />
            </label>
            <label className="block w-full sm:w-56">
              <span className="mb-1 block text-xs font-medium text-slate-600">Main Menu</span>
              <select
                value={newCatParent}
                onChange={(ev) => setNewCatParent(ev.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">— Top level —</option>
                {parentOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryBreadcrumb(categories, c.id)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={!canCreate}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:bg-slate-300"
            >
              <Plus className="h-4 w-4" />
              Add category
            </button>
          </form>

          <ul className="mt-6 divide-y divide-slate-100">
            {categories.length === 0 ? (
              <li className="py-4 text-sm text-slate-500">No categories yet.</li>
            ) : (
              categories.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <span className="font-medium text-slate-800">
                    {categoryBreadcrumb(categories, c.id)}
                  </span>
                  <button
                    type="button"
                    disabled={!canDelete}
                    onClick={async () => {
                      if (!businessId || !canDelete) return
                      if (!window.confirm('Delete this category?')) return
                      try {
                        await deleteMenuCategory(businessId, c.id)
                        setFlash('Category deleted.')
                        void load()
                      } catch (err) {
                        setFlash(err instanceof ApiError ? err.message : 'Could not delete.')
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
      ) : null}
    </PageTransition>
  )
}
