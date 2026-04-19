import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Fuel, Trash2 } from 'lucide-react'

import { FlashNotice } from '../components/ui/FlashNotice'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  ApiError,
  createBusinessStation,
  createBusinessStationPump,
  deleteBusinessStation,
  deleteBusinessStationPump,
  fetchBusinessStations,
  updateBusinessStation,
  updateBusinessStationPump,
  type BusinessStationRow,
} from '../services/subscriptionApi'
import { isPetrolStationIndustry } from '../utils/businessIndustry'

export function PetrolStationsPage() {
  const { currentOrganization, canAccess, user } = useAuth()
  const businessId = currentOrganization?.id
  const allowed = Boolean(currentOrganization && isPetrolStationIndustry(currentOrganization.industry))

  const [stations, setStations] = useState<BusinessStationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const [newStationName, setNewStationName] = useState('')
  const [newStationCode, setNewStationCode] = useState('')
  const [pumpLabels, setPumpLabels] = useState<Record<string, string>>({})

  const canCreate = canAccess('products.create')
  const canEdit = canAccess('products.edit')
  const canDelete = canAccess('products.delete')

  const load = useCallback(async () => {
    if (!businessId || !allowed) {
      setStations([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchBusinessStations(businessId)
      setStations(rows)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load stations.')
    } finally {
      setLoading(false)
    }
  }, [businessId, allowed])

  useEffect(() => {
    void load()
  }, [load])

  const showGate =
    Boolean(currentOrganization) && !allowed && !user?.isPlatformOwner && !user?.isPlatformAdmin

  return (
    <PageTransition className="mx-auto max-w-3xl px-4 py-6">
      <FlashNotice message={flash} onDismiss={() => setFlash(null)} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stations &amp; pumps</h1>
          <p className="mt-1 text-sm text-slate-600">
            One company, many branches. Prices stay on Products; payments stay on your merchant
            account. Add each site, then add pump labels used at checkout.
          </p>
        </div>
        <Fuel className="hidden h-10 w-10 shrink-0 text-teal-600 sm:block" aria-hidden />
      </div>

      {showGate ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Stations are only available when your business industry is Petrol station.
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading && allowed ? <p className="mt-6 text-sm text-slate-500">Loading…</p> : null}

      {!loading && allowed ? (
        <>
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Add a station</h2>
            <form
              className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
              onSubmit={async (e: FormEvent) => {
                e.preventDefault()
                if (!businessId || !canCreate || !newStationName.trim()) return
                try {
                  await createBusinessStation(businessId, {
                    name: newStationName.trim(),
                    code: newStationCode.trim() || null,
                  })
                  setNewStationName('')
                  setNewStationCode('')
                  setFlash('Station created.')
                  void load()
                } catch (err) {
                  setFlash(err instanceof ApiError ? err.message : 'Could not create station.')
                }
              }}
            >
              <label className="block min-w-[200px] flex-1">
                <span className="mb-1 block text-xs font-medium text-slate-600">Station name</span>
                <input
                  value={newStationName}
                  onChange={(ev) => setNewStationName(ev.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="e.g. Banjul Highway"
                  disabled={!canCreate}
                />
              </label>
              <label className="block w-full min-w-[120px] sm:w-40">
                <span className="mb-1 block text-xs font-medium text-slate-600">Code (optional)</span>
                <input
                  value={newStationCode}
                  onChange={(ev) => setNewStationCode(ev.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="e.g. BJL-01"
                  disabled={!canCreate}
                />
              </label>
              <button
                type="submit"
                disabled={!canCreate || !newStationName.trim()}
                className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Add station
              </button>
            </form>
          </section>

          <section className="mt-8 space-y-6">
            <h2 className="text-sm font-semibold text-slate-900">Your stations</h2>
            {stations.length === 0 ? (
              <p className="text-sm text-slate-500">
                No stations yet. Add one above, then add pumps for each site. Cashiers pick station and
                pump on the{' '}
                <Link to={APP_PATHS.pos} className="font-medium text-teal-600 hover:underline">
                  POS
                </Link>
                .
              </p>
            ) : (
              stations.map((st) => (
                <div
                  key={st.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{st.name}</p>
                      {st.code ? (
                        <p className="text-xs text-slate-500">
                          Code: <span className="font-mono">{st.code}</span>
                        </p>
                      ) : null}
                      {st.address ? <p className="mt-1 text-sm text-slate-600">{st.address}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={async () => {
                          if (!businessId) return
                          try {
                            await updateBusinessStation(businessId, st.id, {
                              isActive: !st.isActive,
                            })
                            setFlash(st.isActive ? 'Station deactivated.' : 'Station activated.')
                            void load()
                          } catch (err) {
                            setFlash(
                              err instanceof ApiError ? err.message : 'Could not update station.',
                            )
                          }
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {st.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        disabled={!canDelete}
                        onClick={async () => {
                          if (!businessId || !window.confirm('Delete this station? Only if it has no orders.'))
                            return
                          try {
                            await deleteBusinessStation(businessId, st.id)
                            setFlash('Station removed.')
                            void load()
                          } catch (err) {
                            setFlash(
                              err instanceof ApiError ? err.message : 'Could not delete station.',
                            )
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Pumps / dispensers
                    </p>
                    <ul className="mt-2 space-y-2">
                      {st.pumps.map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                        >
                          <span className="font-medium text-slate-800">{p.label}</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={async () => {
                                if (!businessId) return
                                try {
                                  await updateBusinessStationPump(businessId, st.id, p.id, {
                                    isActive: !p.isActive,
                                  })
                                  void load()
                                } catch (err) {
                                  setFlash(
                                    err instanceof ApiError ? err.message : 'Could not update pump.',
                                  )
                                }
                              }}
                              className="text-xs font-medium text-slate-600 hover:underline disabled:opacity-50"
                            >
                              {p.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              disabled={!canDelete}
                              onClick={async () => {
                                if (!businessId || !window.confirm('Remove this pump?')) return
                                try {
                                  await deleteBusinessStationPump(businessId, st.id, p.id)
                                  void load()
                                } catch (err) {
                                  setFlash(
                                    err instanceof ApiError ? err.message : 'Could not remove pump.',
                                  )
                                }
                              }}
                              className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <form
                      className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
                      onSubmit={async (e: FormEvent) => {
                        e.preventDefault()
                        if (!businessId || !canCreate) return
                        const raw = pumpLabels[st.id]?.trim()
                        if (!raw) return
                        try {
                          await createBusinessStationPump(businessId, st.id, { label: raw })
                          setPumpLabels((prev) => ({ ...prev, [st.id]: '' }))
                          void load()
                        } catch (err) {
                          setFlash(err instanceof ApiError ? err.message : 'Could not add pump.')
                        }
                      }}
                    >
                      <label className="block flex-1">
                        <span className="mb-1 block text-xs text-slate-600">New pump label</span>
                        <input
                          value={pumpLabels[st.id] ?? ''}
                          onChange={(ev) =>
                            setPumpLabels((prev) => ({ ...prev, [st.id]: ev.target.value }))
                          }
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          placeholder="e.g. Pump 1"
                          disabled={!canCreate}
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={!canCreate || !(pumpLabels[st.id]?.trim())}
                        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        Add pump
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      ) : null}
    </PageTransition>
  )
}
