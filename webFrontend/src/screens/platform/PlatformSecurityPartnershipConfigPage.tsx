import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'

import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { PageCard } from '../../components/ui/PageCard'
import { PageSectionHeader } from '../../components/ui/PageSectionHeader'
import { PageTransition } from '../../components/ui/PageTransition'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  createPartnerWebhookEndpoint,
  deletePartnerWebhookEndpoint,
  fetchPartnerWebhookEndpoints,
  updatePartnerWebhookEndpoint,
  type PartnerWebhookEndpointRow,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

const SEC_MODULE = 'platform.security_partnership_config'

type FormState = {
  label: string
  webhookUrl: string
  signingSecret: string
  isEnabled: boolean
  sortOrder: string
}

const emptyForm = (): FormState => ({
  label: '',
  webhookUrl: '',
  signingSecret: '',
  isEnabled: true,
  sortOrder: '0',
})

function rowToForm(row: PartnerWebhookEndpointRow): FormState {
  return {
    label: row.label ?? '',
    webhookUrl: row.webhookUrl,
    signingSecret: '',
    isEnabled: row.isEnabled,
    sortOrder: String(row.sortOrder),
  }
}

export function PlatformSecurityPartnershipConfigPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<PartnerWebhookEndpointRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PartnerWebhookEndpointRow | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<PartnerWebhookEndpointRow | null>(null)

  const isOwner = Boolean(user?.isPlatformOwner)
  const perm = user?.platformPermissions?.[SEC_MODULE]
  const canCreate = isOwner || Boolean(perm?.create)
  const canEdit = isOwner || Boolean(perm?.edit)
  const canDelete = isOwner || Boolean(perm?.delete)

  const load = useCallback(async () => {
    if (!isPlatformOperator(user)) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPartnerWebhookEndpoints()
      setRows(data)
    } catch (e) {
      setRows([])
      setError(e instanceof ApiError ? e.message : 'Could not load partnership webhooks.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setFormOpen(true)
    setError(null)
    setSuccessMessage(null)
  }

  function openEdit(row: PartnerWebhookEndpointRow) {
    setEditing(row)
    setForm(rowToForm(row))
    setFormOpen(true)
    setError(null)
    setSuccessMessage(null)
  }

  function closeForm() {
    setFormOpen(false)
    setEditing(null)
    setForm(emptyForm())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editing ? !canEdit : !canCreate) {
      return
    }
    const webhookUrl = form.webhookUrl.trim()
    if (!webhookUrl) {
      setError('Webhook URL is required.')
      return
    }
    const sortOrder = Number.parseInt(form.sortOrder, 10)
    if (!Number.isFinite(sortOrder)) {
      setError('Sort order must be a number.')
      return
    }
    if (!editing && !form.signingSecret.trim()) {
      setError('Signing secret is required for new endpoints.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccessMessage(null)
    try {
      if (editing) {
        await updatePartnerWebhookEndpoint(editing.id, {
          label: form.label.trim() || null,
          webhookUrl,
          isEnabled: form.isEnabled,
          sortOrder,
          ...(form.signingSecret.trim()
            ? { signingSecret: form.signingSecret.trim() }
            : {}),
        })
        setSuccessMessage('Webhook endpoint updated.')
      } else {
        await createPartnerWebhookEndpoint({
          label: form.label.trim() || null,
          webhookUrl,
          signingSecret: form.signingSecret.trim(),
          isEnabled: form.isEnabled,
          sortOrder,
        })
        setSuccessMessage('Webhook endpoint added.')
      }
      closeForm()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save webhook endpoint.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || !canDelete) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await deletePartnerWebhookEndpoint(deleteTarget.id)
      setSuccessMessage('Webhook endpoint removed.')
      setDeleteTarget(null)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete webhook endpoint.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnabled(row: PartnerWebhookEndpointRow) {
    if (!canEdit) {
      return
    }
    setError(null)
    try {
      await updatePartnerWebhookEndpoint(row.id, { isEnabled: !row.isEnabled })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update endpoint.')
    }
  }

  return (
    <PageTransition>
      <PageSectionHeader
        title="Partnership config"
        subtitle="Manage outbound webhook URLs and signing secrets for internal partner integrations."
      />

      <PageCard className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Partner webhooks</h2>
            {/* <p className="mt-1 text-xs text-slate-500">
              Payment and subscription events are POSTed to every enabled endpoint (unless a business
              has a per-tenant webhook URL override).
            </p> */}
          </div>
          {canCreate ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              <Plus className="h-4 w-4" />
              Add webhook
            </button>
          ) : null}
        </div>

        {error ? (
          <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        {successMessage ? (
          <div className="mx-5 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {successMessage}
          </div>
        ) : null}

        {loading ? (
          <p className="flex items-center gap-2 px-5 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">
            No partner webhooks configured. Add endpoints here or continue using{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">INTERNAL_PARTNER_WEBHOOK_URL</code>{' '}
            in server env as a fallback.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2">Label</th>
                  <th className="px-3 py-2">Webhook URL</th>
                  <th className="px-3 py-2">Enabled</th>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Secret</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-3 text-slate-800">{row.label || '—'}</td>
                    <td className="max-w-[320px] truncate px-3 py-3 font-mono text-xs text-slate-700" title={row.webhookUrl}>
                      {row.webhookUrl}
                    </td>
                    <td className="px-3 py-3">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => void toggleEnabled(row)}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            row.isEnabled
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {row.isEnabled ? 'Enabled' : 'Disabled'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-600">{row.isEnabled ? 'Yes' : 'No'}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{row.sortOrder}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {row.hasSigningSecret ? 'Configured' : 'Missing'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {editing ? 'Edit partner webhook' : 'Add partner webhook'}
            </h3>
            <form className="mt-4 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Label (optional)</span>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. 7-aside, vPay"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Webhook URL</span>
                <input
                  type="url"
                  required
                  value={form.webhookUrl}
                  onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))}
                  placeholder="https://partner.example.com/webhooks/easypay"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">
                  Signing secret {editing ? '(leave blank to keep current)' : ''}
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  required={!editing}
                  value={form.signingSecret}
                  onChange={(e) => setForm((f) => ({ ...f, signingSecret: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.isEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, isEnabled: e.target.checked }))}
                  />
                  Enabled
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Sort order</span>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                    className="ml-2 w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Remove partner webhook?"
        confirmLabel="Remove"
        variant="danger"
        loading={saving}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      >
        {deleteTarget ? (
          <p className="text-sm text-slate-600">
            Stop sending events to <span className="font-mono text-xs">{deleteTarget.webhookUrl}</span>?
          </p>
        ) : null}
      </ConfirmModal>
    </PageTransition>
  )
}
