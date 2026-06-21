import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { Toast, type ToastVariant } from '../../components/ui/Toast'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  createPlatformSupplier,
  fetchPlatformSuppliers,
  patchPlatformSupplier,
  type PlatformSupplierRow,
} from '../../services/subscriptionApi'

const fieldInput =
  'w-full rounded-sm border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading placeholder:text-qb-muted/60 focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

export function PlatformContactsPage() {
  const { canAccess } = useAuth()
  const canManage = canAccess('platform.contacts.manage')

  const [rows, setRows] = useState<PlatformSupplierRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ name: '', email: '', phone: '' })
  const [savingEditId, setSavingEditId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const dismissToast = useCallback(() => setToast(null), [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPlatformSuppliers()
      setRows(data)
    } catch (e) {
      setRows([])
      setError(e instanceof ApiError ? e.message : 'Could not load contacts.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    const em = email.trim()
    if (!n) {
      setError('Name is required.')
      return
    }
    if (!em) {
      setError('Email is required for supplier bills (approval notification).')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await createPlatformSupplier({
        name: n,
        email: em,
        phone: phone.trim() || null,
      })
      setName('')
      setEmail('')
      setPhone('')
      setToast({ message: 'Contact saved.', variant: 'success' })
      await load()
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not save.'
      setError(msg)
      setToast({ message: msg, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (row: PlatformSupplierRow) => {
    setEditingId(row.id)
    setEditDraft({
      name: row.name,
      email: row.email ?? '',
      phone: row.phone ?? '',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft({ name: '', email: '', phone: '' })
  }

  const saveEdit = async (supplierId: string) => {
    const n = editDraft.name.trim()
    const em = editDraft.email.trim()
    if (!n) {
      setError('Name is required.')
      return
    }
    if (!em) {
      setError('Email is required.')
      return
    }
    setSavingEditId(supplierId)
    setError(null)
    try {
      await patchPlatformSupplier(supplierId, {
        name: n,
        email: em,
        phone: editDraft.phone.trim() || null,
      })
      setToast({ message: 'Contact updated.', variant: 'success' })
      cancelEdit()
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update contact.')
    } finally {
      setSavingEditId(null)
    }
  }

  return (
    <PageTransition>
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant ?? 'success'}
        onDismiss={dismissToast}
      />
      <div className="space-y-5 py-2 lg:space-y-6">
        <PageCard
          variant="default"
          className="space-y-4 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <Link
            to={APP_PATHS.platformBills}
            className="inline-flex items-center text-sm font-medium text-qb-muted hover:text-qb-heading"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to supplier bills
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">Supplier contacts</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-qb-muted">
              Vendors and payees for platform supplier bills. Add contacts here, then select them when
              creating a bill. Mobile numbers are used for APS Wallet bulk payments.
            </p>
          </div>
        </PageCard>

        {canManage ? (
          <PageCard
            variant="default"
            className="space-y-4 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-qb-muted" />
              <h2 className="text-lg font-semibold text-qb-heading">Add contact</h2>
            </div>
            <form noValidate onSubmit={(e) => void onSubmit(e)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Name *</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={fieldInput}
                  placeholder="Company or person"
                  autoComplete="organization"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Email *</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldInput}
                  placeholder="For bill approval"
                  autoComplete="email"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Mobile</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={fieldInput}
                  placeholder="APS wallet pay"
                  autoComplete="tel"
                />
              </label>
              <div className="flex items-end sm:col-span-2 lg:col-span-4">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-sm border border-qb-border bg-white px-5 py-2.5 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Save contact'}
                </button>
              </div>
            </form>
            {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
          </PageCard>
        ) : null}

        <PageCard
          variant="default"
          className="rounded-md border-qb-border p-0 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <div className="border-b border-qb-border px-5 py-4">
            <h2 className="text-lg font-semibold text-qb-heading">Contact list</h2>
            <p className="mt-1 text-sm text-qb-muted">
              {rows.length} contact{rows.length === 1 ? '' : 's'} — selectable on new supplier bills.
            </p>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 px-5 py-10 text-qb-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="px-5 py-10 text-sm text-qb-muted">
              No contacts yet.{canManage ? ' Add one above.' : ''}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-qb-border bg-qb-surface text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Mobile</th>
                    {canManage ? <th className="px-5 py-3" /> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-qb-border">
                  {rows.map((c) => {
                    const editing = editingId === c.id
                    return (
                      <tr key={c.id} className="hover:bg-qb-surface/40">
                        <td className="px-5 py-3">
                          {editing ? (
                            <input
                              value={editDraft.name}
                              onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                              className={fieldInput}
                            />
                          ) : (
                            <span className="font-medium text-qb-heading">{c.name}</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {editing ? (
                            <input
                              type="email"
                              value={editDraft.email}
                              onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                              className={fieldInput}
                            />
                          ) : (
                            <span className="text-qb-muted">{c.email ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {editing ? (
                            <input
                              value={editDraft.phone}
                              onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))}
                              className={fieldInput}
                            />
                          ) : (
                            <span className="text-qb-muted">{c.phone ?? '—'}</span>
                          )}
                        </td>
                        {canManage ? (
                          <td className="px-5 py-3 text-right">
                            {editing ? (
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  className="rounded-sm border border-qb-border px-2 py-1 text-xs"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={savingEditId === c.id}
                                  onClick={() => void saveEdit(c.id)}
                                  className="rounded-sm bg-qb-primary px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                                >
                                  {savingEditId === c.id ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEdit(c)}
                                className="rounded-sm border border-qb-border px-2 py-1 text-xs font-medium"
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </PageCard>
      </div>
    </PageTransition>
  )
}
