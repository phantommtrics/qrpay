import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Building2, Mail, Package, Plug, User } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { MerchantApiIntegrationPanel } from '../../components/integrations/MerchantApiIntegrationPanel'
import { WaveCheckoutProvisionPanel } from '../../components/integrations/WaveCheckoutProvisionPanel'
import {
  fetchBusinessGatewayCredentialStatus,
  type BusinessGatewayCredentialStatusRow,
} from '../../services/subscriptionApi'
import { TablePagination } from '../../components/ui/TablePagination'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  fetchPlatformBusinessDetail,
  postPlatformBusinessBlock,
  postPlatformBusinessRestore,
  postPlatformBusinessTerminate,
  postPlatformBusinessUnblock,
  type PlatformBusinessDetail,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

const PAGE_SIZE = 10

function formatShortDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function PlatformBusinessDetailPage() {
  const { businessId } = useParams<{ businessId: string }>()
  const { user, canAccess } = useAuth()
  const canViewMerchantApi =
    Boolean(user?.isPlatformOwner) ||
    canAccess('platform.businesses.merchant_api.view') ||
    canAccess('platform.businesses.merchant_api.edit')
  const canEditMerchantApi =
    Boolean(user?.isPlatformOwner) || canAccess('platform.businesses.merchant_api.edit')
  const canEditBusiness =
    Boolean(user?.isPlatformOwner) || canAccess('platform.businesses.manage')
  const [detail, setDetail] = useState<PlatformBusinessDetail | null>(null)
  const [membershipsPage, setMembershipsPage] = useState(1)
  const [subscriptionsPage, setSubscriptionsPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [lifecycleError, setLifecycleError] = useState<string | null>(null)
  const [lifecycleReason, setLifecycleReason] = useState('')
  const [terminateModalOpen, setTerminateModalOpen] = useState(false)
  const [waveCredPack, setWaveCredPack] = useState<{
    platformWaveConfigured: boolean
    waveRow: BusinessGatewayCredentialStatusRow | null
  } | null>(null)

  const loadWaveCredPack = useCallback(async () => {
    if (!businessId) {
      return
    }
    const credPack = await fetchBusinessGatewayCredentialStatus(businessId).catch(() => null)
    if (credPack) {
      const waveRow = credPack.credentialStatus.find((r) => r.code === 'wave_gambia') ?? null
      setWaveCredPack({
        platformWaveConfigured: Boolean(credPack.platformWaveConfigured),
        waveRow,
      })
    } else {
      setWaveCredPack(null)
    }
  }, [businessId])

  useEffect(() => {
    if (!businessId) return
    void (async () => {
      await Promise.resolve()
      setMembershipsPage(1)
      setSubscriptionsPage(1)
    })()
  }, [businessId])

  useEffect(() => {
    if (!isPlatformOperator(user) || !businessId) {
      return
    }
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      setLoading(true)
      setError(null)
      try {
        const [data, credPack] = await Promise.all([
          fetchPlatformBusinessDetail(businessId, {
            membershipsPage,
            membershipsPageSize: PAGE_SIZE,
            subscriptionsPage,
            subscriptionsPageSize: PAGE_SIZE,
          }),
          fetchBusinessGatewayCredentialStatus(businessId).catch(() => null),
        ])
        if (!cancelled) {
          setDetail(data)
          if (credPack) {
            const waveRow =
              credPack.credentialStatus.find((r) => r.code === 'wave_gambia') ?? null
            setWaveCredPack({
              platformWaveConfigured: Boolean(credPack.platformWaveConfigured),
              waveRow,
            })
          } else {
            setWaveCredPack(null)
          }
        }
      } catch (e) {
        if (!cancelled) {
          setDetail(null)
          setError(e instanceof ApiError ? e.message : 'Could not load business.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.isPlatformOwner, user?.isPlatformAdmin, businessId, membershipsPage, subscriptionsPage])

  const runLifecycle = useCallback(
    async (action: 'block' | 'unblock' | 'terminate' | 'restore') => {
      if (!businessId) return
      const reason = lifecycleReason.trim() || null
      setLifecycleBusy(true)
      setLifecycleError(null)
      try {
        if (action === 'block') await postPlatformBusinessBlock(businessId, reason)
        else if (action === 'unblock') await postPlatformBusinessUnblock(businessId, reason)
        else if (action === 'terminate') await postPlatformBusinessTerminate(businessId, reason)
        else await postPlatformBusinessRestore(businessId, reason)
        const data = await fetchPlatformBusinessDetail(businessId, {
          membershipsPage,
          membershipsPageSize: PAGE_SIZE,
          subscriptionsPage,
          subscriptionsPageSize: PAGE_SIZE,
        })
        setDetail(data)
        setLifecycleReason('')
        setTerminateModalOpen(false)
      } catch (e) {
        setLifecycleError(e instanceof ApiError ? e.message : 'Lifecycle action failed.')
      } finally {
        setLifecycleBusy(false)
      }
    },
    [businessId, lifecycleReason, membershipsPage, subscriptionsPage],
  )

  if (!isPlatformOperator(user)) {
    return null
  }

  const status = detail?.operationalStatus ?? 'ACTIVE'

  return (
    <PageTransition className="space-y-6" withSlide>
      <Link
        to={APP_PATHS.platformBusinesses}
        className="inline-flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to businesses
      </Link>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <PageCard className="p-6">
          <p className="text-sm text-red-600">{error}</p>
        </PageCard>
      ) : !detail ? null : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">{detail.name}</h1>
                  <p className="text-slate-500">{detail.slug}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-600">
                Industry:{' '}
                <span className="font-medium text-slate-800">
                  {detail.industry?.trim() || '—'}
                </span>
                {' · '}
                Status:{' '}
                <span
                  className={
                    status === 'ACTIVE'
                      ? 'font-semibold text-emerald-700'
                      : status === 'BLOCKED'
                        ? 'font-semibold text-amber-700'
                        : 'font-semibold text-rose-700'
                  }
                >
                  {status}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
                <span className="text-slate-500">Members</span>{' '}
                <span className="font-semibold text-slate-900">{detail._count.memberships}</span>
              </span>
              <span className="rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
                <span className="text-slate-500">Products</span>{' '}
                <span className="font-semibold text-slate-900">{detail._count.products}</span>
              </span>
            </div>
          </div>

          {canEditBusiness ? (
            <PageCard className="p-6">
              <h2 className="text-lg font-semibold text-slate-900">Lifecycle</h2>
              <p className="mt-1 text-sm text-slate-500">
                Block freezes merchant and internal-partner API access (like an expired subscription).
                Terminate soft-deletes the business; user accounts remain.
              </p>
              {detail.statusReason ? (
                <p className="mt-3 text-sm text-slate-600">
                  Last reason: <span className="font-medium">{detail.statusReason}</span>
                  {detail.statusChangedAt
                    ? ` · ${formatShortDate(detail.statusChangedAt)}`
                    : null}
                </p>
              ) : null}
              <label className="mt-4 block">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Reason (optional)
                </span>
                <input
                  value={lifecycleReason}
                  onChange={(e) => setLifecycleReason(e.target.value)}
                  className="w-full max-w-xl rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                  placeholder="e.g. Chargeback / test tenant / fraud review"
                />
              </label>
              {lifecycleError ? (
                <p className="mt-3 text-sm text-red-600">{lifecycleError}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {status === 'ACTIVE' ? (
                  <button
                    type="button"
                    disabled={lifecycleBusy}
                    onClick={() => void runLifecycle('block')}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    Block
                  </button>
                ) : null}
                {status === 'BLOCKED' ? (
                  <button
                    type="button"
                    disabled={lifecycleBusy}
                    onClick={() => void runLifecycle('unblock')}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    Unblock (activate)
                  </button>
                ) : null}
                {status !== 'TERMINATED' ? (
                  <button
                    type="button"
                    disabled={lifecycleBusy}
                    onClick={() => {
                      setLifecycleError(null)
                      setTerminateModalOpen(true)
                    }}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                  >
                    Terminate
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={lifecycleBusy}
                    onClick={() => void runLifecycle('restore')}
                    className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-100 disabled:opacity-50"
                  >
                    Restore
                  </button>
                )}
              </div>
            </PageCard>
          ) : null}

          <ConfirmModal
            open={terminateModalOpen}
            title={`Terminate ${detail.name}?`}
            confirmLabel="Terminate business"
            cancelLabel="Cancel"
            variant="danger"
            loading={lifecycleBusy}
            onCancel={() => {
              if (!lifecycleBusy) setTerminateModalOpen(false)
            }}
            onConfirm={() => void runLifecycle('terminate')}
          >
            <p>
              This soft-deletes the business. Owner and staff user accounts stay active. The
              organization disappears from login unless they belong to another business.
            </p>
            <p className="mt-2">
              Internal partner API calls for this tenant will be rejected. You can restore it later
              from this page.
            </p>
          </ConfirmModal>

          <div className="grid gap-6 lg:grid-cols-2">
            <PageCard className="p-6">
              <h2 className="text-lg font-semibold text-slate-900">Registered owner</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <User className="mt-0.5 h-4 w-4 text-slate-400" />
                  <div>
                    <p className="font-medium text-slate-800">{detail.ownerName}</p>
                    <p className="flex items-center gap-1.5 text-slate-600">
                      <Mail className="h-3.5 w-3.5" />
                      {detail.ownerEmail}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Business record created {formatShortDate(detail.createdAt)}
                </p>
              </div>
            </PageCard>

            <PageCard className="overflow-hidden p-0">
              <div className="p-6 pb-4">
                <h2 className="text-lg font-semibold text-slate-900">Subscriptions</h2>
              </div>
              {detail.subscriptionsTotal === 0 ? (
                <p className="px-6 pb-6 text-sm text-slate-500">No subscription history.</p>
              ) : (
                <>
                  <ul className="space-y-3 px-6 pb-4">
                    {detail.subscriptions.map((s) => (
                      <li
                        key={s.id}
                        className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-slate-800">{s.plan.name}</span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                            {s.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {s.currentPeriodEnd
                            ? `Current period ends ${formatShortDate(s.currentPeriodEnd)}`
                            : 'No fixed period end (perpetual / signed contract).'}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <TablePagination
                    page={subscriptionsPage}
                    pageSize={PAGE_SIZE}
                    total={detail.subscriptionsTotal}
                    onPageChange={setSubscriptionsPage}
                  />
                </>
              )}
            </PageCard>
          </div>

          <PageCard className="overflow-hidden p-0">
            <div className="p-6 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">Team memberships</h2>
            </div>
            {detail.membershipsTotal === 0 ? (
              <p className="px-6 pb-6 text-sm text-slate-500">No members.</p>
            ) : (
              <>
                <div className="overflow-x-auto px-6">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="py-2 pr-4">User</th>
                        <th className="py-2 pr-4">Role</th>
                        <th className="py-2 pr-4">Access</th>
                        <th className="py-2 pr-4">Owner</th>
                        <th className="py-2">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detail.memberships.map((m) => (
                        <tr key={m.id}>
                          <td className="py-3 pr-4">
                            <p className="font-medium text-slate-800">{m.user.name}</p>
                            <p className="text-xs text-slate-500">{m.user.email}</p>
                          </td>
                          <td className="py-3 pr-4 text-slate-700">{m.user.role}</td>
                          <td className="py-3 pr-4">
                            <span
                              className={
                                m.user.isActive
                                  ? 'text-emerald-700'
                                  : 'text-slate-400 line-through'
                              }
                            >
                              {m.status}
                            </span>
                          </td>
                          <td className="py-3 pr-4">{m.isOwner ? 'Yes' : '—'}</td>
                          <td className="py-3 text-slate-600">
                            {formatShortDate(m.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  page={membershipsPage}
                  pageSize={PAGE_SIZE}
                  total={detail.membershipsTotal}
                  onPageChange={setMembershipsPage}
                />
              </>
            )}
          </PageCard>

          {canViewMerchantApi && businessId ? (
            <PageCard className="overflow-hidden p-0">
              <div className="border-b border-slate-100 p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <Plug className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Merchant API</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Yonna, APS, and optional own Wave Business credentials for this business. Aggregated Wave
                      checkout is provisioned below unless this business uses its own Wave API key.
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-6 pt-4">
                <WaveCheckoutProvisionPanel
                  businessId={businessId}
                  allowMutations={canEditMerchantApi}
                  platformWaveConfigured={waveCredPack?.platformWaveConfigured ?? false}
                  aggregatedMerchantReady={Boolean(
                    waveCredPack?.waveRow?.fieldStatus?.aggregatedMerchant,
                  )}
                  ownAccountActive={Boolean(waveCredPack?.waveRow?.fieldStatus?.ownAccountBearer)}
                  onProvisioned={() => void loadWaveCredPack()}
                />
                <MerchantApiIntegrationPanel
                  businessId={businessId}
                  allowMutations={canEditMerchantApi}
                  embedded
                />
              </div>
            </PageCard>
          ) : null}

          <PageCard className="flex items-center gap-3 border-dashed p-4 text-sm text-slate-600">
            <Package className="h-5 w-5 shrink-0 text-slate-400" />
            Product catalog for this business is managed inside the merchant workspace; platform view
            shows counts only.
          </PageCard>
        </>
      )}
    </PageTransition>
  )
}
