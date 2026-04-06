import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { Toast, type ToastVariant } from '../components/ui/Toast'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  createBusinessContact,
  fetchBusinessContacts,
  type BusinessContactRow,
} from '../services/journalApi'
import { ApiError } from '../services/subscriptionApi'

export function ContactsPage() {
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id

  const [rows, setRows] = useState<BusinessContactRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const dismissToast = useCallback(() => setToast(null), [])

  const load = useCallback(() => {
    if (!businessId) return
    setLoading(true)
    void fetchBusinessContacts(businessId)
      .then(setRows)
      .catch(() => {
        setRows([])
        setError('Could not load contacts.')
      })
      .finally(() => setLoading(false))
  }, [businessId])

  useEffect(() => {
    load()
  }, [load])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!businessId) return
    const n = name.trim()
    if (!n) {
      setError('Name is required.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await createBusinessContact(businessId, {
        name: n,
        email: email.trim() || null,
        phone: phone.trim() || null,
      })
      setName('')
      setEmail('')
      setPhone('')
      setToast({ message: 'Contact saved.', variant: 'success' })
      load()
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not save.'
      setError(msg)
      setToast({ message: msg, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  if (!businessId) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <p className="text-slate-500">Select a business.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const fieldInput =
    'w-full rounded-sm border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading placeholder:text-qb-muted/60 focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

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
            to={APP_PATHS.dashboard}
            className="inline-flex items-center text-sm font-medium text-qb-muted hover:text-qb-heading"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">Contacts</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-qb-muted">
              Counterparties for journal entries, sales quotations, and invoices. Add contacts here or
              from those screens.
            </p>
          </div>
        </PageCard>

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
              <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldInput}
                placeholder="Optional"
                autoComplete="email"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Phone</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={fieldInput}
                placeholder="Optional"
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

        <PageCard
          variant="default"
          className="rounded-md border-qb-border p-0 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <div className="border-b border-qb-border px-5 py-4">
            <h2 className="text-lg font-semibold text-qb-heading">Your contacts</h2>
            <p className="mt-1 text-sm text-qb-muted">Recently created contacts appear in search across the app.</p>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 px-5 py-10 text-qb-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="px-5 py-10 text-sm text-qb-muted">No contacts yet. Add one above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-qb-border bg-qb-surface text-xs font-semibold uppercase tracking-wide text-qb-muted">
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Phone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-qb-border">
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-qb-surface/40">
                      <td className="px-5 py-3 font-medium text-qb-heading">{c.name}</td>
                      <td className="px-5 py-3 text-qb-muted">{c.email ?? '—'}</td>
                      <td className="px-5 py-3 text-qb-muted">{c.phone ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PageCard>
      </div>
    </PageTransition>
  )
}
