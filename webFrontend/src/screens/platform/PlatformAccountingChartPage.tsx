import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import { CenteredModal } from '../../components/ui/CenteredModal'
import { ModalOverlay } from '../../components/ui/ModalOverlay'
import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  CHART_CATEGORY_META,
  CHART_CATEGORY_ORDER,
  chartAccountsMatchQuery,
  compareChartAccountCodes,
  type ChartCategoryOrder,
} from '../../models/chartAccount'
import type { AccountingAccountRow, ChartAccountCategory } from '../../services/accountingApi'
import {
  ApiError,
  createPlatformChartAccount,
  deletePlatformChartAccount,
  fetchPlatformAccountingChart,
  updatePlatformChartAccount,
  type PlatformChartAccountDetail,
} from '../../services/subscriptionApi'

function toAccountingRow(a: PlatformChartAccountDetail): AccountingAccountRow {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    description: a.description,
    category: a.category,
    balance: 0,
    isSystem: a.isSystem,
    kind: a.kind as AccountingAccountRow['kind'],
  }
}

const CATEGORY_SELECT: { value: ChartAccountCategory; label: string }[] = [
  { value: 'ASSET', label: 'Asset' },
  { value: 'LIABILITY', label: 'Liability' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'REVENUE', label: 'Revenue' },
  { value: 'EXPENSE', label: 'Expense' },
]

