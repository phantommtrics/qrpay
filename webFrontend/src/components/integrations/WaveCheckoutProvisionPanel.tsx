import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2, RefreshCw, Wallet, X } from 'lucide-react'

import {
  ApiError,
  fetchWaveAggregatedMerchantProvisionLogs,
  fetchWaveSelfSettlementConfig,
  provisionWaveAggregatedMerchant,
  updateWaveSelfSettlementConfig,
  type WaveAggregatedMerchantProvisionLogRow,
  type WaveSelfSettlementConfig,
} from '../../services/subscriptionApi'
import { checkoutWalletBrandImageSrc } from '../../utils/checkoutWalletBrandImage'
import { formatMoney } from '../../utils/formatMoney'
import { CenteredModal } from '../ui/CenteredModal'
import { ModalOverlay } from '../ui/ModalOverlay'

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-teal-600/30 focus:border-teal-600 focus:ring-2 disabled:bg-slate-100'

function statusBadge(status: string) {
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

function feePercentLabel(rate: number) {
  return String(Math.round(rate * 10000) / 100)
}

function applyConfigToForm(data: WaveSelfSettlementConfig) {
  return {
    enabled: data.enabled,
    mobile: data.mobile ?? '',
    feePercent: feePercentLabel(data.feeRate),
    feeFixed: String(data.feeFixed),
  }
}

function withholdSummary(feePercent: string, feeFixed: string) {
  const percent = Number.parseFloat(feePercent.replace(',', '.'))
  const fixed = Number.parseFloat(feeFixed.replace(',', '.'))
  const hasPercent = Number.isFinite(percent) && percent > 0
  const hasFixed = Number.isFinite(fixed) && fixed > 0
  if (!hasPercent && !hasFixed) {
    return 'No withhold'
  }
  const parts: string[] = []
  if (hasPercent) {
    parts.push(`${percent}%`)
  }
  if (hasFixed) {
    parts.push(formatMoney(fixed, { decimals: 2 }))
  }
  return parts.join(' + ')
}

export type WaveCheckoutProvisionPanelProps = {
  businessId: string
  allowMutations: boolean
  platformWaveConfigured: boolean
  aggregatedMerchantReady: boolean
  /** True when this business stored its own Wave API key (aggregator provision skipped). */
  ownAccountActive?: boolean
  /** Called after a successful provision so parent can refresh credential status. */
  onProvisioned?: () => void
}

export function WaveCheckoutProvisionPanel({
  businessId,
  allowMutations,
  platformWaveConfigured,
  aggregatedMerchantReady,
  ownAccountActive = false,
  onProvisioned,
}: WaveCheckoutProvisionPanelProps) {
  const [logs, setLogs] = useState<WaveAggregatedMerchantProvisionLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [provisioning, setProvisioning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [settlementEnabled, setSettlementEnabled] = useState(false)
  const [settlementMobile, setSettlementMobile] = useState('')
  const [settlementFeePercent, setSettlementFeePercent] = useState('0')
  const [settlementFeeFixed, setSettlementFeeFixed] = useState('0')
  const [draftEnabled, setDraftEnabled] = useState(false)
  const [draftMobile, setDraftMobile] = useState('')
  const [draftFeePercent, setDraftFeePercent] = useState('0')
  const [draftFeeFixed, setDraftFeeFixed] = useState('0')
  const [settlementLoading, setSettlementLoading] = useState(false)
  const [settlementSaving, setSettlementSaving] = useState(false)
  const [settlementModalOpen, setSettlementModalOpen] = useState(false)
  const [settlementModalError, setSettlementModalError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchWaveAggregatedMerchantProvisionLogs(businessId)
      setLogs(data.logs)
    } catch (e) {
      setLogs([])
      setError(e instanceof ApiError ? e.message : 'Could not load Wave provision logs.')
    } finally {
      setLoading(false)
    }
  }, [businessId])

  const loadSettlement = useCallback(async () => {
    if (ownAccountActive) {
      return
    }
    setSettlementLoading(true)
    try {
      const data = await fetchWaveSelfSettlementConfig(businessId)
      const form = applyConfigToForm(data)
      setSettlementEnabled(form.enabled)
      setSettlementMobile(form.mobile)
      setSettlementFeePercent(form.feePercent)
      setSettlementFeeFixed(form.feeFixed)
      setDraftEnabled(form.enabled)
      setDraftMobile(form.mobile)
      setDraftFeePercent(form.feePercent)
      setDraftFeeFixed(form.feeFixed)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load Wave self-settlement settings.')
    } finally {
      setSettlementLoading(false)
    }
  }, [businessId, ownAccountActive])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadSettlement()
  }, [loadSettlement])

  function closeSettlementModal() {
    if (settlementSaving) {
      return
    }
    setSettlementModalOpen(false)
    setSettlementModalError(null)
    setDraftEnabled(settlementEnabled)
    setDraftMobile(settlementMobile)
    setDraftFeePercent(settlementFeePercent)
    setDraftFeeFixed(settlementFeeFixed)
  }

  function openSettlementModal() {
    setDraftEnabled(settlementEnabled)
    setDraftMobile(settlementMobile)
    setDraftFeePercent(settlementFeePercent)
    setDraftFeeFixed(settlementFeeFixed)
    setSettlementModalError(null)
    setSuccessMessage(null)
    setSettlementModalOpen(true)
  }

  async function handleSaveSettlement() {
    if (!allowMutations || ownAccountActive) {
      return
    }
    const percent = Number.parseFloat(draftFeePercent.replace(',', '.'))
    const fixed = Number.parseFloat(draftFeeFixed.replace(',', '.'))
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setSettlementModalError('Withhold percent must be between 0 and 100.')
      return
    }
    if (!Number.isFinite(fixed) || fixed < 0) {
      setSettlementModalError('Withhold amount must be 0 or greater.')
      return
    }
    if (draftEnabled && !draftMobile.trim()) {
      setSettlementModalError('Wave customer number is required when self-settlement is enabled.')
      return
    }
    setSettlementSaving(true)
    setSettlementModalError(null)
    try {
      const data = await updateWaveSelfSettlementConfig(businessId, {
        enabled: draftEnabled,
        mobile: draftMobile.trim() || null,
        feeRate: percent / 100,
        feeFixed: fixed,
      })
      const form = applyConfigToForm(data)
      setSettlementEnabled(form.enabled)
      setSettlementMobile(form.mobile)
      setSettlementFeePercent(form.feePercent)
      setSettlementFeeFixed(form.feeFixed)
      setDraftEnabled(form.enabled)
      setDraftMobile(form.mobile)
      setDraftFeePercent(form.feePercent)
      setDraftFeeFixed(form.feeFixed)
      setSettlementModalOpen(false)
      setSuccessMessage(
        data.enabled
          ? 'Self-settlement saved. After each Wave checkout webhook, DirectPay will payout the received amount minus withhold to this Wave number.'
          : 'Self-settlement saved (disabled).',
      )
    } catch (e) {
      setSettlementModalError(e instanceof ApiError ? e.message : 'Could not save self-settlement.')
    } finally {
      setSettlementSaving(false)
    }
  }

  async function handleProvision(force: boolean) {
    if (!allowMutations) {
      return
    }
    setProvisioning(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const result = await provisionWaveAggregatedMerchant(businessId, { force })
      if (result.status === 'succeeded') {
        setSuccessMessage(
          result.aggregatedMerchantId
            ? `Wave aggregated merchant provisioned (${result.aggregatedMerchantId}).`
            : 'Wave aggregated merchant provisioned.',
        )
        onProvisioned?.()
      } else if (result.status === 'skipped') {
        setSuccessMessage(result.message ?? 'Provision skipped.')
      }
      await load()
      await loadSettlement()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Wave provision failed.')
      await load()
    } finally {
      setProvisioning(false)
    }
  }

  const brandImg = checkoutWalletBrandImageSrc('wave_gambia')
  const settlementConfigured = Boolean(settlementMobile.trim()) || settlementEnabled

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {brandImg ? (
            <img src={brandImg} alt="" className="h-10 w-10 rounded-lg border border-slate-200 object-contain p-1" />
          ) : null}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Wave sales checkout
            </h2>
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              <li>
                Platform Wave:{' '}
                {platformWaveConfigured ? (
                  <span className="font-medium text-emerald-700">Configured</span>
                ) : (
                  <span className="font-medium text-amber-800">Not configured on server</span>
                )}
              </li>
              <li>
                Aggregated merchant:{' '}
                {ownAccountActive ? (
                  <span className="font-medium text-slate-700">Not applicable (own Wave account)</span>
                ) : aggregatedMerchantReady ? (
                  <span className="font-medium text-emerald-700">Ready</span>
                ) : (
                  <span className="font-medium text-amber-800">Not provisioned</span>
                )}
              </li>
              {ownAccountActive ? (
                <li>
                  Own Wave account:{' '}
                  <span className="font-medium text-emerald-700">Active</span>
                  <span className="ml-1 text-slate-500">
                    — aggregator provision is skipped. Manage the API key under Merchant API.
                  </span>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
        {allowMutations && !ownAccountActive ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={provisioning || !platformWaveConfigured}
              onClick={() => void handleProvision(false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {provisioning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {aggregatedMerchantReady ? 'Re-sync with Wave' : 'Create aggregated merchant'}
            </button>
            {aggregatedMerchantReady ? (
              <button
                type="button"
                disabled={provisioning || !platformWaveConfigured}
                onClick={() => void handleProvision(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Force update
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

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

      {!ownAccountActive ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Self-settlement</p>
            {settlementLoading ? (
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-700">
                {settlementEnabled ? (
                  <span className="mr-2 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    On
                  </span>
                ) : (
                  <span className="mr-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    Off
                  </span>
                )}
                {settlementConfigured ? (
                  <>
                    <span className="font-medium">{settlementMobile.trim() || 'No Wave number'}</span>
                    <span className="text-slate-500">
                      {' '}
                      · {withholdSummary(settlementFeePercent, settlementFeeFixed)}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-500">Not configured</span>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={!aggregatedMerchantReady || settlementLoading}
            onClick={() => openSettlementModal()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Wallet className="h-4 w-4" />
            {allowMutations ? (settlementConfigured ? 'Edit' : 'Configure') : 'View'}
          </button>
        </div>
      ) : null}

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Provision attempts</h3>
      {loading ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading logs…
        </p>
      ) : logs.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No provision attempts logged yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Trigger</th>
                <th className="px-3 py-2">Op</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Merchant ID</th>
                <th className="px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">
                    {new Date(row.createdAt).toLocaleString(undefined, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-700">{row.trigger}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{row.operation ?? '—'}</td>
                  <td className="px-3 py-2">{statusBadge(row.status)}</td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-slate-800" title={row.requestedName ?? ''}>
                    {row.requestedName ?? '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">
                    {row.aggregatedMerchantId ?? '—'}
                  </td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-xs text-red-700" title={row.errorMessage ?? ''}>
                    {row.errorMessage ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {settlementModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <ModalOverlay
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => closeSettlementModal()}
            />
            <CenteredModal className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl">
              <form
                className="relative p-6"
                onSubmit={(e) => {
                  e.preventDefault()
                  void handleSaveSettlement()
                }}
              >
                <button
                  type="button"
                  disabled={settlementSaving}
                  onClick={() => closeSettlementModal()}
                  className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
                <h2 className="pr-10 text-lg font-semibold text-slate-900">Self-settlement</h2>
                <div className="mt-5 space-y-4">
                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={draftEnabled}
                      disabled={!allowMutations || settlementSaving}
                      onChange={(e) => setDraftEnabled(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700"
                    />
                    <span className="font-medium">Enable payouts after checkout</span>
                  </label>

                  <div>
                    <label className="text-sm font-medium text-slate-800" htmlFor="wave-self-settlement-mobile">
                      Wave customer number
                    </label>
                    <input
                      id="wave-self-settlement-mobile"
                      type="tel"
                      autoComplete="off"
                      className={inputClass}
                      value={draftMobile}
                      disabled={!allowMutations || settlementSaving}
                      onChange={(e) => setDraftMobile(e.target.value)}
                      placeholder="+220…"
                    />
                    <p className="mt-1 text-xs text-slate-500">International format, for example +220…</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-slate-800" htmlFor="wave-self-settlement-percent">
                        Withhold percent
                      </label>
                      <input
                        id="wave-self-settlement-percent"
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        className={inputClass}
                        value={draftFeePercent}
                        disabled={!allowMutations || settlementSaving}
                        onChange={(e) => setDraftFeePercent(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-800" htmlFor="wave-self-settlement-fixed">
                        Withhold fixed amount
                      </label>
                      <input
                        id="wave-self-settlement-fixed"
                        type="number"
                        min={0}
                        step="0.01"
                        className={inputClass}
                        value={draftFeeFixed}
                        disabled={!allowMutations || settlementSaving}
                        onChange={(e) => setDraftFeeFixed(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {settlementModalError ? (
                  <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {settlementModalError}
                  </p>
                ) : null}

                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                  <button
                    type="button"
                    disabled={settlementSaving}
                    onClick={() => closeSettlementModal()}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    {allowMutations ? 'Cancel' : 'Close'}
                  </button>
                  {allowMutations ? (
                    <button
                      type="submit"
                      disabled={settlementSaving}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-500 disabled:opacity-50"
                    >
                      {settlementSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {settlementSaving ? 'Saving…' : 'Save'}
                    </button>
                  ) : null}
                </div>
              </form>
            </CenteredModal>
          </div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}
