import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'framer-motion'
import { Check, Copy, Loader2, MoreVertical, Plus, X } from 'lucide-react'

import { CenteredModal } from '../components/ui/CenteredModal'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import {
  ApiError,
  deleteBusinessGatewayCredentialRequest,
  fetchBusinessGatewayCredentialStatus,
  fetchBusinessPaymentGateways,
  upsertBusinessGatewayCredentialRequest,
  type BusinessGatewayCredentialStatusRow,
  type BusinessPaymentGatewayRow,
  type PaymentWebhookEndpoints,
} from '../services/subscriptionApi'

type IntegrableGateway = BusinessPaymentGatewayRow & { checkoutAdapter: string }

function isIntegrable(g: BusinessPaymentGatewayRow): g is IntegrableGateway {
  return Boolean(g.checkoutAdapter?.trim())
}

function YesNo({ value }: { value: boolean }) {
  return value ? (
    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
      Yes
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      No
    </span>
  )
}

function EmDash() {
  return <span className="text-slate-400">—</span>
}

export function MerchantApiPage() {
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id

  const [gateways, setGateways] = useState<IntegrableGateway[]>([])
  const [statusRows, setStatusRows] = useState<BusinessGatewayCredentialStatusRow[]>([])
  const [webhookEndpoints, setWebhookEndpoints] = useState<PaymentWebhookEndpoints | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [modalGateway, setModalGateway] = useState<IntegrableGateway | null>(null)
  /** add = first-time keys (+); edit = replace all secrets (⋮ menu). */
  const [credentialModalMode, setCredentialModalMode] = useState<'add' | 'edit' | null>(null)
  /** Fixed-position menu anchored to the ⋮ button (portal avoids overflow-x-auto clipping). */
  const [gatewayKebabMenu, setGatewayKebabMenu] = useState<{
    gatewayId: string
    top: number
    right: number
  } | null>(null)

  const [waveBearer, setWaveBearer] = useState('')
  const [waveWebhook, setWaveWebhook] = useState('')
  /** Percent 0–100 for UI; stored as fraction in credentials. */
  const [waveWalletFeePercent, setWaveWalletFeePercent] = useState('')

  const [yonnaClientId, setYonnaClientId] = useState('')
  const [yonnaSecretKey, setYonnaSecretKey] = useState('')
  const [yonnaWebhook, setYonnaWebhook] = useState('')
  /** Stored encrypted; used for in-store Yonna QR so staff need not type each order. */
  const [yonnaDefaultPayerPhone, setYonnaDefaultPayerPhone] = useState('')
  const [yonnaWalletFeePercent, setYonnaWalletFeePercent] = useState('')

  const load = useCallback(async () => {
    if (!businessId) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [gw, credPack] = await Promise.all([
        fetchBusinessPaymentGateways(businessId),
        fetchBusinessGatewayCredentialStatus(businessId),
      ])
      const list = gw.filter(isIntegrable)
      setGateways(list)
      setStatusRows(credPack.credentialStatus)
      setWebhookEndpoints(credPack.webhookEndpoints)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load providers.')
      setGateways([])
      setStatusRows([])
      setWebhookEndpoints(null)
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!gatewayKebabMenu) {
      return
    }
    const closeIfOutside = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (!el) {
        return
      }
      if (el.closest('[data-gateway-kebab-anchor]') || el.closest('[data-gateway-kebab-menu]')) {
        return
      }
      setGatewayKebabMenu(null)
    }
    const dismiss = () => setGatewayKebabMenu(null)
    document.addEventListener('click', closeIfOutside)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('click', closeIfOutside)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [gatewayKebabMenu])

  const statusByCode = useMemo(() => {
    const m = new Map<string, BusinessGatewayCredentialStatusRow>()
    for (const r of statusRows) {
      m.set(r.code, r)
    }
    return m
  }, [statusRows])

  const kebabMenuGateway = useMemo(() => {
    if (!gatewayKebabMenu) {
      return undefined
    }
    return gateways.find((x) => x.id === gatewayKebabMenu.gatewayId)
  }, [gatewayKebabMenu, gateways])

  const modalAdapter = modalGateway?.checkoutAdapter?.trim() ?? ''
  const modalStatus = modalGateway ? statusByCode.get(modalGateway.code) : undefined

  function resetFormFields() {
    setWaveBearer('')
    setWaveWebhook('')
    setWaveWalletFeePercent('')
    setYonnaClientId('')
    setYonnaSecretKey('')
    setYonnaWebhook('')
    setYonnaDefaultPayerPhone('')
    setYonnaWalletFeePercent('')
  }

  function closeCredentialModal() {
    setModalGateway(null)
    setCredentialModalMode(null)
  }

  function openAddModal(g: IntegrableGateway) {
    resetFormFields()
    if (g.checkoutAdapter?.trim() === 'yonna_wallet') {
      setYonnaDefaultPayerPhone('+220')
    }
    setCredentialModalMode('add')
    setModalGateway(g)
    setGatewayKebabMenu(null)
  }

  function openEditModal(g: IntegrableGateway) {
    resetFormFields()
    setCredentialModalMode('edit')
    setModalGateway(g)
    setGatewayKebabMenu(null)
    if (g.checkoutAdapter?.trim() === 'yonna_wallet') {
      setYonnaDefaultPayerPhone('+220')
    }
  }

  async function handleSave() {
    if (!businessId || !modalGateway) {
      return
    }
    setSaving(true)
    setError(null)
    const replaceSecrets = credentialModalMode === 'edit'
    try {
      if (modalAdapter === 'wave_gambia') {
        const secrets: {
          bearerToken?: string
          webhookSecret?: string
          customerWalletFeeRate?: number | null
        } = {}
        if (replaceSecrets) {
          secrets.bearerToken = waveBearer.trim()
          secrets.webhookSecret = waveWebhook.trim()
        } else {
          if (waveBearer.trim()) {
            secrets.bearerToken = waveBearer.trim()
          }
          if (waveWebhook.trim()) {
            secrets.webhookSecret = waveWebhook.trim()
          }
        }
        const wfp = waveWalletFeePercent.trim()
        if (wfp !== '') {
          const p = Number.parseFloat(wfp.replace(',', '.'))
          if (!Number.isFinite(p) || p < 0 || p > 100) {
            setError('Wallet fee must be between 0 and 100 (%).')
            return
          }
          secrets.customerWalletFeeRate = p / 100
        } else if (replaceSecrets) {
          secrets.customerWalletFeeRate = null
        }
        await upsertBusinessGatewayCredentialRequest(businessId, {
          gatewayCode: modalGateway.code,
          secrets,
          replaceSecrets,
        })
      } else if (modalAdapter === 'yonna_wallet') {
        const secrets: {
          clientId?: string
          secretKey?: string
          webhookSecret?: string
          defaultPayerPhone?: string
          customerWalletFeeRate?: number | null
        } = {}
        if (replaceSecrets) {
          secrets.clientId = yonnaClientId.trim()
          secrets.secretKey = yonnaSecretKey.trim()
          secrets.webhookSecret = yonnaWebhook.trim()
          secrets.defaultPayerPhone = yonnaDefaultPayerPhone.trim()
        } else {
          if (yonnaClientId.trim()) {
            secrets.clientId = yonnaClientId.trim()
          }
          if (yonnaSecretKey.trim()) {
            secrets.secretKey = yonnaSecretKey.trim()
          }
          if (yonnaWebhook.trim()) {
            secrets.webhookSecret = yonnaWebhook.trim()
          }
          if (yonnaDefaultPayerPhone.trim()) {
            secrets.defaultPayerPhone = yonnaDefaultPayerPhone.trim()
          }
        }
        const yfp = yonnaWalletFeePercent.trim()
        if (yfp !== '') {
          const p = Number.parseFloat(yfp.replace(',', '.'))
          if (!Number.isFinite(p) || p < 0 || p > 100) {
            setError('Wallet fee must be between 0 and 100 (%).')
            return
          }
          secrets.customerWalletFeeRate = p / 100
        } else if (replaceSecrets) {
          secrets.customerWalletFeeRate = null
        }
        await upsertBusinessGatewayCredentialRequest(businessId, {
          gatewayCode: modalGateway.code,
          secrets,
          replaceSecrets,
        })
      } else {
        setError('This provider cannot be configured here yet.')
        return
      }
      closeCredentialModal()
      resetFormFields()
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!businessId || !modalGateway) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await deleteBusinessGatewayCredentialRequest(businessId, modalGateway.code)
      closeCredentialModal()
      resetFormFields()
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Remove failed.')
    } finally {
      setSaving(false)
    }
  }

  const isEditCredentialModal = credentialModalMode === 'edit'

  const canSaveWave =
    modalAdapter === 'wave_gambia' &&
    (isEditCredentialModal
      ? waveBearer.trim().length > 0
      : waveBearer.trim().length > 0 ||
        (Boolean(modalStatus?.hasCredential) && waveWebhook.trim().length > 0) ||
        (Boolean(modalStatus?.hasCredential) && waveWalletFeePercent.trim() !== ''))

  function yonnaPayerPhoneValid(s: string) {
    return s.replace(/\D/g, '').length >= 7
  }

  const canSaveYonna =
    modalAdapter === 'yonna_wallet' &&
    (isEditCredentialModal
      ? Boolean(
          yonnaSecretKey.trim() &&
            yonnaClientId.trim() &&
            yonnaDefaultPayerPhone.trim() &&
            yonnaPayerPhoneValid(yonnaDefaultPayerPhone),
        )
      : modalStatus?.hasCredential
        ? Boolean(
            yonnaSecretKey.trim() ||
              yonnaClientId.trim() ||
              yonnaWebhook.trim() ||
              yonnaWalletFeePercent.trim() !== '' ||
              (yonnaDefaultPayerPhone.trim() && yonnaPayerPhoneValid(yonnaDefaultPayerPhone)),
          )
        : Boolean(
            yonnaSecretKey.trim() &&
              yonnaClientId.trim() &&
              yonnaDefaultPayerPhone.trim() &&
              yonnaPayerPhoneValid(yonnaDefaultPayerPhone),
          ))

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500'

  async function copyWebhookUrl(key: string, url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      setError('Could not copy to clipboard.')
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Merchant integrations</h1>

        {webhookEndpoints ? (
          <div className="mt-6 rounded-xl border border-teal-200/80 bg-teal-50/40 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-900">
              Provider webhook URLs
            </h2>
            <ul className="mt-3 space-y-2">
              <li className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <span className="shrink-0 text-xs font-medium text-teal-950">Wave</span>
                <code className="min-w-0 flex-1 break-all rounded-md bg-white/90 px-2 py-1.5 text-[11px] text-slate-800 ring-1 ring-teal-100">
                  {webhookEndpoints.wave}
                </code>
                <button
                  type="button"
                  onClick={() => void copyWebhookUrl('wave', webhookEndpoints.wave)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-teal-300 bg-white px-2 py-1 text-xs font-medium text-teal-900 hover:bg-teal-50"
                >
                  {copiedKey === 'wave' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedKey === 'wave' ? 'Copied' : 'Copy'}
                </button>
              </li>
              <li className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <span className="shrink-0 text-xs font-medium text-teal-950">Yonna Forex</span>
                <code className="min-w-0 flex-1 break-all rounded-md bg-white/90 px-2 py-1.5 text-[11px] text-slate-800 ring-1 ring-teal-100">
                  {webhookEndpoints.yonnaForex}
                </code>
                <button
                  type="button"
                  onClick={() => void copyWebhookUrl('yonna', webhookEndpoints.yonnaForex)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-teal-300 bg-white px-2 py-1 text-xs font-medium text-teal-900 hover:bg-teal-50"
                >
                  {copiedKey === 'yonna' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedKey === 'yonna' ? 'Copied' : 'Copy'}
                </button>
              </li>
            </ul>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-950">
            <span className="font-medium">Webhook URLs unavailable.</span> Set{' '}
            <code className="rounded bg-white/80 px-1">APP_PUBLIC_BASE_URL</code> on the API server (public HTTPS origin
            where <code className="rounded bg-white/80 px-1">/api/webhooks/wave</code> and{' '}
            <code className="rounded bg-white/80 px-1">/api/webhooks/yonna-forex</code> are reachable).
          </div>
        )}

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-10 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : gateways.length === 0 ? (
          <p className="mt-10 text-sm text-slate-600">
            No checkout providers are enabled. Ask your platform admin to enable gateways under payment gateways.
          </p>
        ) : (
          <>
            <section className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment gateways</h2>
              <p className="mt-1 text-xs text-slate-500">
                Use <span className="font-medium text-slate-600">+</span> to add keys. When keys exist, use{' '}
                <span className="font-medium text-slate-600">⋮ → Edit</span> to replace them (saved secrets are overwritten).
              </p>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2 pt-1 [-webkit-overflow-scrolling:touch]">
                {gateways.map((g) => {
                  const st = statusByCode.get(g.code)
                  const hasKeys = Boolean(st?.hasCredential)
                  return (
                    <div
                      key={g.id}
                      className="relative flex min-w-[min(100%,260px)] max-w-[280px] shrink-0 items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm ring-1 ring-slate-900/5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{g.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {st?.checkoutConfigured ? (
                            <span className="text-emerald-700">Checkout ready</span>
                          ) : st?.hasCredential ? (
                            <span className="text-amber-700">Incomplete</span>
                          ) : (
                            <span>Not configured</span>
                          )}
                        </p>
                      </div>
                      {hasKeys ? (
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            data-gateway-kebab-anchor
                            onClick={(e) => {
                              e.stopPropagation()
                              const btn = e.currentTarget
                              const rect = btn.getBoundingClientRect()
                              setGatewayKebabMenu((cur) =>
                                cur?.gatewayId === g.id
                                  ? null
                                  : {
                                      gatewayId: g.id,
                                      top: rect.bottom + 6,
                                      right: window.innerWidth - rect.right,
                                    },
                              )
                            }}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                            aria-label={`${g.name} options`}
                            aria-expanded={gatewayKebabMenu?.gatewayId === g.id}
                            aria-haspopup="menu"
                          >
                            <MoreVertical className="h-5 w-5" strokeWidth={2} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openAddModal(g)}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                          aria-label={`Add keys for ${g.name}`}
                        >
                          <Plus className="h-5 w-5" strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Integration status</h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3">Checkout</th>
                      <th className="px-4 py-3">Bearer</th>
                      <th className="px-4 py-3">Client ID</th>
                      <th className="px-4 py-3">Secret</th>
                      <th className="px-4 py-3">Pay phone</th>
                      <th className="px-4 py-3">Webhook</th>
                      <th className="px-4 py-3">Wallet fee</th>
                      <th className="px-4 py-3">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusRows.map((row) => {
                      const ad = row.checkoutAdapter?.trim() ?? ''
                      const fs = row.fieldStatus
                      const isWave = ad === 'wave_gambia'
                      const isYonna = ad === 'yonna_wallet'
                      return (
                        <tr key={row.gatewayId} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                          <td className="px-4 py-3">
                            <YesNo value={row.checkoutConfigured} />
                          </td>
                          <td className="px-4 py-3">
                            {isWave ? <YesNo value={Boolean(fs?.apiBearer)} /> : <EmDash />}
                          </td>
                          <td className="px-4 py-3">
                            {isYonna ? <YesNo value={Boolean(fs?.clientId)} /> : <EmDash />}
                          </td>
                          <td className="px-4 py-3">
                            {isYonna ? <YesNo value={Boolean(fs?.secretKey)} /> : <EmDash />}
                          </td>
                          <td className="px-4 py-3">
                            {isYonna ? <YesNo value={Boolean(fs?.defaultPayerPhone)} /> : <EmDash />}
                          </td>
                          <td className="px-4 py-3">
                            {isWave || isYonna ? (
                              <YesNo value={Boolean(fs?.webhookSecret)} />
                            ) : (
                              <EmDash />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isWave || isYonna ? (
                              <YesNo value={Boolean(fs?.customerWalletFeeRate)} />
                            ) : (
                              <EmDash />
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                            {row.updatedAt
                              ? new Date(row.updatedAt).toLocaleString(undefined, {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <AnimatePresence>
          {modalGateway ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <ModalOverlay
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                onClick={() => !saving && closeCredentialModal()}
              />
              <CenteredModal className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl">
                <div className="relative p-6">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => closeCredentialModal()}
                    className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <h2 className="pr-10 text-lg font-semibold text-slate-900">{modalGateway.name}</h2>

                  <div className="mt-5 space-y-4">
                    {modalAdapter === 'wave_gambia' ? (
                      <>
                        <p className="text-xs text-slate-500">
                          {isEditCredentialModal
                            ? 'Webhook secret: leave empty to clear the saved webhook secret.'
                            : 'Bearer token is required on first save.'}
                        </p>
                        <div>
                          <label className="text-sm font-medium text-slate-800">Checkout bearer</label>
                          <input
                            type="password"
                            autoComplete="off"
                            className={inputClass}
                            value={waveBearer}
                            onChange={(e) => setWaveBearer(e.target.value)}
                            placeholder={
                              isEditCredentialModal
                                ? 'New bearer (required)'
                                : 'Required'
                            }
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-800">Webhook secret</label>
                          <input
                            type="password"
                            autoComplete="off"
                            className={inputClass}
                            value={waveWebhook}
                            onChange={(e) => setWaveWebhook(e.target.value)}
                            placeholder={isEditCredentialModal ? 'Empty removes webhook secret' : 'Optional'}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-800">
                            Est. wallet fee on sales (% of payment)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            className={inputClass}
                            value={waveWalletFeePercent}
                            onChange={(e) => setWaveWalletFeePercent(e.target.value)}
                            placeholder={isEditCredentialModal ? 'Empty removes saved fee' : 'e.g. 1 for 1%'}
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            Used for your books only (Dr QR wallet fees · Cr digital clearing). Per provider; leave
                            empty if none. Replace mode: empty clears the saved rate.
                          </p>
                        </div>
                      </>
                    ) : null}

                    {modalAdapter === 'yonna_wallet' ? (
                      <>
                        <div>
                          <label className="text-sm font-medium text-slate-800">Client ID</label>
                          <input
                            type="text"
                            autoComplete="off"
                            className={inputClass}
                            value={yonnaClientId}
                            onChange={(e) => setYonnaClientId(e.target.value)}
                            placeholder={isEditCredentialModal ? 'New client ID (required)' : 'Required'}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-800">Secret key</label>
                          <input
                            type="password"
                            autoComplete="off"
                            className={inputClass}
                            value={yonnaSecretKey}
                            onChange={(e) => setYonnaSecretKey(e.target.value)}
                            placeholder={isEditCredentialModal ? 'New secret (required)' : 'Required'}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-800">
                            Default wallet phone (QR checkout)
                          </label>
                          <input
                            type="tel"
                            autoComplete="off"
                            className={inputClass}
                            value={yonnaDefaultPayerPhone}
                            onChange={(e) => setYonnaDefaultPayerPhone(e.target.value)}
                            placeholder={
                              isEditCredentialModal
                                ? 'Required on replace (e.g. +2207XXXXXXX)'
                                : '+220 — then the rest of the number'
                            }
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            Saved encrypted with your keys. Orders → Wallet can use this number so staff do not
                            retype it each sale.
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-800">Webhook secret</label>
                          <input
                            type="password"
                            autoComplete="off"
                            className={inputClass}
                            value={yonnaWebhook}
                            onChange={(e) => setYonnaWebhook(e.target.value)}
                            placeholder={isEditCredentialModal ? 'Empty removes webhook secret' : 'same as webhook secret'}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-800">
                            Est. wallet fee on sales (% of payment)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            className={inputClass}
                            value={yonnaWalletFeePercent}
                            onChange={(e) => setYonnaWalletFeePercent(e.target.value)}
                            placeholder={isEditCredentialModal ? 'Empty removes saved fee' : 'e.g. 0 if none'}
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            Same as Wave: optional rate for merchant GL when customers pay by Yonna wallet.
                          </p>
                        </div>
                      </>
                    ) : null}

                    {modalAdapter && modalAdapter !== 'wave_gambia' && modalAdapter !== 'yonna_wallet' ? (
                      <p className="text-sm text-slate-600">
                        Adapter <code className="rounded bg-slate-100 px-1 text-xs">{modalAdapter}</code> is not
                        supported for key storage yet.
                      </p>
                    ) : null}
                  </div>

                  {modalAdapter === 'wave_gambia' || modalAdapter === 'yonna_wallet' ? (
                    <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                      {modalStatus?.hasCredential ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleRemove()}
                          className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                        >
                          Remove all keys
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={
                          saving ||
                          (modalAdapter === 'wave_gambia' ? !canSaveWave : !canSaveYonna)
                        }
                        onClick={() => void handleSave()}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {saving ? 'Saving…' : isEditCredentialModal ? 'Replace keys' : 'Save'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </CenteredModal>
            </div>
          ) : null}
        </AnimatePresence>

        {gatewayKebabMenu && kebabMenuGateway && typeof document !== 'undefined'
          ? createPortal(
              <div
                data-gateway-kebab-menu
                role="menu"
                className="fixed z-[10000] min-w-[9rem] rounded-lg border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-slate-900/10"
                style={{ top: gatewayKebabMenu.top, right: gatewayKebabMenu.right }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                  onClick={() => openEditModal(kebabMenuGateway)}
                >
                  Edit keys
                </button>
              </div>,
              document.body,
            )
          : null}
      </div>
    </PageTransition>
  )
}