export function PlatformAccountingChartPage() {
  const { canAccess } = useAuth()
  const canManage = canAccess('platform.accounting.chart.manage')

  const [accounts, setAccounts] = useState<PlatformChartAccountDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    category: 'EXPENSE' as ChartAccountCategory,
  })

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    void fetchPlatformAccountingChart()
      .then(setAccounts)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load chart.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const rowsForFilter = useMemo(() => accounts.map(toAccountingRow), [accounts])
  const filtered = useMemo(
    () => accounts.filter((a) => chartAccountsMatchQuery(toAccountingRow(a), query)),
    [accounts, query],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, PlatformChartAccountDetail[]>()
    for (const c of CHART_CATEGORY_ORDER) {
      map.set(c, [])
    }
    for (const a of filtered) {
      const key: ChartCategoryOrder = (CHART_CATEGORY_ORDER as readonly string[]).includes(a.category)
        ? (a.category as ChartCategoryOrder)
        : 'EXPENSE'
      const list = map.get(key) ?? []
      list.push(a)
      map.set(key, list)
    }
    return CHART_CATEGORY_ORDER.map((cat) => ({
      cat,
      meta: CHART_CATEGORY_META[cat],
      rows: [...(map.get(cat) ?? [])].sort((x, y) =>
        compareChartAccountCodes(x.code, y.code),
      ),
    }))
  }, [filtered])

  const editing = editId ? accounts.find((a) => a.id === editId) : null

  const openCreate = () => {
    setFormError(null)
    setForm({ code: '', name: '', description: '', category: 'EXPENSE' })
    setCreateOpen(true)
  }

  const openEdit = (a: PlatformChartAccountDetail) => {
    setFormError(null)
    setForm({
      code: a.code,
      name: a.name,
      description: a.description ?? '',
      category: (a.category as ChartAccountCategory) || 'EXPENSE',
    })
    setEditId(a.id)
  }

  const closeModals = () => {
    setCreateOpen(false)
    setEditId(null)
    setFormError(null)
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      await createPlatformChartAccount({
        code: form.code.trim(),
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim() || null,
      })
      closeModals()
      load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create account.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editId) return
    setFormError(null)
    setSubmitting(true)
    try {
      const acc = accounts.find((a) => a.id === editId)
      if (acc?.isSystem) {
        await updatePlatformChartAccount(editId, {
          name: form.name.trim(),
          description: form.description.trim() || null,
        })
      } else {
        await updatePlatformChartAccount(editId, {
          code: form.code.trim(),
          name: form.name.trim(),
          category: form.category,
          description: form.description.trim() || null,
        })
      }
      closeModals()
      load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not update account.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (a: PlatformChartAccountDetail) => {
    if (a.isSystem) return
    if (!window.confirm(`Delete account ${a.code} — ${a.name}?`)) return
    try {
      await deletePlatformChartAccount(a.id)
      load()
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Could not delete account.')
    }
  }

  const fieldClass =
    'w-full rounded-sm border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

  return (
    <PageTransition>
      <div className="space-y-6 py-2">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            to={APP_PATHS.platformAccounting}
            className="inline-flex items-center gap-2 text-sm font-medium text-qb-heading hover:text-qb-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to accounting
          </Link>
        </div>

        <PageCard
          variant="default"
          className="rounded-md border-qb-border p-6 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">
                Chart of accounts
              </h1>
              <p className="mt-1 text-sm text-qb-muted">
                DPay platform ledger. System accounts support automation; add custom accounts for your
                own reporting.
              </p>
            </div>
            {canManage ? (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center justify-center gap-2 rounded-sm border border-qb-border bg-qb-heading px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
              >
                <Plus className="h-4 w-4" />
                Add account
              </button>
            ) : null}
          </div>

          <div className="relative mt-6">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-qb-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search code, name, category…"
              className={`${fieldClass} pl-10`}
              autoComplete="off"
            />
          </div>

          {error ? <p className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}
          {loading ? (
            <div className="mt-10 flex items-center gap-2 text-qb-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="mt-8 space-y-10">
              {grouped.map(
                ({ cat, meta, rows }) =>
                  rows.length > 0 && (
                    <section
                      key={cat}
                      className={`overflow-hidden rounded-md border border-qb-border bg-white shadow-sm ${meta.stripeClass} border-l-4`}
                    >
                      <header
                        className={`flex flex-wrap items-center gap-3 border-b border-qb-border px-4 py-3 ${meta.iconWrapClass}`}
                      >
                        <meta.Icon className="h-5 w-5 shrink-0" strokeWidth={1.5} />
                        <div>
                          <h2 className="text-sm font-semibold text-qb-heading">{meta.label}</h2>
                          <p className="text-xs text-qb-muted">{meta.hint}</p>
                        </div>
                        <span className="ml-auto text-xs font-medium text-qb-muted">
                          {rows.length} account{rows.length === 1 ? '' : 's'}
                        </span>
                      </header>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm">
                          <thead>
                            <tr className="border-b border-qb-border bg-qb-surface/50 text-left text-xs font-semibold uppercase tracking-wide text-qb-muted">
                              <th className="px-4 py-3">Code</th>
                              <th className="px-4 py-3">Name</th>
                              <th className="px-4 py-3">Details</th>
                              <th className="px-4 py-3">Type</th>
                              {canManage ? <th className="px-4 py-3 text-right">Actions</th> : null}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-qb-border">
                            {rows.map((a) => (
                              <tr key={a.id} className="hover:bg-qb-surface/30">
                                <td className="px-4 py-3 font-mono text-xs font-medium text-qb-heading">
                                  {a.code}
                                </td>
                                <td className="px-4 py-3 font-medium text-qb-heading">{a.name}</td>
                                <td className="max-w-md px-4 py-3 text-xs text-qb-muted">
                                  {a.description?.trim() ? a.description : '—'}
                                </td>
                                <td className="px-4 py-3 text-xs text-qb-muted">
                                  {a.isSystem ? 'System' : 'Custom'}
                                </td>
                                {canManage ? (
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => openEdit(a)}
                                        className="rounded-sm border border-qb-border p-1.5 text-qb-heading hover:bg-qb-surface"
                                        aria-label="Edit"
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </button>
                                      {!a.isSystem ? (
                                        <button
                                          type="button"
                                          onClick={() => void handleDelete(a)}
                                          className="rounded-sm border border-qb-border p-1.5 text-red-700 hover:bg-red-50"
                                          aria-label="Delete"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      ) : null}
                                    </div>
                                  </td>
                                ) : null}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ),
              )}
              {!loading && filtered.length === 0 ? (
                <p className="text-center text-sm text-qb-muted">
                  {rowsForFilter.length === 0 ? 'No accounts.' : 'No matches for your search.'}
                </p>
              ) : null}
            </div>
          )}
        </PageCard>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <ModalOverlay
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={() => !submitting && closeModals()}
          />
          <CenteredModal className="relative z-10 max-h-[min(90vh,760px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-qb-border bg-white p-8 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-qb-heading">Add account</h2>
              <button
                type="button"
                onClick={() => !submitting && closeModals()}
                className="rounded-lg p-2 text-qb-muted hover:bg-qb-surface"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-qb-muted">Code</span>
                <input
                  required
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  className={fieldClass}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-qb-muted">Name</span>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={fieldClass}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-qb-muted">Category</span>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value as ChartAccountCategory }))
                  }
                  className={fieldClass}
                >
                  {CATEGORY_SELECT.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-qb-muted">Description (optional)</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className={fieldClass}
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeModals} className="rounded-sm px-4 py-2 text-sm">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-sm bg-qb-heading px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : 'Create'}
                </button>
              </div>
            </form>
          </CenteredModal>
        </div>
      ) : null}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <ModalOverlay
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={() => !submitting && closeModals()}
          />
          <CenteredModal className="relative z-10 max-h-[min(90vh,760px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-qb-border bg-white p-8 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-qb-heading">
                {editing.isSystem ? 'Edit system account' : 'Edit account'}
              </h2>
              <button
                type="button"
                onClick={() => !submitting && closeModals()}
                className="rounded-lg p-2 text-qb-muted hover:bg-qb-surface"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleEdit} className="mt-6 space-y-4">
              {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
              {editing.isSystem ? (
                <p className="text-xs text-qb-muted">
                  Only name and description can be changed for system accounts.
                </p>
              ) : (
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-qb-muted">Code</span>
                  <input
                    required
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    className={fieldClass}
                  />
                </label>
              )}
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-qb-muted">Name</span>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={fieldClass}
                />
              </label>
              {!editing.isSystem ? (
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-qb-muted">Category</span>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, category: e.target.value as ChartAccountCategory }))
                    }
                    className={fieldClass}
                  >
                    {CATEGORY_SELECT.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-qb-muted">Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className={fieldClass}
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeModals} className="rounded-sm px-4 py-2 text-sm">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-sm bg-qb-heading px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </CenteredModal>
        </div>
      ) : null}
    </PageTransition>
  )
}
