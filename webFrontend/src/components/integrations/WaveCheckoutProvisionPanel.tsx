import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'

import {
  ApiError,
  fetchWaveAggregatedMerchantProvisionLogs,
  provisionWaveAggregatedMerchant,
  type WaveAggregatedMerchantProvisionLogRow,
} from '../../services/subscriptionApi'
import { checkoutWalletBrandImageSrc } from '../../utils/checkoutWalletBrandImage'

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

  useEffect(() => {
    void load()
  }, [load])

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
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Wave provision failed.')
      await load()
    } finally {
      setProvisioning(false)
    }
  }

  const brandImg = checkoutWalletBrandImageSrc('wave_gambia')

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
    </section>
  )
}
