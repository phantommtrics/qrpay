import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  clearPlatformApsWalletCustomerAuth,
  fetchPlatformApsWalletCustomerAuths,
  createPlatformPaymentGateway,
  deletePlatformPaymentGateway,
  fetchPlatformPaymentGateways,
  patchPlatformPaymentGateway,
  unlinkPlatformApsWalletCustomerAuth,
  type ApsWalletCustomerAuthRow,
  type PlatformPaymentGatewayRow,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

const PAYMENT_GATEWAYS_MODULE = 'platform.payment_gateways'

/** Known checkout adapters; server accepts any non-empty string for future integrations. */
const CHECKOUT_ADAPTER_PRESETS: { value: string; label: string }[] = [
  { value: '', label: 'None — saved payment methods only' },
  { value: 'wave_gambia', label: 'Wave hosted checkout (Gambia)' },
  { value: 'yonna_wallet', label: 'Yonna Wallet / Yonna Forex checkout' },
  { value: 'aps_wallet', label: 'APS Wallet (OTP) checkout' },
]

function checkoutAdapterLabel(adapter: string | null) {
  if (!adapter) {
    return 'None'
  }
  const preset = CHECKOUT_ADAPTER_PRESETS.find((p) => p.value === adapter)
  return preset?.label ?? adapter
}

export function PlatformPaymentGatewaysPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<PlatformPaymentGatewayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [savingAdapterId, setSavingAdapterId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [envOpen, setEnvOpen] = useState(false)
  const [apsAuthRows, setApsAuthRows] = useState<ApsWalletCustomerAuthRow[]>([])
  const [apsAuthLoading, setApsAuthLoading] = useState(false)
  const [clearingAuthId, setClearingAuthId] = useState<string | null>(null)
  const [unlinkingAuthId, setUnlinkingAuthId] = useState<string | null>(null)
  const [deleteGatewayConfirmRow, setDeleteGatewayConfirmRow] = useState<PlatformPaymentGatewayRow | null>(null)
  const [clearAuthConfirmRow, setClearAuthConfirmRow] = useState<ApsWalletCustomerAuthRow | null>(null)
  const [unlinkConfirmRow, setUnlinkConfirmRow] = useState<ApsWalletCustomerAuthRow | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [draftAdapterById, setDraftAdapterById] = useState<Record<string, string>>({})

  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newSortOrder, setNewSortOrder] = useState('0')
  const [newEnabled, setNewEnabled] = useState(true)
  const [newAdapterPreset, setNewAdapterPreset] = useState('')
  const [newAdapterCustom, setNewAdapterCustom] = useState('')

  const isOwner = Boolean(user?.isPlatformOwner)
  const pg = user?.platformPermissions?.[PAYMENT_GATEWAYS_MODULE]
  const canCreate = isOwner || Boolean(pg?.create)
  const canDelete = isOwner || Boolean(pg?.delete)
  const canEdit = isOwner || Boolean(pg?.edit)

  const load = useCallback(async () => {
    if (!isPlatformOperator(user)) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPlatformPaymentGateways()
      setRows(data)
      setDraftAdapterById((prev) => {
        const next = { ...prev }
        for (const g of data) {
          if (next[g.id] === undefined) {
            next[g.id] = g.checkoutAdapter ?? ''
          }
        }
        return next
      })
    } catch (e) {
      setRows([])
      setError(e instanceof ApiError ? e.message : 'Could not load payment gateways.')
    } finally {
      setLoading(false)
    }
  }, [user?.isPlatformOwner, user?.isPlatformAdmin])

  const loadApsCustomerAuths = useCallback(async () => {
    if (!isPlatformOperator(user)) {
      return
    }
    setApsAuthLoading(true)
    try {
      const data = await fetchPlatformApsWalletCustomerAuths()
      setApsAuthRows(data)
    } catch (e) {
      setApsAuthRows([])
      setError(e instanceof ApiError ? e.message : 'Could not load APS customer authorizations.')
    } finally {
      setApsAuthLoading(false)
    }
  }, [user?.isPlatformOwner, user?.isPlatformAdmin])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadApsCustomerAuths()
  }, [loadApsCustomerAuths])

  const toggle = async (row: PlatformPaymentGatewayRow) => {
    if (!canEdit) {
      return
    }
    setTogglingId(row.id)
    setError(null)
    try {
      await patchPlatformPaymentGateway(row.id, { isEnabled: !row.isEnabled })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update gateway.')
    } finally {
      setTogglingId(null)
    }
  }

  const saveAdapter = async (row: PlatformPaymentGatewayRow) => {
    if (!canEdit) {
      return
    }
    const raw = (draftAdapterById[row.id] ?? '').trim()
    setSavingAdapterId(row.id)
    setError(null)
    try {
      await patchPlatformPaymentGateway(row.id, {
        checkoutAdapter: raw === '' ? null : raw,
      })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update checkout adapter.')
    } finally {
      setSavingAdapterId(null)
    }
  }

  const remove = async () => {
    const row = deleteGatewayConfirmRow
    if (!row || !canDelete) {
      return
    }
    setDeletingId(row.id)
    setError(null)
    try {
      await deletePlatformPaymentGateway(row.id)
      await load()
      setDeleteGatewayConfirmRow(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete gateway.')
    } finally {
      setDeletingId(null)
    }
  }

  const create = async () => {
    if (!canCreate) {
      return
    }
    const code = newCode.trim().toLowerCase()
    const name = newName.trim()
    if (!code || !name) {
      setError('Code and display name are required.')
      return
    }
    let checkoutAdapter: string | null = null
    if (newAdapterPreset === '__custom__') {
      const c = newAdapterCustom.trim()
      checkoutAdapter = c === '' ? null : c
    } else if (newAdapterPreset) {
      checkoutAdapter = newAdapterPreset
    }
    setCreating(true)
    setError(null)
    try {
      await createPlatformPaymentGateway({
        code,
        name,
        description: newDescription.trim() || null,
        sortOrder: Number.parseInt(newSortOrder, 10) || 0,
        isEnabled: newEnabled,
        checkoutAdapter,
      })
      setNewCode('')
      setNewName('')
      setNewDescription('')
      setNewSortOrder('0')
      setNewEnabled(true)
      setNewAdapterPreset('')
      setNewAdapterCustom('')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create gateway.')
    } finally {
      setCreating(false)
    }
  }

  const clearApsAuth = async (row: ApsWalletCustomerAuthRow) => {
    if (!canEdit) {
      return
    }
    setClearAuthConfirmRow(row)
  }

  const confirmClearApsAuth = async () => {
    const row = clearAuthConfirmRow
    if (!row || !canEdit) {
      return
    }
    setClearingAuthId(row.id)
    setError(null)
    try {
      await clearPlatformApsWalletCustomerAuth(row.id)
      await loadApsCustomerAuths()
      setClearAuthConfirmRow(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not clear APS customer authorization.')
    } finally {
      setClearingAuthId(null)
    }
  }

  const unlinkApsAuth = async (row: ApsWalletCustomerAuthRow) => {
    if (!canEdit) {
      return
    }
    setUnlinkConfirmRow(row)
  }

  const confirmUnlinkApsAuth = async () => {
    const row = unlinkConfirmRow
    if (!row || !canEdit) {
      return
    }
    setUnlinkingAuthId(row.id)
    setError(null)
    setSuccessMessage(null)
    try {
      const result = await unlinkPlatformApsWalletCustomerAuth(row.id)
      await loadApsCustomerAuths()
      setSuccessMessage(result.message || 'APS customer unlinked successfully.')
      setUnlinkConfirmRow(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not unlink APS customer authorization.')
    } finally {
      setUnlinkingAuthId(null)
    }
  }

  if (!isPlatformOperator(user)) {
    return null
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">Platform</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Payment gateways</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Add as many payment providers as you need. Enable each one so businesses can attach
            payment methods and, where a checkout adapter is set, pay subscription invoices online.
          </p>
          <button
            type="button"
            onClick={() => setEnvOpen((o) => !o)}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${envOpen ? 'rotate-180' : ''}`}
            />
            Environment variables (hosted checkout)
          </button>
          {envOpen ? (
            <div className="mt-2 max-w-2xl rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p>
                Hosted checkout adapters read credentials from the API server environment (not from
                this UI). For example, the Wave Gambia adapter expects{' '}
                <code className="rounded bg-white px-1 py-0.5 text-xs">WAVE_CHECKOUT_BEARER</code>,{' '}
                <code className="rounded bg-white px-1 py-0.5 text-xs">WAVE_WEBHOOK_SECRET</code>, and{' '}
                <code className="rounded bg-white px-1 py-0.5 text-xs">APP_PUBLIC_BASE_URL</code>. The
                Yonna Wallet adapter expects{' '}
                <code className="rounded bg-white px-1 py-0.5 text-xs">YONNA_FOREX_API_URL</code>,{' '}
                <code className="rounded bg-white px-1 py-0.5 text-xs">YONNA_FOREX_SECRET_KEY</code>,{' '}
                <code className="rounded bg-white px-1 py-0.5 text-xs">YONNA_FOREX_CLIENT_ID</code>, and
                optionally{' '}
                <code className="rounded bg-white px-1 py-0.5 text-xs">YONNA_FOREX_WEBHOOK_SECRET</code>{' '}
                for <code className="rounded bg-white px-1 py-0.5 text-xs">/api/webhooks/yonna-forex</code>. The APS
                Wallet adapter uses server env{' '}
                <code className="rounded bg-white px-1 py-0.5 text-xs">APS_WALLET_BASE_URL</code> and optionally{' '}
                <code className="rounded bg-white px-1 py-0.5 text-xs">APS_WALLET_ACCESS_CHANNEL</code> for all
                merchants. Per-business merchant login (username + password) is stored encrypted under each
                organization&apos;s Merchant API. Platform subscription billing APS checkout additionally uses env{' '}
                <code className="rounded bg-white px-1 py-0.5 text-xs">APS_WALLET_MOBILE</code> and{' '}
                <code className="rounded bg-white px-1 py-0.5 text-xs">APS_WALLET_PASSWORD</code> for the platform
                merchant account.
              </p>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {successMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      {canCreate ? (
        <PageCard className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-slate-900">Add gateway</h2>
          </div>
          <p className="text-sm text-slate-600">
            Use a short unique code (lowercase letters, digits, underscores). This is what the API
            and webhooks reference.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-sm">
              <span className="text-slate-600">Code</span>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900"
                placeholder="e.g. orange_money_sn"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Display name</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
                placeholder="Shown to businesses"
              />
            </label>
            <label className="block text-sm sm:col-span-2 lg:col-span-3">
              <span className="text-slate-600">Description (optional)</span>
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Sort order</span>
              <input
                type="number"
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={newEnabled}
                onChange={(e) => setNewEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-slate-700">Enabled for businesses</span>
            </label>
            <label className="block text-sm sm:col-span-2 lg:col-span-3">
              <span className="text-slate-600">Checkout adapter</span>
              <select
                value={newAdapterPreset}
                onChange={(e) => setNewAdapterPreset(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              >
                {CHECKOUT_ADAPTER_PRESETS.map((o) => (
                  <option key={o.value || 'none'} value={o.value}>
                    {o.label}
                  </option>
                ))}
                <option value="__custom__">Custom adapter id…</option>
              </select>
            </label>
            {newAdapterPreset === '__custom__' ? (
              <label className="block text-sm sm:col-span-2 lg:col-span-3">
                <span className="text-slate-600">Custom adapter id</span>
                <input
                  value={newAdapterCustom}
                  onChange={(e) => setNewAdapterCustom(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900"
                  placeholder="Must match a server integration"
                />
              </label>
            ) : null}
          </div>
          <button
            type="button"
            disabled={creating}
            onClick={() => void create()}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create gateway
          </button>
        </PageCard>
      ) : (
        <p className="text-sm text-slate-500">
          Your role can view gateways but not create new ones. Ask EasyPay to grant{' '}
          <span className="font-medium">Create</span> on the payment gateways module.
        </p>
      )}

      <PageCard className="overflow-hidden p-0">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading gateways…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            No gateways yet.{canCreate ? ' Use the form above to add one.' : ''}
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((g) => (
              <div key={g.id} className="flex flex-col gap-4 p-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {g.code}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">{g.name}</h2>
                  {g.description ? (
                    <p className="mt-1 text-sm text-slate-600">{g.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-slate-500">
                    Sort {g.sortOrder} · Checkout: {checkoutAdapterLabel(g.checkoutAdapter)}
                  </p>
                  {canEdit ? (
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                      <label className="block min-w-[220px] text-sm">
                        <span className="text-slate-600">Checkout adapter</span>
                        <input
                          list={`adapter-${g.id}`}
                          value={draftAdapterById[g.id] ?? ''}
                          onChange={(e) =>
                            setDraftAdapterById((prev) => ({ ...prev, [g.id]: e.target.value }))
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900"
                          placeholder="empty = none"
                        />
                        <datalist id={`adapter-${g.id}`}>
                          {CHECKOUT_ADAPTER_PRESETS.filter((p) => p.value).map((p) => (
                            <option key={p.value} value={p.value} />
                          ))}
                        </datalist>
                      </label>
                      <button
                        type="button"
                        disabled={
                          savingAdapterId === g.id ||
                          (draftAdapterById[g.id] ?? '') === (g.checkoutAdapter ?? '')
                        }
                        onClick={() => void saveAdapter(g)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                      >
                        {savingAdapterId === g.id ? 'Saving…' : 'Save adapter'}
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      g.isEnabled
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {g.isEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={togglingId === g.id}
                      onClick={() => void toggle(g)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                      {togglingId === g.id ? 'Saving…' : g.isEnabled ? 'Turn off' : 'Turn on'}
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      disabled={deletingId === g.id}
                      onClick={() => setDeleteGatewayConfirmRow(g)}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                    >
                      {deletingId === g.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageCard>

      <PageCard className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">APS customer authorizations</h2>
          <p className="mt-1 text-xs text-slate-500">
            Platform-wide view: all businesses and gateways. “Sales” tokens use each business’s APS merchant; “Subscription”
            tokens use the platform APS merchant for billing. Use Unlink APS to clear relationship at APS while keeping local
            records for analysis.
          </p>
        </div>
        {apsAuthLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading APS customer authorizations…</p>
        ) : apsAuthRows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No saved APS customer authorizations.</p>
        ) : (
          <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="min-w-[960px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Business</th>
                  <th className="px-4 py-3 font-semibold">Use</th>
                  <th className="px-4 py-3 font-semibold">Gateway</th>
                  <th className="px-4 py-3 font-semibold">Mobile</th>
                  <th className="px-4 py-3 font-semibold">APS unlink</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {apsAuthRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{r.businessName ?? 'Unknown business'}</p>
                      <p className="font-mono text-xs text-slate-500">{r.businessId}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.merchantScope === 'PLATFORM_SUBSCRIPTION' ? (
                        <span className="text-xs font-medium text-violet-800">Subscription (platform)</span>
                      ) : (
                        <span className="text-xs font-medium text-slate-700">Sales / POS</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.gatewayName} <span className="text-xs text-slate-500">({r.gatewayCode})</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.customerMobileNormalized}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      {r.lastUnlinkAttemptAt ? (
                        r.lastUnlinkSucceededAt ? (
                          <span className="text-emerald-700">
                            Success ·{' '}
                            {new Date(r.lastUnlinkAttemptAt).toLocaleString(undefined, {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        ) : (
                          <span className="text-rose-700" title={r.lastUnlinkError ?? 'APS unlink failed'}>
                            Failed ·{' '}
                            {new Date(r.lastUnlinkAttemptAt).toLocaleString(undefined, {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400">Never</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {new Date(r.updatedAt).toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={!canEdit || unlinkingAuthId === r.id}
                        onClick={() => void unlinkApsAuth(r)}
                        className="mr-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {unlinkingAuthId === r.id ? 'Unlinking…' : 'Unlink APS'}
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit || clearingAuthId === r.id}
                        onClick={() => void clearApsAuth(r)}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                      >
                        {clearingAuthId === r.id ? 'Clearing…' : 'Clear'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>
      <ConfirmModal
        open={Boolean(deleteGatewayConfirmRow)}
        title="Delete payment gateway?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={Boolean(deleteGatewayConfirmRow && deletingId === deleteGatewayConfirmRow.id)}
        onCancel={() => {
          if (!deletingId) {
            setDeleteGatewayConfirmRow(null)
          }
        }}
        onConfirm={() => void remove()}
      >
        {deleteGatewayConfirmRow
          ? `Remove gateway "${deleteGatewayConfirmRow.name}" (${deleteGatewayConfirmRow.code})? Businesses will no longer see it.`
          : ''}
      </ConfirmModal>
      <ConfirmModal
        open={Boolean(clearAuthConfirmRow)}
        title="Clear saved APS authorization?"
        confirmLabel="Clear"
        cancelLabel="Cancel"
        variant="danger"
        loading={Boolean(clearAuthConfirmRow && clearingAuthId === clearAuthConfirmRow.id)}
        onCancel={() => {
          if (!clearingAuthId) {
            setClearAuthConfirmRow(null)
          }
        }}
        onConfirm={() => void confirmClearApsAuth()}
      >
        {clearAuthConfirmRow
          ? `Clear saved APS authorization for ${clearAuthConfirmRow.customerMobileNormalized} (${clearAuthConfirmRow.businessName ?? clearAuthConfirmRow.businessId})?`
          : ''}
      </ConfirmModal>
      <ConfirmModal
        open={Boolean(unlinkConfirmRow)}
        title="Unlink APS customer?"
        confirmLabel="Unlink APS"
        cancelLabel="Cancel"
        loading={Boolean(unlinkConfirmRow && unlinkingAuthId === unlinkConfirmRow.id)}
        onCancel={() => {
          if (!unlinkingAuthId) {
            setUnlinkConfirmRow(null)
          }
        }}
        onConfirm={() => void confirmUnlinkApsAuth()}
      >
        {unlinkConfirmRow
          ? `Unlink ${unlinkConfirmRow.customerMobileNormalized} (${unlinkConfirmRow.businessName ?? unlinkConfirmRow.businessId}) on APS? Local records will be kept for analysis.`
          : ''}
      </ConfirmModal>
    </PageTransition>
  )
}
