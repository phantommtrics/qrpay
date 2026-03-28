import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageSectionHeader } from '../components/ui/PageSectionHeader'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import type { LoginAccount } from '../types'
import { ApiError } from '../services/subscriptionApi'
import {
  fetchBusinessPlanCatalog,
  fetchBusinessUsers,
  fetchUserPlanAccess,
  updateUserPlanAccess,
  type PlanCatalogServiceRow,
} from '../services/subscriptionApi'

export function BusinessConfigurationPage() {
  const { user, currentOrganization, refreshBusinessEntitlements } = useAuth()
  const businessId = currentOrganization?.id ?? null

  const [catalog, setCatalog] = useState<PlanCatalogServiceRow[]>([])
  const [members, setMembers] = useState<LoginAccount[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const allProductIds = useMemo(() => {
    const ids: string[] = []
    for (const s of catalog) {
      for (const p of s.products) {
        ids.push(p.id)
      }
    }
    return ids
  }, [catalog])

  const loadCatalogAndMembers = useCallback(async () => {
    if (!businessId) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [svc, users] = await Promise.all([
        fetchBusinessPlanCatalog(businessId),
        fetchBusinessUsers(businessId),
      ])
      setCatalog(svc)
      setMembers(users)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load data.')
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    void loadCatalogAndMembers()
  }, [loadCatalogAndMembers])

  const staffMembers = useMemo(
    () =>
      members.filter(
        (m) => m.isOwner !== true && m.membershipStatus !== 'TERMINATED',
      ),
    [members],
  )

  useEffect(() => {
    if (!staffMembers.length) {
      setSelectedUserId('')
      return
    }
    if (!staffMembers.some((m) => m.id === selectedUserId)) {
      setSelectedUserId(staffMembers[0].id)
    }
  }, [staffMembers, selectedUserId])

  useEffect(() => {
    if (!businessId || !selectedUserId || allProductIds.length === 0) {
      return
    }
    let cancelled = false
    fetchUserPlanAccess(businessId, selectedUserId)
      .then((data) => {
        if (cancelled) {
          return
        }
        setSelectedIds(new Set(data.systemProductIds))
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load user access.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [businessId, selectedUserId, allProductIds])

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAllPlanProducts = () => {
    setSelectedIds(new Set(allProductIds))
  }

  const handleSave = async () => {
    if (!businessId || !selectedUserId) {
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await updateUserPlanAccess(
        businessId,
        selectedUserId,
        Array.from(selectedIds),
      )
      if (selectedUserId === user?.id) {
        await refreshBusinessEntitlements(businessId)
      }
      setMessage('Access settings saved.')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (!user) {
    return null
  }

  if (!user.isPlatformOwner && !currentOrganization?.isOwner) {
    return <Navigate to={APP_PATHS.dashboard} replace />
  }

  if (!businessId) {
    return (
      <PageTransition>
        <PageCard className="p-6">
          <p className="text-slate-600">Select a business to configure access.</p>
        </PageCard>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <PageSectionHeader
        title="Configuration"
        subtitle="Staff start with no plan features until you assign products here. Select all and save to grant the full plan."
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

      <PageCard className="space-y-6 p-6">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : staffMembers.length === 0 ? (
          <p className="text-sm text-slate-600">
            Add staff from the Staff page to assign plan access. The business owner always has full
            access and is not listed here.
          </p>
        ) : (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Team member</label>
              <select
                className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                {staffMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAllPlanProducts}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Select all plan products
              </button>
            </div>

            <div className="space-y-6">
              {catalog.map((svc) => (
                <div key={svc.id}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                    {svc.name}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {svc.products.map((p) => (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleProduct(p.id)}
                          className="mt-1"
                        />
                        <span>
                          <span className="font-medium text-slate-800">{p.name}</span>
                          <span className="ml-2 font-mono text-xs text-slate-400">{p.slug}</span>
                          {p.description ? (
                            <span className="mt-1 block text-xs text-slate-500">{p.description}</span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={saving || !selectedUserId}
                onClick={() => void handleSave()}
                className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save access'}
              </button>
            </div>
          </>
        )}
      </PageCard>
    </PageTransition>
  )
}
