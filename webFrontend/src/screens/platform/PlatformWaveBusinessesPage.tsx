import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Loader2, Pencil, Waves } from 'lucide-react'
import { generatePath, Link } from 'react-router-dom'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { Toast, type ToastVariant } from '../../components/ui/Toast'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformWaveAggregatedMerchants,
  updatePlatformWaveAggregatedMerchant,
  type PlatformWaveAggregatedMerchantRow,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

const PAGE_SIZE = 25

const fieldInput =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600/30'

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function provisionStatusLabel(status: string) {
  if (status === 'SUCCEEDED') {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
        Succeeded
      </span>
    )
  }
  if (status === 'FAILED') {
    return (
      <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
        Failed
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      Skipped
    </span>
  )
}

export function PlatformWaveBusinessesPage() {
  const { user } = useAuth()
  const canEdit = Boolean(user?.isPlatformOwner || user?.platformPermissions?.['platform.businesses']?.edit)
  const [items, setItems] = useState<PlatformWaveAggregatedMerchantRow[]>([])
  const [hasNextPage, setHasNextPage] = useState(false)
  const [endCursor, setEndCursor] = useState<string | null>(null)
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null)

  const load = useCallback(
    async (after: string | null) => {
      if (!isPlatformOperator(user)) {
        return
      }
      setLoading(true)
      setError(null)
      try {
        const data = await fetchPlatformWaveAggregatedMerchants({
          first: PAGE_SIZE,
          after: after ?? undefined,
        })
        setItems(data.items)
        setHasNextPage(data.pageInfo.hasNextPage)
        setEndCursor(data.pageInfo.endCursor)
      } catch (e) {
        setItems([])
        setHasNextPage(false)
        setEndCursor(null)
        setError(e instanceof ApiError ? e.message : 'Could not load Wave aggregated merchants.')
      } finally {
        setLoading(false)
      }
    },
    [user?.isPlatformOwner, user?.isPlatformAdmin],
  )

  useEffect(() => {
    const after = cursorStack[pageIndex] ?? null
    void load(after)
  }, [load, pageIndex, cursorStack])

  function startEdit(row: PlatformWaveAggregatedMerchantRow) {
    setEditingId(row.id)
    setEditName(row.name)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
  }

  async function saveEdit(merchantId: string) {
    const name = editName.trim()
    if (!name) {
      setToast({ message: 'Business name is required.', variant: 'error' })
      return
    }
    setSavingId(merchantId)
    try {
      const updated = await updatePlatformWaveAggregatedMerchant(merchantId, name)
      setItems((prev) => prev.map((row) => (row.id === merchantId ? updated : row)))
      cancelEdit()
      setToast({ message: 'Checkout business name updated.', variant: 'success' })
    } catch (e) {
      setToast({
        message: e instanceof ApiError ? e.message : 'Could not update business name.',
        variant: 'error',
      })
    } finally {
      setSavingId(null)
    }
  }

  function goNext() {
    if (!hasNextPage || !endCursor) {
      return
    }
    cancelEdit()
    setCursorStack((prev) => {
      const next = [...prev]
      next[pageIndex + 1] = endCursor
      return next.slice(0, pageIndex + 2)
    })
    setPageIndex((i) => i + 1)
  }

  function goPrev() {
    if (pageIndex <= 0) {
      return
    }
    cancelEdit()
    setPageIndex((i) => i - 1)
  }

  if (!isPlatformOperator(user)) {
    return null
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      {toast ? <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} /> : null}

      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
          Platform · Businesses
        </p>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-slate-900">
          <Waves className="h-8 w-8 text-teal-700" aria-hidden />
          Wave Businesses
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Aggregated merchants on the parent Wave account (<code className="text-sm">GET /v1/aggregated_merchants</code>
          ). These are created automatically when organizations sign up and are used for customer sales checkout — not
          subscription billing. The checkout business name is what customers see when paying.
        </p>
      </div>

      <PageCard className="overflow-hidden p-0">
        {loading && items.length === 0 ? (
          <p className="flex items-center gap-2 p-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading from Wave…
          </p>
        ) : error ? (
          <p className="p-8 text-sm text-red-600">{error}</p>
        ) : items.length === 0 ? (
          <p className="p-8 text-sm text-slate-500">No aggregated merchants returned from Wave.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Checkout business name</th>
                  <th className="px-4 py-3">Merchant ID</th>
                  <th className="px-4 py-3">Easypay business</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Created (Wave)</th>
                  <th className="px-4 py-3">Last provision</th>
                  <th className="px-4 py-3 text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const editing = editingId === row.id
                  const locked = row.is_locked
                  return (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        {editing ? (
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={255}
                            className={fieldInput}
                            autoFocus
                          />
                        ) : (
                          <>
                            <p className="font-medium text-slate-900">{row.name}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{row.business_description}</p>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{row.id}</td>
                      <td className="px-4 py-3">
                        {row.business ? (
                          <div>
                            <p className="font-medium text-slate-900">{row.business.name}</p>
                            <p className="text-xs text-slate-500">{row.business.slug}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-800">Not linked locally</span>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-700">{row.business_type}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                        {formatWhen(row.when_created)}
                        {locked ? (
                          <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600">
                            Locked
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {row.lastProvision ? (
                          <div className="space-y-1">
                            {provisionStatusLabel(row.lastProvision.status)}
                            <p className="text-[10px] text-slate-500">{row.lastProvision.trigger}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                disabled={savingId === row.id}
                                onClick={cancelEdit}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={savingId === row.id}
                                onClick={() => void saveEdit(row.id)}
                                className="rounded-lg bg-teal-700 px-2 py-1 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-40"
                              >
                                {savingId === row.id ? 'Saving…' : 'Save'}
                              </button>
                            </>
                          ) : canEdit && !locked ? (
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              title="Edit checkout business name"
                            >
                              <Pencil className="h-3 w-3" aria-hidden />
                              Edit
                            </button>
                          ) : null}
                          {row.business ? (
                            <Link
                              to={generatePath(APP_PATHS.platformBusinessDetail, {
                                businessId: row.business.id,
                              })}
                              className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-800"
                            >
                              Open
                              <ChevronRight className="h-4 w-4" />
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!error && (items.length > 0 || pageIndex > 0) ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <button
              type="button"
              disabled={pageIndex <= 0 || loading}
              onClick={() => goPrev()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-slate-500">Page {pageIndex + 1}</span>
            <button
              type="button"
              disabled={!hasNextPage || loading}
              onClick={() => goNext()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}
      </PageCard>
    </PageTransition>
  )
}
