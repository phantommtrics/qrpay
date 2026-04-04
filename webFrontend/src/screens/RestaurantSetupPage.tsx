import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Download, Plus, Trash2 } from 'lucide-react'
import QRCode from 'react-qr-code'

import { FlashNotice } from '../components/ui/FlashNotice'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import {
  ApiError,
  createDiningTable,
  createMenuCategory,
  deleteDiningTable,
  deleteMenuCategory,
  fetchDiningTables,
  fetchMenuCategories,
  type DiningTableRow,
  type MenuCategoryRow,
} from '../services/subscriptionApi'
import { downloadSvgAsPng, sanitizeDownloadBasename } from '../utils/downloadSvgAsPng'
import { isRestaurantIndustry } from '../utils/businessIndustry'

function DiningTableMenuQrCard({ tableLabel, menuUrl }: { tableLabel: string; menuUrl: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  return (
    <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white p-4">
      <p className="mb-3 text-xs text-slate-600">
        Print this QR and place it on the table. It always opens the live menu for this table; you can add
        or change products anytime without reprinting.
      </p>
      <div
        ref={wrapRef}
        className="inline-flex rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100"
      >
        <QRCode value={menuUrl} size={200} level="H" />
      </div>
      {downloadError ? (
        <p className="mt-2 text-xs text-red-600">{downloadError}</p>
      ) : null}
      <button
        type="button"
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        onClick={async () => {
          setDownloadError(null)
          try {
            const svg = wrapRef.current?.querySelector('svg')
            await downloadSvgAsPng(
              svg as SVGSVGElement | null,
              `${sanitizeDownloadBasename(tableLabel)}-table-menu-qr`,
            )
          } catch (e) {
            setDownloadError(e instanceof Error ? e.message : 'Could not download.')
          }
        }}
      >
        <Download className="h-4 w-4" />
        Download QR (PNG)
      </button>
    </div>
  )
}

/** Full URL for printed QR codes (app uses HashRouter — guest path lives in the hash). */
function guestMenuUrl(slug: string, token: string) {
  const segment = `/b/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`
  if (typeof window === 'undefined') {
    return `#${segment}`
  }
  const { origin, pathname } = window.location
  const base = pathname.endsWith('/') ? `${origin}${pathname}` : `${origin}${pathname}/`
  return `${base}#${segment}`
}

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

export function RestaurantSetupPage() {
  const { currentOrganization, canAccess, user } = useAuth()
  const businessId = currentOrganization?.id
  const slug = currentOrganization?.slug ?? ''
  const allowed = Boolean(currentOrganization && isRestaurantIndustry(currentOrganization.industry))

  const [tables, setTables] = useState<DiningTableRow[]>([])
  const [categories, setCategories] = useState<MenuCategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const [newTableLabel, setNewTableLabel] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [newCatParent, setNewCatParent] = useState<string>('')

  const canCreate = canAccess('products.create')
  const canEdit = canAccess('products.edit')
  const canDelete = canAccess('products.delete')

  const load = useCallback(async () => {
    if (!businessId || !allowed) {
      setTables([])
      setCategories([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [t, c] = await Promise.all([fetchDiningTables(businessId), fetchMenuCategories(businessId)])
      setTables(t)
      setCategories(c)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load restaurant setup.')
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
    <PageTransition className="mx-auto max-w-4xl space-y-10 px-4 py-6">
      <FlashNotice message={flash} onDismiss={() => setFlash(null)} />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Restaurant setup</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create menu categories (tree), dining tables, and copy guest menu URLs for QR codes.
        </p>
      </div>

      {showGate ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Restaurant setup is only available when your business industry is Restaurant.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading && allowed ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {!loading && allowed ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Menu categories</h2>
            <p className="mt-1 text-sm text-slate-600">
              Products must be assigned to a <strong>leaf</strong> category (one with no subcategories).
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
                  setFlash(
                    err instanceof ApiError ? err.message : 'Could not create category.',
                  )
                }
              }}
            >
              <label className="block flex-1">
                <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
                <input
                  value={newCatName}
                  onChange={(ev) => setNewCatName(ev.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="e.g. Starters"
                />
              </label>
              <label className="block w-full sm:w-56">
                <span className="mb-1 block text-xs font-medium text-slate-600">Parent (optional)</span>
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
                          setFlash(
                            err instanceof ApiError ? err.message : 'Could not delete.',
                          )
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

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Dining tables & QR</h2>
            <p className="mt-1 text-sm text-slate-600">
              Each table gets a stable link: <code className="text-xs">/b/{slug || 'your-slug'}/…</code>
            </p>

            <form
              className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!businessId || !canCreate || !newTableLabel.trim()) return
                try {
                  await createDiningTable(businessId, { label: newTableLabel.trim() })
                  setNewTableLabel('')
                  setFlash('Table created.')
                  void load()
                } catch (err) {
                  setFlash(err instanceof ApiError ? err.message : 'Could not create table.')
                }
              }}
            >
              <label className="block flex-1">
                <span className="mb-1 block text-xs font-medium text-slate-600">Table label</span>
                <input
                  value={newTableLabel}
                  onChange={(ev) => setNewTableLabel(ev.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="e.g. Table 4"
                />
              </label>
              <button
                type="submit"
                disabled={!canCreate}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:bg-slate-300"
              >
                <Plus className="h-4 w-4" />
                Add table
              </button>
            </form>

            <ul className="mt-6 space-y-4">
              {tables.length === 0 ? (
                <li className="text-sm text-slate-500">No tables yet. Add one to get a guest URL.</li>
              ) : (
                tables.map((t) => {
                  const url = guestMenuUrl(slug, t.publicToken)
                  return (
                    <li
                      key={t.id}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{t.label}</span>
                        {!t.isActive ? (
                          <span className="text-xs text-amber-700">Inactive</span>
                        ) : null}
                      </div>
                      <p className="mt-2 break-all font-mono text-xs text-slate-600">{url}</p>
                      <DiningTableMenuQrCard tableLabel={t.label} menuUrl={url} />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(url)
                            setFlash('Link copied.')
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy URL
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={async () => {
                            if (!businessId || !canEdit) return
                            try {
                              await deleteDiningTable(businessId, t.id)
                              setFlash('Table removed.')
                              void load()
                            } catch (err) {
                              setFlash(
                                err instanceof ApiError ? err.message : 'Could not remove table.',
                              )
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>
                    </li>
                  )
                })
              )}
            </ul>
          </section>
        </>
      ) : null}
    </PageTransition>
  )
}
