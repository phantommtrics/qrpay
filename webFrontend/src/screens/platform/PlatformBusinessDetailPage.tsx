import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Building2, Mail, Package, Pencil, Plug, User } from 'lucide-react'
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
  fetchCorporateBillingPlans,
  fetchCorporateEntitlementCatalog,
  fetchPlatformBusinessDetail,
  postPlatformBusinessBlock,
  postPlatformBusinessRestore,
  postPlatformBusinessTerminate,
  postPlatformBusinessUnblock,
  resetBusinessMemberMfa,
  renamePlatformBusiness,
  upgradePlatformBusinessToCorporate,
  type CorporateBillingPlanRow,
  type CorporateEntitlementCatalogItem,
  type PlatformBusinessDetail,
} from '../../services/subscriptionApi'
import type { SubscriptionBillingInterval } from '../../types'
import { isCorporateIndustry } from '../../utils/businessIndustry'
import { isPlatformOperator } from '../../utils/platformOperator'

const PAGE_SIZE = 10

type DetailTab = 'overview' | 'lifecycle' | 'corporate' | 'team' | 'integrations'

function formatShortDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function corporateTemplateOptionLabel(p: CorporateBillingPlanRow) {
  return `${p.name} — ${p.monthlyPrice}/mo · ${p.yearlyPrice}/yr`
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
    Boolean(user?.isPlatformOwner) ||
    Boolean(user?.platformPermissions?.['platform.businesses']?.edit)
  const [detail, setDetail] = useState<PlatformBusinessDetail | null>(null)
  const [membershipsPage, setMembershipsPage] = useState(1)
  const [subscriptionsPage, setSubscriptionsPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [lifecycleError, setLifecycleError] = useState<string | null>(null)
  const [lifecycleReason, setLifecycleReason] = useState('')
  const [terminateModalOpen, setTerminateModalOpen] = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [resettingMfaUserId, setResettingMfaUserId] = useState<string | null>(null)
  const [mfaMessage, setMfaMessage] = useState<string | null>(null)
  const [mfaError, setMfaError] = useState<string | null>(null)
  const [corpPlans, setCorpPlans] = useState<CorporateBillingPlanRow[]>([])
  const [corpCatalog, setCorpCatalog] = useState<CorporateEntitlementCatalogItem[]>([])
  const [corpPlanId, setCorpPlanId] = useState('')
  const [corpInterval, setCorpInterval] = useState<SubscriptionBillingInterval>('MONTHLY')
  const [corpEntitlements, setCorpEntitlements] = useState<Record<string, boolean>>({})
  const [corpBusy, setCorpBusy] = useState(false)
  const [corpError, setCorpError] = useState<string | null>(null)
  const [corpMessage, setCorpMessage] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>('overview')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameBusy, setNameBusy] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameMessage, setNameMessage] = useState<string | null>(null)
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
      setMfaMessage(null)
      setMfaError(null)
      setCorpMessage(null)
      setCorpError(null)
      setTab('overview')
      setEditingName(false)
      setNameError(null)
      setNameMessage(null)
    })()
  }, [businessId])

  useEffect(() => {
    if (!canEditBusiness) return
    let cancelled = false
    void (async () => {
      try {
        const [plans, catalog] = await Promise.all([
          fetchCorporateBillingPlans(),
          fetchCorporateEntitlementCatalog(),
        ])
        if (cancelled) return
        const activePlans = plans.filter((p) => p.isActive)
        setCorpPlans(activePlans)
        setCorpCatalog(catalog.items)
        setCorpPlanId((prev) => prev || activePlans[0]?.id || '')
      } catch {
        if (!cancelled) {
          setCorpPlans([])
          setCorpCatalog([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canEditBusiness])

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

  const handleResetMemberMfa = useCallback(
    async (memberUserId: string, email: string) => {
      if (!businessId || resettingMfaUserId) return
      if (
        !window.confirm(
          `Reset authenticator for ${email}? They can sign in with password again and re-enable 2FA from Profile.`,
        )
      ) {
        return
      }
      setMfaError(null)
      setMfaMessage(null)
      setResettingMfaUserId(memberUserId)
      try {
        await resetBusinessMemberMfa(businessId, memberUserId)
        const data = await fetchPlatformBusinessDetail(businessId, {
          membershipsPage,
          membershipsPageSize: PAGE_SIZE,
          subscriptionsPage,
          subscriptionsPageSize: PAGE_SIZE,
        })
        setDetail(data)
        setMfaMessage(`Authenticator reset for ${email}.`)
      } catch (e) {
        setMfaError(e instanceof ApiError ? e.message : 'Could not reset authenticator.')
      } finally {
        setResettingMfaUserId(null)
      }
    },
    [businessId, membershipsPage, resettingMfaUserId, subscriptionsPage],
  )

  const handleUpgradeToCorporate = useCallback(async () => {
    if (!businessId || !corpPlanId || corpBusy) return
    setCorpBusy(true)
    setCorpError(null)
    setCorpMessage(null)
    try {
      const ids = Object.entries(corpEntitlements)
        .filter(([, v]) => v)
        .map(([k]) => k)
      const result = await upgradePlatformBusinessToCorporate(businessId, {
        corporateBillingPlanId: corpPlanId,
        billingInterval: corpInterval,
        corporateEntitlementSystemProductIds: ids.length > 0 ? ids : [],
      })
      const data = await fetchPlatformBusinessDetail(businessId, {
        membershipsPage,
        membershipsPageSize: PAGE_SIZE,
        subscriptionsPage,
        subscriptionsPageSize: PAGE_SIZE,
      })
      setDetail(data)
      setUpgradeModalOpen(false)
      setCorpMessage(
        `Upgraded to Corporate. New invoice ${result.invoiceAmount} issued.`,
      )
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Upgrade failed.'
      // Upgrade may have committed before a follow-up detail refresh failed.
      if (/already corporate/i.test(message) && businessId) {
        try {
          const data = await fetchPlatformBusinessDetail(businessId, {
            membershipsPage,
            membershipsPageSize: PAGE_SIZE,
            subscriptionsPage,
            subscriptionsPageSize: PAGE_SIZE,
          })
          setDetail(data)
          setUpgradeModalOpen(false)
          setCorpMessage('This business is already Corporate.')
          setCorpError(null)
          return
        } catch {
          /* fall through */
        }
      }
      setCorpError(message)
    } finally {
      setCorpBusy(false)
    }
  }, [
    businessId,
    corpBusy,
    corpEntitlements,
    corpInterval,
    corpPlanId,
    membershipsPage,
    subscriptionsPage,
  ])

  const handleRenameBusiness = useCallback(async () => {
    if (!businessId || !canEditBusiness || nameBusy) return
    const next = nameDraft.trim()
    if (next.length < 2) {
      setNameError('Business name must be at least 2 characters.')
      return
    }
    if (detail && next === detail.name) {
      setEditingName(false)
      setNameError(null)
      return
    }
    setNameBusy(true)
    setNameError(null)
    setNameMessage(null)
    try {
      const updated = await renamePlatformBusiness(businessId, { name: next })
      setDetail((prev) => (prev ? { ...prev, name: updated.name } : prev))
      setEditingName(false)
      setNameMessage('Business name updated.')
    } catch (e) {
      setNameError(e instanceof ApiError ? e.message : 'Could not update business name.')
    } finally {
      setNameBusy(false)
    }
  }, [businessId, canEditBusiness, detail, nameBusy, nameDraft])

  if (!isPlatformOperator(user)) {
    return null
  }

  const status = detail?.operationalStatus ?? 'ACTIVE'
  const isCorporate = isCorporateIndustry(detail?.industry)

  const tabs: [DetailTab, string][] = [
    ['overview', 'Overview'],
    ...(canEditBusiness ? ([['lifecycle', 'Lifecycle']] as [DetailTab, string][]) : []),
    ...(canEditBusiness ? ([['corporate', 'Corporate']] as [DetailTab, string][]) : []),
    ['team', 'Team'],
    ...(canViewMerchantApi ? ([['integrations', 'Integrations']] as [DetailTab, string][]) : []),
  ]

  const visibleTabIds = new Set(tabs.map(([id]) => id))
  const activeTab = visibleTabIds.has(tab) ? tab : 'overview'

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
                <div className="min-w-0 flex-1">
                  {editingName && canEditBusiness ? (
                    <div className="space-y-2">
                      <label className="block">
                        <span className="sr-only">Business name</span>
                        <input
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                          disabled={nameBusy}
                          autoFocus
                          className="w-full max-w-xl rounded-xl border border-slate-200 px-3 py-2 text-xl font-bold text-slate-900 outline-none focus:border-teal-500"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              void handleRenameBusiness()
                            }
                            if (e.key === 'Escape') {
                              setEditingName(false)
                              setNameError(null)
                            }
                          }}
                        />
                      </label>
                      {nameError ? <p className="text-sm text-red-600">{nameError}</p> : null}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={nameBusy}
                          onClick={() => void handleRenameBusiness()}
                          className="rounded-xl bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                        >
                          {nameBusy ? 'Saving…' : 'Save name'}
                        </button>
                        <button
                          type="button"
                          disabled={nameBusy}
                          onClick={() => {
                            setEditingName(false)
                            setNameError(null)
                          }}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-3xl font-bold text-slate-900">{detail.name}</h1>
                      {canEditBusiness ? (
                        <button
                          type="button"
                          onClick={() => {
                            setNameDraft(detail.name)
                            setNameError(null)
                            setNameMessage(null)
                            setEditingName(true)
                          }}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-teal-700"
                          aria-label="Edit business name"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </button>
                      ) : null}
                    </div>
                  )}
                  <p className="text-slate-500">{detail.slug}</p>
                  {nameMessage ? (
                    <p className="mt-1 text-sm font-medium text-teal-800">{nameMessage}</p>
                  ) : null}
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

          <PageCard className="overflow-hidden p-0">
            <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50/80 px-3 pt-3 sm:px-4">
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`rounded-t-lg px-4 py-2.5 text-sm font-medium transition ${
                    activeTab === id
                      ? 'bg-white text-teal-800 shadow-[0_-1px_0_0_white] ring-1 ring-slate-200 ring-b-0'
                      : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-5 sm:p-6">
              {activeTab === 'overview' ? (
                <div className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div>
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
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Subscriptions</h2>
                      {detail.subscriptionsTotal === 0 ? (
                        <p className="mt-4 text-sm text-slate-500">No subscription history.</p>
                      ) : (
                        <>
                          <ul className="mt-4 space-y-3">
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
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-600">
                    <Package className="h-5 w-5 shrink-0 text-slate-400" />
                    Product catalog for this business is managed inside the merchant workspace;
                    platform view shows counts only.
                  </div>
                </div>
              ) : null}

              {activeTab === 'lifecycle' && canEditBusiness ? (
                <div className="max-w-2xl space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Lifecycle</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Block freezes merchant and internal-partner API access (like an expired
                      subscription). Terminate soft-deletes the business; user accounts remain.
                    </p>
                  </div>
                  {detail.statusReason ? (
                    <p className="text-sm text-slate-600">
                      Last reason: <span className="font-medium">{detail.statusReason}</span>
                      {detail.statusChangedAt
                        ? ` · ${formatShortDate(detail.statusChangedAt)}`
                        : null}
                    </p>
                  ) : null}
                  <label className="block">
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
                    <p className="text-sm text-red-600">{lifecycleError}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
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
                </div>
              ) : null}

              {activeTab === 'corporate' && canEditBusiness ? (
                !isCorporate ? (
                  <div className="max-w-2xl space-y-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Upgrade to Corporate</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Convert this Basic / Pro / Business Pro organization to{' '}
                        <span className="font-medium text-slate-800">Corporate</span> industry with
                        custom corporate billing. Subscription moves to the Business Pro catalog
                        (corporate entitlements), pending invoices are voided, and a new invoice is
                        issued from the selected template.
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">Corporate bill template</span>
                        <select
                          value={corpPlanId}
                          onChange={(e) => setCorpPlanId(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 outline-none focus:border-teal-500"
                        >
                          {corpPlans.length === 0 ? (
                            <option value="">
                              Create templates under Corporate → Corporate bill
                            </option>
                          ) : null}
                          {corpPlans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {corporateTemplateOptionLabel(p)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">Billing cycle</span>
                        <select
                          value={corpInterval}
                          onChange={(e) =>
                            setCorpInterval(e.target.value as SubscriptionBillingInterval)
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 outline-none focus:border-teal-500"
                        >
                          <option value="MONTHLY">Monthly</option>
                          <option value="QUARTERLY">Quarterly</option>
                          <option value="HALF_YEARLY">Half-yearly</option>
                          <option value="YEARLY">Yearly</option>
                          <option value="TWO_YEARS">Two years</option>
                          <option value="CONTRACT_INFINITE">Signed contract (perpetual)</option>
                        </select>
                      </label>
                    </div>
                    {corpCatalog.length > 0 ? (
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-slate-700">
                            Entitlements (optional)
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const next: Record<string, boolean> = {}
                                for (const item of corpCatalog) next[item.id] = true
                                setCorpEntitlements(next)
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              onClick={() => setCorpEntitlements({})}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Clear all
                            </button>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Leave all unchecked for default Corporate entitlements. Select one or more
                          products to grant extra access.
                        </p>
                        <div className="mt-2 overflow-hidden rounded-xl border border-slate-100">
                          <label className="flex cursor-pointer items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-600">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                              checked={
                                corpCatalog.length > 0 &&
                                corpCatalog.every((item) => corpEntitlements[item.id])
                              }
                              ref={(el) => {
                                if (!el) return
                                const n = corpCatalog.filter((item) => corpEntitlements[item.id])
                                  .length
                                el.indeterminate = n > 0 && n < corpCatalog.length
                              }}
                              onChange={() => {
                                const allOn =
                                  corpCatalog.length > 0 &&
                                  corpCatalog.every((item) => corpEntitlements[item.id])
                                if (allOn) {
                                  setCorpEntitlements({})
                                  return
                                }
                                const next: Record<string, boolean> = {}
                                for (const item of corpCatalog) next[item.id] = true
                                setCorpEntitlements(next)
                              }}
                            />
                            <span>
                              {
                                corpCatalog.filter((item) => corpEntitlements[item.id]).length
                              }{' '}
                              of {corpCatalog.length} selected
                            </span>
                          </label>
                          <div className="max-h-48 space-y-1.5 overflow-y-auto p-3">
                            {corpCatalog.map((item) => (
                              <label
                                key={item.id}
                                className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 text-sm text-slate-700 hover:bg-slate-50"
                              >
                                <input
                                  type="checkbox"
                                  className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                  checked={Boolean(corpEntitlements[item.id])}
                                  onChange={() =>
                                    setCorpEntitlements((prev) => ({
                                      ...prev,
                                      [item.id]: !prev[item.id],
                                    }))
                                  }
                                />
                                <span>
                                  <span className="font-medium">{item.name}</span>
                                  <span className="block text-xs text-slate-500">
                                    {item.serviceName}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {corpError ? <p className="text-sm text-red-600">{corpError}</p> : null}
                    {corpMessage ? (
                      <p className="text-sm font-medium text-teal-800">{corpMessage}</p>
                    ) : null}
                    <button
                      type="button"
                      disabled={corpBusy || !corpPlanId || corpPlans.length === 0}
                      onClick={() => {
                        setCorpError(null)
                        setUpgradeModalOpen(true)
                      }}
                      className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {corpBusy ? 'Upgrading…' : 'Upgrade to Corporate'}
                    </button>
                  </div>
                ) : (
                  <div className="max-w-2xl space-y-3">
                    <h2 className="text-lg font-semibold text-slate-900">Corporate program</h2>
                    {corpMessage ? (
                      <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800">
                        {corpMessage}
                      </p>
                    ) : null}
                    <p className="text-sm text-slate-600">
                      This organization is Corporate
                      {detail.corporateBillingPlan?.name
                        ? ` · template “${detail.corporateBillingPlan.name}”`
                        : ''}
                      {detail.corporateBillingInterval
                        ? ` · ${detail.corporateBillingInterval.replace(/_/g, ' ').toLowerCase()}`
                        : ''}
                      .
                    </p>
                    <Link
                      to={APP_PATHS.platformCorporateBusinesses}
                      className="inline-flex text-sm font-semibold text-teal-700 underline-offset-2 hover:underline"
                    >
                      Manage corporate billing & entitlements
                    </Link>
                  </div>
                )
              ) : null}

              {activeTab === 'team' ? (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Team memberships</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Reset 2FA if a member loses access to their authenticator app.
                    </p>
                    {mfaMessage ? (
                      <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800">
                        {mfaMessage}
                      </p>
                    ) : null}
                    {mfaError ? (
                      <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                        {mfaError}
                      </p>
                    ) : null}
                  </div>
                  {detail.membershipsTotal === 0 ? (
                    <p className="text-sm text-slate-500">No members.</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left text-sm">
                          <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="py-2 pr-4">User</th>
                              <th className="py-2 pr-4">Role</th>
                              <th className="py-2 pr-4">Access</th>
                              <th className="py-2 pr-4">Owner</th>
                              <th className="py-2 pr-4">2FA</th>
                              <th className="py-2">Joined</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {detail.memberships.map((m) => {
                              const enrolled = Boolean(m.user.totpEnrolled)
                              const canReset =
                                canEditBusiness && enrolled && m.user.id !== user?.id
                              return (
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
                                  <td className="py-3 pr-4">
                                    <div className="flex flex-col gap-1.5">
                                      <span
                                        className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                          enrolled
                                            ? 'bg-teal-50 text-teal-800'
                                            : 'bg-slate-100 text-slate-600'
                                        }`}
                                      >
                                        {enrolled ? 'Enrolled' : 'Off'}
                                      </span>
                                      {canReset ? (
                                        <button
                                          type="button"
                                          disabled={resettingMfaUserId === m.user.id}
                                          onClick={() =>
                                            void handleResetMemberMfa(m.user.id, m.user.email)
                                          }
                                          className="text-left text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-red-700 disabled:opacity-50"
                                        >
                                          {resettingMfaUserId === m.user.id
                                            ? 'Resetting…'
                                            : 'Reset 2FA'}
                                        </button>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="py-3 text-slate-600">
                                    {formatShortDate(m.createdAt)}
                                  </td>
                                </tr>
                              )
                            })}
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
                </div>
              ) : null}

              {activeTab === 'integrations' && canViewMerchantApi && businessId ? (
                <div className="space-y-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                      <Plug className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Merchant API</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Yonna, APS, and optional own Wave Business credentials for this business.
                        Aggregated Wave checkout is provisioned below unless this business uses its
                        own Wave API key.
                      </p>
                    </div>
                  </div>
                  <WaveCheckoutProvisionPanel
                    businessId={businessId}
                    allowMutations={canEditMerchantApi}
                    platformWaveConfigured={waveCredPack?.platformWaveConfigured ?? false}
                    aggregatedMerchantReady={Boolean(
                      waveCredPack?.waveRow?.fieldStatus?.aggregatedMerchant,
                    )}
                    ownAccountActive={Boolean(
                      waveCredPack?.waveRow?.fieldStatus?.ownAccountBearer,
                    )}
                    onProvisioned={() => void loadWaveCredPack()}
                  />
                  <MerchantApiIntegrationPanel
                    businessId={businessId}
                    allowMutations={canEditMerchantApi}
                    embedded
                  />
                </div>
              ) : null}
            </div>
          </PageCard>

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

          <ConfirmModal
            open={upgradeModalOpen}
            title={`Upgrade ${detail.name} to Corporate?`}
            confirmLabel="Upgrade to Corporate"
            cancelLabel="Cancel"
            loading={corpBusy}
            onCancel={() => {
              if (!corpBusy) setUpgradeModalOpen(false)
            }}
            onConfirm={() => void handleUpgradeToCorporate()}
          >
            <p>
              This sets the organization to Corporate industry and Corporate billing. Pending
              invoices will be voided and a new corporate invoice will be issued from the selected
              template.
            </p>
            {corpError ? (
              <p className="mt-3 text-sm font-medium text-red-600">{corpError}</p>
            ) : null}
          </ConfirmModal>
        </>
      )}
    </PageTransition>
  )
}
