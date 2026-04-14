import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'framer-motion'
import { Check, Copy, Loader2, MoreVertical, Plus, X } from 'lucide-react'

import { CenteredModal } from '../ui/CenteredModal'
import { ConfirmModal } from '../ui/ConfirmModal'
import { ModalOverlay } from '../ui/ModalOverlay'
import {
  ApiError,
  clearBusinessApsWalletCustomerAuth,
  deleteBusinessGatewayCredentialRequest,
  fetchBusinessApsWalletCustomerAuths,
  fetchBusinessGatewayCredentialStatus,
  fetchBusinessPaymentGateways,
  unlinkBusinessApsWalletCustomerAuth,
  upsertBusinessGatewayCredentialRequest,
  type ApsWalletCustomerAuthRow,
  type BusinessGatewayCredentialStatusRow,
  type BusinessPaymentGatewayRow,
  type PaymentWebhookEndpoints,
} from '../../services/subscriptionApi'

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

export type MerchantApiIntegrationPanelProps = {
  businessId?: string
  /** When false, credentials are visible but add/edit/remove/clear are disabled. */
  allowMutations: boolean
  /** Omit page title and tighten top spacing (e.g. platform business detail card). */
  embedded?: boolean
}

export function MerchantApiIntegrationPanel({
  businessId,
  allowMutations,
  embedded = false,
}: MerchantApiIntegrationPanelProps) {

  const [gateways, setGateways] = useState<IntegrableGateway[]>([])
  const [statusRows, setStatusRows] = useState<BusinessGatewayCredentialStatusRow[]>([])
  const [apsCustomerAuthRows, setApsCustomerAuthRows] = useState<ApsWalletCustomerAuthRow[]>([])
  const [webhookEndpoints, setWebhookEndpoints] = useState<PaymentWebhookEndpoints | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [unlinkingAuthId, setUnlinkingAuthId] = useState<string | null>(null)
  const [clearingAuthId, setClearingAuthId] = useState<string | null>(null)
  const [clearConfirmRow, setClearConfirmRow] = useState<ApsWalletCustomerAuthRow | null>(null)
  const [unlinkConfirmRow, setUnlinkConfirmRow] = useState<ApsWalletCustomerAuthRow | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

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
  const [yonnaWalletFeePercent, setYonnaWalletFeePercent] = useState('')

  const [apsUsername, setApsUsername] = useState('')
  const [apsPassword, setApsPassword] = useState('')
  /** Percent 0–100; stored as fraction in credentials (per business). */
  const [apsWalletFeePercent, setApsWalletFeePercent] = useState('')

  const load = useCallback(async () => {
    if (!businessId) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [gw, credPack, apsAuths] = await Promise.all([
        fetchBusinessPaymentGateways(businessId),
        fetchBusinessGatewayCredentialStatus(businessId),
        fetchBusinessApsWalletCustomerAuths(businessId),
      ])
      const list = gw.filter(isIntegrable)
      setGateways(list)
      setStatusRows(credPack.credentialStatus)
      setWebhookEndpoints(credPack.webhookEndpoints)
      setApsCustomerAuthRows(apsAuths)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load providers.')
      setGateways([])
      setStatusRows([])
      setWebhookEndpoints(null)
      setApsCustomerAuthRows([])
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
    setYonnaWalletFeePercent('')
    setApsUsername('')
    setApsPassword('')
    setApsWalletFeePercent('')
  }

  function closeCredentialModal() {
    setModalGateway(null)
    setCredentialModalMode(null)
  }

  function openAddModal(g: IntegrableGateway) {
    if (!allowMutations) {
      return
    }
    resetFormFields()
    setCredentialModalMode('add')
    setModalGateway(g)
    setGatewayKebabMenu(null)
  }

  function openEditModal(g: IntegrableGateway) {
    if (!allowMutations) {
      return
    }
    resetFormFields()
    setCredentialModalMode('edit')
    setModalGateway(g)
    setGatewayKebabMenu(null)
  }

  async function handleSave() {
    if (!allowMutations || !businessId || !modalGateway) {
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
          customerWalletFeeRate?: number | null
        } = {}
        if (replaceSecrets) {
          secrets.clientId = yonnaClientId.trim()
          secrets.secretKey = yonnaSecretKey.trim()
          secrets.webhookSecret = yonnaWebhook.trim()
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
      } else if (modalAdapter === 'aps_wallet') {
        const secrets: {
          username?: string
          password?: string
          customerWalletFeeRate?: number | null
        } = {}
        if (replaceSecrets) {
          secrets.username = apsUsername.trim()
          secrets.password = apsPassword.trim()
        } else {
          if (apsUsername.trim()) {
            secrets.username = apsUsername.trim()
          }
          if (apsPassword.trim()) {
            secrets.password = apsPassword.trim()
          }
        }
        const afp = apsWalletFeePercent.trim()
        if (afp !== '') {
          const p = Number.parseFloat(afp.replace(',', '.'))
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
    if (!allowMutations || !businessId || !modalGateway) {
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

  function openClearApsCustomerAuthConfirm(row: ApsWalletCustomerAuthRow) {
    if (!allowMutations) {
      return
    }
    setClearConfirmRow(row)
  }

  async function handleClearApsCustomerAuth() {
    if (!allowMutations || !businessId || !clearConfirmRow) {
      return
    }
    const row = clearConfirmRow
    setClearingAuthId(row.id)
    setError(null)
    try {
      await clearBusinessApsWalletCustomerAuth(businessId, row.id)
      await load()
      setClearConfirmRow(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not clear APS customer authorization.')
    } finally {
      setClearingAuthId(null)
    }
  }

  function openUnlinkApsCustomerAuthConfirm(row: ApsWalletCustomerAuthRow) {
    if (!allowMutations) {
      return
    }
    setUnlinkConfirmRow(row)
  }

  async function handleUnlinkApsCustomerAuth() {
    if (!allowMutations || !businessId || !unlinkConfirmRow) {
      return
    }
    const row = unlinkConfirmRow
    setUnlinkingAuthId(row.id)
    setError(null)
    setSuccessMessage(null)
    try {
      const result = await unlinkBusinessApsWalletCustomerAuth(businessId, row.id)
      await load()
      setSuccessMessage(result.message || 'APS customer unlinked successfully.')
      setUnlinkConfirmRow(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not unlink APS customer authorization.')
    } finally {
      setUnlinkingAuthId(null)
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

  const canSaveYonna =
    modalAdapter === 'yonna_wallet' &&
    (isEditCredentialModal
      ? Boolean(yonnaSecretKey.trim() && yonnaClientId.trim())
      : modalStatus?.hasCredential
        ? Boolean(
            yonnaSecretKey.trim() ||
              yonnaClientId.trim() ||
              yonnaWebhook.trim() ||
              yonnaWalletFeePercent.trim() !== '',
          )
        : Boolean(yonnaSecretKey.trim() && yonnaClientId.trim()))

  const canSaveAps =
    modalAdapter === 'aps_wallet' &&
    (isEditCredentialModal
      ? apsUsername.trim().length > 0 && apsPassword.trim().length > 0
      : modalStatus?.hasCredential
        ? Boolean(
            apsUsername.trim() ||
              apsPassword.trim() ||
              apsWalletFeePercent.trim() !== '',
          )
        : apsUsername.trim().length > 0 && apsPassword.trim().length > 0)

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

  const topSpacer = embedded ? 'mt-0' : 'mt-6'

  if (!businessId) {
    return <p className="text-sm text-slate-500">Select a business to manage merchant API settings.</p>
  }

  return (
    <div className={embedded ? '' : 'mx-auto max-w-5xl px-4 py-8'}>
      {!embedded ? (
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Merchant integrations</h1>
      ) : null}

        {webhookEndpoints ? (
          <div className={`${topSpacer} rounded-xl border border-teal-200/80 bg-teal-50/40 p-4`}>
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
          <div className={`${topSpacer} rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-950`}>
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
        {successMessage ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {successMessage}
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
                {allowMutations ? (
                  <>
                    Use <span className="font-medium text-slate-600">+</span> to add keys. When keys exist, use{' '}
                    <span className="font-medium text-slate-600">⋮ → Edit</span> to replace them (saved secrets are
                    overwritten).
                  </>
                ) : (
                  <>Credentials are read-only. Your role can view status but not change keys.</>
                )}
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
                        allowMutations ? (
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
                          <span className="w-10 shrink-0" aria-hidden />
                        )
                      ) : allowMutations ? (
                        <button
                          type="button"
                          onClick={() => openAddModal(g)}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                          aria-label={`Add keys for ${g.name}`}
                        >
                          <Plus className="h-5 w-5" strokeWidth={2} />
                        </button>
                      ) : (
                        <span className="w-10 shrink-0" aria-hidden />
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Integration status</h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3">Checkout</th>
                      <th className="px-4 py-3">Bearer</th>
                      <th className="px-4 py-3">Client ID</th>
                      <th className="px-4 py-3">Secret</th>
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
                      const isAps = ad === 'aps_wallet'
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
                            {isYonna ? (
                              <YesNo value={Boolean(fs?.clientId)} />
                            ) : isAps ? (
                              <YesNo value={Boolean(fs?.apsUsername)} />
                            ) : (
                              <EmDash />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isYonna ? (
                              <YesNo value={Boolean(fs?.secretKey)} />
                            ) : isAps ? (
                              <YesNo value={Boolean(fs?.apsPassword)} />
                            ) : (
                              <EmDash />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isWave || isYonna ? (
                              <YesNo value={Boolean(fs?.webhookSecret)} />
                            ) : (
                              <EmDash />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isWave || isYonna || isAps ? (
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

            <section className="mt-10">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                APS saved customer authorizations
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Stored per customer mobile for this business. Sales use your APS merchant credentials; subscription
                invoices use the platform APS merchant. Tokens are separate so repeat checkouts work for both.
              </p>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Mobile</th>
                      <th className="px-4 py-3">Use</th>
                      <th className="px-4 py-3">Gateway</th>
                      <th className="px-4 py-3">APS unlink</th>
                      <th className="px-4 py-3">Updated</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apsCustomerAuthRows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4 text-slate-500" colSpan={6}>
                          No saved APS customer authorizations yet.
                        </td>
                      </tr>
                    ) : (
                      apsCustomerAuthRows.map((r) => (
                        <tr key={r.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-3 font-medium text-slate-900">{r.customerMobileNormalized}</td>
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
                            {allowMutations ? (
                              <>
                                <button
                                  type="button"
                                  disabled={unlinkingAuthId === r.id}
                                  onClick={() => openUnlinkApsCustomerAuthConfirm(r)}
                                  className="mr-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                                >
                                  {unlinkingAuthId === r.id ? 'Unlinking…' : 'Unlink APS'}
                                </button>
                                <button
                                  type="button"
                                  disabled={clearingAuthId === r.id}
                                  onClick={() => openClearApsCustomerAuthConfirm(r)}
                                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                                >
                                  {clearingAuthId === r.id ? 'Clearing…' : 'Clear'}
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
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

                    {modalAdapter === 'aps_wallet' ? (
                      <>
                        <p className="text-xs text-slate-500">
                          API host and access channel come from the platform server environment. Store your APS
                          merchant <span className="font-medium text-slate-700">username</span> and{' '}
                          <span className="font-medium text-slate-700">password</span> here (encrypted). Used for
                          POS, orders, and guest invoice APS checkout.
                        </p>
                        <div>
                          <label className="text-sm font-medium text-slate-800">Merchant username</label>
                          <input
                            type="text"
                            autoComplete="off"
                            className={inputClass}
                            value={apsUsername}
                            onChange={(e) => setApsUsername(e.target.value)}
                            placeholder={isEditCredentialModal ? 'New username (required)' : 'Required'}
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            Sent as <code className="rounded bg-slate-100 px-1">username</code> and{' '}
                            <code className="rounded bg-slate-100 px-1">mobile</code> on APS login.
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-800">Merchant password</label>
                          <input
                            type="password"
                            autoComplete="new-password"
                            className={inputClass}
                            value={apsPassword}
                            onChange={(e) => setApsPassword(e.target.value)}
                            placeholder={isEditCredentialModal ? 'New password (required)' : 'Required'}
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
                            value={apsWalletFeePercent}
                            onChange={(e) => setApsWalletFeePercent(e.target.value)}
                            placeholder={isEditCredentialModal ? 'Empty removes saved fee' : 'e.g. 0 if none'}
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            Per business (APS may charge merchants different rates). Same role as Wave/Yonna for
                            merchant GL. Replace mode: empty clears the saved rate.
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

                    {modalAdapter &&
                    modalAdapter !== 'wave_gambia' &&
                    modalAdapter !== 'yonna_wallet' &&
                    modalAdapter !== 'aps_wallet' ? (
                      <p className="text-sm text-slate-600">
                        Adapter <code className="rounded bg-slate-100 px-1 text-xs">{modalAdapter}</code> is not
                        supported for key storage yet.
                      </p>
                    ) : null}
                  </div>

                  {modalAdapter === 'wave_gambia' ||
                  modalAdapter === 'yonna_wallet' ||
                  modalAdapter === 'aps_wallet' ? (
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
                          (modalAdapter === 'wave_gambia'
                            ? !canSaveWave
                            : modalAdapter === 'yonna_wallet'
                              ? !canSaveYonna
                              : !canSaveAps)
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
        <ConfirmModal
          open={Boolean(clearConfirmRow)}
          title="Clear saved APS authorization?"
          confirmLabel="Clear"
          cancelLabel="Cancel"
          variant="danger"
          loading={Boolean(clearConfirmRow && clearingAuthId === clearConfirmRow.id)}
          onCancel={() => {
            if (!clearingAuthId) {
              setClearConfirmRow(null)
            }
          }}
          onConfirm={() => void handleClearApsCustomerAuth()}
        >
          {clearConfirmRow
            ? `Clear saved APS authorization for ${clearConfirmRow.customerMobileNormalized}?`
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
          onConfirm={() => void handleUnlinkApsCustomerAuth()}
        >
          {unlinkConfirmRow
            ? `Unlink ${unlinkConfirmRow.customerMobileNormalized} on APS? Local records will be kept for analysis.`
            : ''}
        </ConfirmModal>

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
  )
}
