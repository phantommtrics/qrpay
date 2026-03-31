import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'

import { PageCard } from '../components/ui/PageCard'
import { PageSectionHeader } from '../components/ui/PageSectionHeader'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import { ApiError } from '../services/subscriptionApi'
import type {
  PlanEntitlementsPayload,
  PlatformSystemProduct,
  PlatformSystemService,
} from '../services/subscriptionApi'
import {
  createPlatformSystemProduct,
  createPlatformSystemService,
  deletePlatformSystemProduct,
  deletePlatformSystemService,
  fetchPlanEntitlements,
  fetchPlatformSystemProducts,
  fetchPlatformSystemServices,
  updatePlanEntitlements,
} from '../services/subscriptionApi'

type TabId = 'services' | 'products' | 'plans'

const PLAN_CODES = ['BASIC', 'PRO', 'BUSINESS_PRO'] as const

export function SystemConfigurationPage() {
  const { user, canAccess } = useAuth()
  const [tab, setTab] = useState<TabId>('services')
  const [services, setServices] = useState<PlatformSystemService[]>([])
  const [products, setProducts] = useState<PlatformSystemProduct[]>([])
  /** Full catalog for plan entitlement matrix (not affected by service filter). */
  const [allCatalogProducts, setAllCatalogProducts] = useState<PlatformSystemProduct[]>([])
  const [planState, setPlanState] = useState<
    Partial<Record<(typeof PLAN_CODES)[number], PlanEntitlementsPayload>>
  >({})
  const [serviceFilter, setServiceFilter] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [newServiceName, setNewServiceName] = useState('')
  const [newServiceDesc, setNewServiceDesc] = useState('')
  const [newProductServiceId, setNewProductServiceId] = useState('')
  const [newProductName, setNewProductName] = useState('')
  const [newProductSlug, setNewProductSlug] = useState('')

  const loadServices = useCallback(async () => {
    const data = await fetchPlatformSystemServices()
    setServices(data)
  }, [])

  const loadProducts = useCallback(async () => {
    const data = await fetchPlatformSystemProducts(serviceFilter || undefined)
    setProducts(data)
  }, [serviceFilter])

  const loadPlans = useCallback(async () => {
    const entries = await Promise.all(
      PLAN_CODES.map(async (code) => {
        const data = await fetchPlanEntitlements(code)
        return [code, data] as const
      }),
    )
    setPlanState(Object.fromEntries(entries))
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await loadServices()
      await loadProducts()
      const full = await fetchPlatformSystemProducts()
      setAllCatalogProducts(full)
      await loadPlans()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load configuration.')
    } finally {
      setLoading(false)
    }
  }, [loadPlans, loadProducts, loadServices])

  useEffect(() => {
    if (user && (user.isPlatformOwner || (user.isPlatformAdmin && canAccess('platform.system.view')))) {
      void refresh()
    }
  }, [user, user?.isPlatformOwner, user?.isPlatformAdmin, canAccess, refresh])

  useEffect(() => {
    if (services.length === 0) {
      return
    }
    if (!services.some((s) => s.id === newProductServiceId)) {
      setNewProductServiceId(services[0].id)
    }
  }, [services, newProductServiceId])

  useEffect(() => {
    const allowed =
      user &&
      (user.isPlatformOwner || (user.isPlatformAdmin && canAccess('platform.system.view')))
    if (!allowed || tab !== 'products') {
      return
    }
    void loadProducts().catch(() => {
      setError('Failed to load products.')
    })
  }, [user, user?.isPlatformOwner, user?.isPlatformAdmin, canAccess, tab, loadProducts])

  const productsByService = useMemo(() => {
    const map = new Map<string, PlatformSystemProduct[]>()
    for (const p of allCatalogProducts) {
      const list = map.get(p.serviceId) ?? []
      list.push(p)
      map.set(p.serviceId, list)
    }
    return map
  }, [allCatalogProducts])

  /** Products tab list: same order as services, then product name + key under each heading. */
  const listingProductsByService = useMemo(() => {
    const byId = new Map<string, PlatformSystemProduct[]>()
    for (const p of products) {
      const list = byId.get(p.serviceId) ?? []
      list.push(p)
      byId.set(p.serviceId, list)
    }
    for (const list of byId.values()) {
      list.sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name) ||
          a.slug.localeCompare(b.slug),
      )
    }

    const groups: Array<{
      serviceId: string
      serviceName: string
      products: PlatformSystemProduct[]
    }> = []
    const used = new Set<string>()
    for (const s of services) {
      const prods = byId.get(s.id)
      if (prods?.length) {
        groups.push({ serviceId: s.id, serviceName: s.name, products: prods })
        used.add(s.id)
      }
    }
    for (const [serviceId, prods] of byId) {
      if (!used.has(serviceId) && prods.length) {
        groups.push({
          serviceId,
          serviceName: prods[0]?.serviceName ?? 'Unknown service',
          products: prods,
        })
      }
    }
    return groups
  }, [products, services])

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    try {
      await createPlatformSystemService({
        name: newServiceName,
        description: newServiceDesc || undefined,
      })
      setNewServiceName('')
      setNewServiceDesc('')
      setMessage('Service created.')
      await loadServices()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create service.')
    }
  }

  const handleDeleteService = async (id: string) => {
    if (!window.confirm('Delete this service and all of its system products?')) {
      return
    }
    setError(null)
    try {
      await deletePlatformSystemService(id)
      setMessage('Service deleted.')
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete.')
    }
  }

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    try {
      await createPlatformSystemProduct({
        serviceId: newProductServiceId,
        name: newProductName,
        slug: newProductSlug,
      })
      setNewProductName('')
      setNewProductSlug('')
      setMessage(
        'CRUD entitlement set updated: ensures .view, .edit, .delete, .export, and .create exist for the base slug (new rows only).',
      )
      await loadProducts()
      const full = await fetchPlatformSystemProducts()
      setAllCatalogProducts(full)
      await loadPlans()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create product.')
    }
  }

  const handleDeleteProduct = async (id: string) => {
    if (!window.confirm('Delete this system product? Plan links will be removed.')) {
      return
    }
    setError(null)
    try {
      await deletePlatformSystemProduct(id)
      setMessage('Product deleted.')
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete.')
    }
  }

  const togglePlanProduct = (planCode: (typeof PLAN_CODES)[number], productId: string) => {
    setPlanState((prev) => {
      const current = prev[planCode]
      if (!current) {
        return prev
      }
      const set = new Set(current.systemProductIds)
      if (set.has(productId)) {
        set.delete(productId)
      } else {
        set.add(productId)
      }
      return {
        ...prev,
        [planCode]: { ...current, systemProductIds: Array.from(set) },
      }
    })
  }

  const savePlan = async (planCode: (typeof PLAN_CODES)[number]) => {
    const current = planState[planCode]
    if (!current) {
      return
    }
    setError(null)
    setMessage(null)
    try {
      const updated = await updatePlanEntitlements(planCode, current.systemProductIds)
      setPlanState((prev) => ({ ...prev, [planCode]: updated }))
      setMessage(`Saved ${planCode} plan entitlements.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save plan.')
    }
  }

  const canViewSystemConfig =
    user?.isPlatformOwner ||
    (user?.isPlatformAdmin && canAccess('platform.system.view'))

  if (!canViewSystemConfig) {
    return null
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <PageSectionHeader
        title="System configuration"
        subtitle="Manage platform services, system products, and which entitlements each subscription plan includes."
      />

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {(
          [
            ['services', 'Services'],
            ['products', 'System products'],
            ['plans', 'Plan entitlements'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : tab === 'services' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <PageCard className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-slate-800">Add service</h3>
            <form className="space-y-3" onSubmit={handleCreateService}>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={newServiceName}
                  onChange={(ev) => setNewServiceName(ev.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={newServiceDesc}
                  onChange={(ev) => setNewServiceDesc(ev.target.value)}
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
              >
                Create service
              </button>
            </form>
          </PageCard>
          <PageCard className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-slate-800">Services</h3>
            <ul className="space-y-2">
              {services.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2"
                >
                  <div>
                    <p className="font-medium text-slate-800">{s.name}</p>
                    {s.description ? (
                      <p className="text-xs text-slate-500">{s.description}</p>
                    ) : null}
                    <p className="text-xs text-slate-400">{s.productCount} products</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete service"
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => void handleDeleteService(s.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </PageCard>
        </div>
      ) : tab === 'products' ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Filter by service</label>
              <select
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={serviceFilter}
                onChange={(ev) => setServiceFilter(ev.target.value)}
              >
                <option value="">All services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <PageCard className="p-6">
              <h3 className="mb-4 text-lg font-semibold text-slate-800">Add system product (CRUD set)</h3>
              <form className="space-y-3" onSubmit={handleCreateProduct}>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Service</label>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={newProductServiceId}
                    onChange={(ev) => setNewProductServiceId(ev.target.value)}
                    required
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Module name</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="e.g. Inventory"
                    value={newProductName}
                    onChange={(ev) => setNewProductName(ev.target.value)}
                    required
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Used for display names (View …, Edit …, etc.).
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Base slug</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                    placeholder="e.g. inventory"
                    value={newProductSlug}
                    onChange={(ev) => setNewProductSlug(ev.target.value)}
                    required
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Creates entitlement keys{' '}
                    <span className="font-mono">
                      {'{base}'}.view, {'{base}'}.edit, {'{base}'}.delete, {'{base}'}.export,{' '}
                      {'{base}'}.create
                    </span>
                    . You may enter <span className="font-mono">inventory</span> or{' '}
                    <span className="font-mono">inventory.view</span>—the base is normalized to{' '}
                    <span className="font-mono">inventory</span>. Existing slugs are left unchanged;
                    only missing ones are added.
                  </p>
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
                >
                  Save
                </button>
              </form>
            </PageCard>
            <PageCard className="p-6">
              <h3 className="mb-4 text-lg font-semibold text-slate-800">System products</h3>
              <div className="max-h-[480px] space-y-6 overflow-y-auto pr-1">
                {listingProductsByService.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    {serviceFilter ? 'No products for this service.' : 'No system products yet.'}
                  </p>
                ) : (
                  listingProductsByService.map((group) => (
                    <section key={group.serviceId} className="min-w-0">
                      <h4 className="border-b border-slate-200 pb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
                        {group.serviceName}
                      </h4>
                      <ul className="mt-2 space-y-1.5">
                        {group.products.map((p) => (
                          <li
                            key={p.id}
                            className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-slate-800">{p.name}</p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                <span className="text-slate-400">Key</span>{' '}
                                <span className="font-mono text-slate-700">{p.slug}</span>
                              </p>
                            </div>
                            <button
                              type="button"
                              aria-label={`Delete ${p.name}`}
                              className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              onClick={() => void handleDeleteProduct(p.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))
                )}
              </div>
            </PageCard>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {PLAN_CODES.map((planCode) => {
            const payload = planState[planCode]
            if (!payload) {
              return null
            }
            return (
              <PageCard key={planCode} className="p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">{payload.planName}</h3>
                    <p className="text-xs text-slate-500">{payload.planCode}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
                    onClick={() => void savePlan(planCode)}
                  >
                    Save plan
                  </button>
                </div>
                <div className="space-y-4">
                  {services.map((svc) => {
                    const svcProducts = productsByService.get(svc.id) ?? []
                    if (svcProducts.length === 0) {
                      return null
                    }
                    return (
                      <div key={svc.id}>
                        <p className="mb-2 text-sm font-medium text-slate-700">{svc.name}</p>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {svcProducts.map((p) => (
                            <label
                              key={p.id}
                              className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
                            >
                              <input
                                type="checkbox"
                                checked={payload.systemProductIds.includes(p.id)}
                                onChange={() => togglePlanProduct(planCode, p.id)}
                              />
                              <span>
                                <span className="font-medium text-slate-800">{p.name}</span>
                                <span className="ml-2 font-mono text-xs text-slate-400">{p.slug}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </PageCard>
            )
          })}
        </div>
      )}
    </PageTransition>
  )
}
