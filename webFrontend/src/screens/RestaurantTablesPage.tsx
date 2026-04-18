import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Copy, Plus, Printer, Trash2 } from 'lucide-react'

import { TableGuestTentCard } from '../components/restaurant/TableGuestTentCard'
import { FlashNotice } from '../components/ui/FlashNotice'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  ApiError,
  createDiningTable,
  deleteDiningTable,
  fetchDiningTables,
  type DiningTableRow,
} from '../services/subscriptionApi'
import { fetchOrderCheckoutWallets, type OrderCheckoutWalletRow } from '../services/salesApi'
import { guestMenuUrl } from '../utils/guestMenuUrl'
import { isRestaurantIndustry } from '../utils/businessIndustry'

export function RestaurantTablesPage() {
  const { currentOrganization, canAccess, user } = useAuth()
  const businessId = currentOrganization?.id
  const slug = currentOrganization?.slug ?? ''
  const businessName = currentOrganization?.name ?? ''
  const allowed = Boolean(currentOrganization && isRestaurantIndustry(currentOrganization.industry))

  const [tables, setTables] = useState<DiningTableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const [newTableLabel, setNewTableLabel] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const portraitCardRef = useRef<HTMLDivElement>(null)

  const canLoadCheckoutWallets = canAccess('pos.access') || canAccess('orders.manage')
  const [checkoutWallets, setCheckoutWallets] = useState<OrderCheckoutWalletRow[]>([])

  const canCreate = canAccess('products.create')
  const canEdit = canAccess('products.edit')

  const load = useCallback(async () => {
    if (!businessId || !allowed) {
      setTables([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const t = await fetchDiningTables(businessId)
      setTables(t)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load dining tables.')
    } finally {
      setLoading(false)
    }
  }, [businessId, allowed])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!businessId || !allowed || !canLoadCheckoutWallets) {
      setCheckoutWallets([])
      return
    }
    let cancelled = false
    void fetchOrderCheckoutWallets(businessId)
      .then((rows) => {
        if (!cancelled) setCheckoutWallets(rows)
      })
      .catch(() => {
        if (!cancelled) setCheckoutWallets([])
      })
    return () => {
      cancelled = true
    }
  }, [businessId, allowed, canLoadCheckoutWallets])

  useEffect(() => {
    if (tables.length === 0) {
      setActiveIndex(0)
      return
    }
    setActiveIndex((i) => Math.min(Math.max(0, i), tables.length - 1))
  }, [tables.length])

  useEffect(() => {
    if (tables.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') {
        setActiveIndex((i) => Math.max(0, i - 1))
      }
      if (e.key === 'ArrowRight') {
        setActiveIndex((i) => Math.min(tables.length - 1, i + 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tables.length])

  const showGate =
    Boolean(currentOrganization) && !allowed && !user?.isPlatformOwner && !user?.isPlatformAdmin

  const activeTable = tables[activeIndex]
  const activeUrl = activeTable ? guestMenuUrl(slug, activeTable.publicToken) : ''
  const total = tables.length
  const pageLabel = total === 0 ? '0' : `${activeIndex + 1}`

  const goPrev = () => setActiveIndex((i) => Math.max(0, i - 1))
  const goNext = () => setActiveIndex((i) => Math.min(total - 1, i + 1))

  const handlePrint = () => {
    if (total === 0) return
    window.print()
  }

  return (
    <PageTransition className="mx-auto max-w-3xl px-4 py-6 print:max-w-none print:px-0 print:py-0">
      <style>{`
        @media print {
          @page {
            margin: 12mm;
            size: portrait;
          }
        }
      `}</style>

      <div className="print:hidden">
        <FlashNotice message={flash} onDismiss={() => setFlash(null)} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dining tables</h1>
            
          </div>
          {allowed ? (
            <Link
              to={APP_PATHS.restaurantMenuSetup}
              className="shrink-0 text-sm font-medium text-teal-600 hover:text-teal-700 hover:underline"
            >
              Menu setup →
            </Link>
          ) : null}
        </div>
      </div>

      {showGate ? (
        <div className="print:hidden rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Dining tables are only available when your business industry is Restaurant.
        </div>
      ) : null}

      {error ? (
        <div className="print:hidden rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading && allowed ? (
        <p className="print:hidden text-sm text-slate-500">Loading…</p>
      ) : null}

      {!loading && allowed ? (
        <>
          <section className="print:hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Add a table</h2>
            
            <form
              className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!businessId || !canCreate || !newTableLabel.trim()) return
                try {
                  const row = await createDiningTable(businessId, {
                    label: newTableLabel.trim(),
                  })
                  setNewTableLabel('')
                  setFlash('Table created.')
                  const list = await fetchDiningTables(businessId)
                  setTables(list)
                  const idx = list.findIndex((t) => t.id === row.id)
                  setActiveIndex(idx >= 0 ? idx : Math.max(0, list.length - 1))
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
          </section>

          {total === 0 ? (
            <p className="print:hidden mt-6 text-center text-sm text-slate-500">
              No tables yet. Add a label above to create your first table card.
            </p>
          ) : (
            <>
              <div className="print:hidden mt-8 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center justify-center gap-2 sm:justify-start">
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={activeIndex <= 0}
                    aria-label="Previous table"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div className="min-w-[10rem] text-center">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Table card
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      {pageLabel} of {total}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={activeIndex >= total - 1}
                    aria-label="Next table"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="sr-only">Jump to table</span>
                    <select
                      value={activeIndex}
                      onChange={(e) => setActiveIndex(Number(e.target.value))}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                    >
                      {tables.map((t, i) => (
                        <option key={t.id} value={i}>
                          {t.label}
                          {!t.isActive ? ' (inactive)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
                  >
                    <Printer className="h-4 w-4" />
                    Print this card
                  </button>
                </div>
              </div>

              <div className="mt-6 flex justify-center print:mt-0 print:flex print:justify-center">
                {activeTable ? (
                  <TableGuestTentCard
                    ref={portraitCardRef}
                    businessName={businessName}
                    businessSlug={slug}
                    tableLabel={activeTable.label}
                    menuUrl={activeUrl}
                    isInactive={!activeTable.isActive}
                    layout="portrait"
                    checkoutWallets={checkoutWallets}
                  />
                ) : null}
              </div>

              <div className="print:hidden mx-auto mt-6 max-w-md rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
                <p className="text-xs font-medium text-slate-500">Guest link (copy for messaging)</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-700">{activeUrl}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(activeUrl)
                      setFlash('Link copied.')
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy URL
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={async () => {
                      if (!businessId || !canEdit || !activeTable) return
                      if (!window.confirm(`Remove "${activeTable.label}"? This cannot be undone.`)) return
                      try {
                        await deleteDiningTable(businessId, activeTable.id)
                        setFlash('Table removed.')
                        await load()
                      } catch (err) {
                        setFlash(err instanceof ApiError ? err.message : 'Could not remove table.')
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove table
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      ) : null}
    </PageTransition>
  )
}
