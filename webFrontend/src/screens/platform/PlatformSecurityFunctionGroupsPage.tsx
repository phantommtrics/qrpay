import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderTree, Plus, Save, Trash2 } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageSectionHeader } from '../../components/ui/PageSectionHeader'
import { PageTransition } from '../../components/ui/PageTransition'
import { TablePagination } from '../../components/ui/TablePagination'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  createPlatformFunctionGroup,
  deletePlatformFunctionGroup,
  fetchPlatformFunctionGroups,
  fetchPlatformRoleTemplateSummaries,
  updatePlatformFunctionGroup,
  type PlatformFunctionGroupRow,
} from '../../services/subscriptionApi'

const FG_MODULE = 'platform.security_function_groups'
const PAGE_SIZE = 10

export function PlatformSecurityFunctionGroupsPage() {
  const { user } = useAuth()
  const canCreate = Boolean(user?.isPlatformOwner || user?.platformPermissions?.[FG_MODULE]?.create)
  const canEdit = Boolean(user?.isPlatformOwner || user?.platformPermissions?.[FG_MODULE]?.edit)
  const canDelete = Boolean(user?.isPlatformOwner || user?.platformPermissions?.[FG_MODULE]?.delete)

  const [groups, setGroups] = useState<PlatformFunctionGroupRow[]>([])
  const [groupsTotal, setGroupsTotal] = useState(0)
  const [listPage, setListPage] = useState(1)
  const [summaries, setSummaries] = useState<{ id: string; name: string }[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pendingSelectAfterLoadRef = useRef<string | null>(null)

  const selected = groups.find((g) => g.id === selectedId) ?? null
  const [checkedTemplates, setCheckedTemplates] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [gPayload, s] = await Promise.all([
        fetchPlatformFunctionGroups({ page: listPage, pageSize: PAGE_SIZE }),
        fetchPlatformRoleTemplateSummaries(),
      ])
      const totalPages = Math.max(1, Math.ceil(gPayload.total / gPayload.pageSize))
      if (listPage > totalPages && gPayload.total > 0) {
        setListPage(totalPages)
        return
      }
      setGroups(gPayload.data)
      setGroupsTotal(gPayload.total)
      setSummaries(s)
      setSelectedId((cur) => {
        const pending = pendingSelectAfterLoadRef.current
        if (pending && gPayload.data.some((x) => x.id === pending)) {
          pendingSelectAfterLoadRef.current = null
          return pending
        }
        if (pending) {
          pendingSelectAfterLoadRef.current = null
        }
        if (cur && gPayload.data.some((x) => x.id === cur)) return cur
        return gPayload.data[0]?.id ?? null
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [listPage])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const next: Record<string, boolean> = {}
    for (const t of summaries) {
      next[t.id] = Boolean(selected?.roleTemplates.some((rt) => rt.id === t.id))
    }
    setCheckedTemplates(next)
  }, [selected, summaries])

  async function handleCreate() {
    const name = newName.trim()
    if (!name || !canCreate) return
    setCreating(true)
    setError(null)
    try {
      const row = await createPlatformFunctionGroup({ name })
      setNewName('')
      pendingSelectAfterLoadRef.current = row.id
      setListPage(1)
      setMessage('Function group created. Attach role templates on the right, then save.')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Create failed.')
    } finally {
      setCreating(false)
    }
  }

  async function saveAssignments() {
    if (!selectedId || !canEdit) return
    const roleTemplateIds = Object.entries(checkedTemplates)
      .filter(([, on]) => on)
      .map(([id]) => id)
    setSaving(true)
    setError(null)
    try {
      await updatePlatformFunctionGroup(selectedId, { roleTemplateIds })
      setMessage('Templates linked to this group.')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Update failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!canDelete || !window.confirm('Delete this function group?')) return
    try {
      await deletePlatformFunctionGroup(id)
      if (selectedId === id) setSelectedId(null)
      await load()
      setMessage('Group removed.')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed.')
    }
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageSectionHeader
          title="Function groups"
          subtitle="Groups bundle role templates. A platform user’s effective permissions are the union of every template in their assigned group."
        />

        {!canCreate && user?.isPlatformAdmin ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            You can edit assignments here, but only a platform owner (or an admin with create access)
            can add new groups.
          </div>
        ) : null}

        {summaries.length === 0 && !loading ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-950">
            <p className="font-semibold text-sky-900">No role templates exist yet</p>
            <p className="mt-1 text-sky-800">
              Create at least one template on the{' '}
              <Link
                to={APP_PATHS.platformSecurityRoles}
                className="font-semibold text-teal-700 underline decoration-teal-600/50 underline-offset-2 hover:text-teal-800"
              >
                Role
              </Link>{' '}
              screen before you can assign anything to a function group.
            </p>
          </div>
        ) : null}

        {canCreate ? (
          <PageCard className="border-teal-200/80 bg-gradient-to-br from-teal-50/90 to-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2 text-teal-900">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
                    <Plus className="h-5 w-5" strokeWidth={2.5} />
                  </span>
                  <div>
                    <h4 className="text-base font-semibold text-slate-900">Create a function group</h4>
                    <p className="text-sm text-slate-600">
                      Example: “Finance team”. Then tick which role templates apply.
                    </p>
                  </div>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Group name
                  </span>
                  <input
                    className="w-full max-w-xl rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none ring-teal-500/30 transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4"
                    placeholder="e.g. Support & billing"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleCreate()
                      }
                    }}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={creating || !newName.trim()}
                onClick={() => void handleCreate()}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create group'}
              </button>
            </div>
          </PageCard>
        ) : null}

        <PageCard className="overflow-hidden p-0">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading…</div>
          ) : (
            <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,17.5rem)_minmax(0,1fr)] lg:divide-x lg:divide-slate-100">
              <aside className="flex min-h-0 min-w-0 flex-col border-b border-slate-100 bg-slate-50/50 lg:border-b-0">
                <div className="shrink-0 px-3 pb-2 pt-3 sm:px-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Groups ({groupsTotal})
                  </p>
                </div>
                <div className="min-h-0 min-w-0 max-h-[min(42vh,18rem)] flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 sm:px-4 md:max-h-[min(48vh,22rem)] lg:max-h-none [scrollbar-gutter:stable]">
                  {groups.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
                      <FolderTree className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                      No groups yet.
                      {canCreate ? (
                        <p className="mt-2 text-slate-500">Use the section above to create one.</p>
                      ) : null}
                    </div>
                  ) : (
                    <ul className="space-y-1.5 pb-1">
                      {groups.map((g) => {
                        const active = g.id === selectedId
                        return (
                          <li key={g.id}>
                            <div
                              className={`flex min-w-0 items-stretch gap-1 overflow-hidden rounded-xl border-2 transition ${
                                active
                                  ? 'border-teal-500 bg-white shadow-md ring-1 ring-teal-500/20'
                                  : 'border-transparent bg-white/80 hover:border-slate-200 hover:bg-white'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedId(g.id)}
                                className="min-w-0 flex-1 px-3 py-3 text-left"
                              >
                                <span className="block truncate font-semibold text-slate-900">{g.name}</span>
                                <span className="mt-0.5 block truncate text-xs text-slate-500">
                                  {g.userCount} user{g.userCount === 1 ? '' : 's'} ·{' '}
                                  {g.roleTemplates.length} template
                                  {g.roleTemplates.length === 1 ? '' : 's'}
                                </span>
                              </button>
                              {canDelete ? (
                                <button
                                  type="button"
                                  aria-label={
                                    g.userCount > 0
                                      ? `Cannot delete: ${g.userCount} user(s) still assigned`
                                      : `Delete ${g.name}`
                                  }
                                  title={
                                    g.userCount > 0
                                      ? 'Move or reassign all users before deleting this group (Security → Move users).'
                                      : undefined
                                  }
                                  disabled={g.userCount > 0}
                                  className="flex w-11 shrink-0 items-center justify-center border-l border-slate-100 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                  onClick={() => void handleDelete(g.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
                {groupsTotal > 0 ? (
                  <div className="shrink-0 border-t border-slate-200 bg-slate-50/80">
                    <TablePagination
                      compact
                      page={listPage}
                      pageSize={PAGE_SIZE}
                      total={groupsTotal}
                      onPageChange={setListPage}
                      className="border-t-0 bg-transparent"
                    />
                  </div>
                ) : null}
              </aside>

              <div className="min-w-0 p-4 sm:p-6">
                {selected ? (
                  <>
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="text-lg font-semibold text-slate-900">{selected.name}</h4>
                        <p className="text-sm text-slate-600">
                          Checked templates are merged: users in this group get every permission from
                          every selected template.
                        </p>
                      </div>
                      {canEdit && summaries.length > 0 ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void saveAssignments()}
                          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-500 disabled:opacity-50"
                        >
                          <Save className="h-4 w-4" />
                          {saving ? 'Saving…' : 'Save template links'}
                        </button>
                      ) : null}
                    </div>

                    {summaries.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
                        Go to{' '}
                        <Link
                          to={APP_PATHS.platformSecurityRoles}
                          className="font-semibold text-teal-700 underline"
                        >
                          Role
                        </Link>{' '}
                        and create templates first.
                      </div>
                    ) : (
                      <ul className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        {summaries.map((t) => (
                          <li
                            key={t.id}
                            className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-3 transition hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              id={`tpl-${t.id}`}
                              checked={Boolean(checkedTemplates[t.id])}
                              disabled={!canEdit}
                              onChange={() =>
                                setCheckedTemplates((c) => ({ ...c, [t.id]: !c[t.id] }))
                              }
                              className="h-5 w-5 cursor-pointer rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                            />
                            <label htmlFor={`tpl-${t.id}`} className="flex-1 cursor-pointer font-medium text-slate-800">
                              {t.name}
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                    <FolderTree className="mb-3 h-10 w-10 text-slate-300" />
                    <p className="max-w-sm text-base font-medium text-slate-800">
                      {groups.length === 0 ? 'Create a group above' : 'Pick a group from the list'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </PageCard>

        {message ? (
          <p className="rounded-lg bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800">{message}</p>
        ) : null}
        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-800">{error}</p>
        ) : null}
      </div>
    </PageTransition>
  )
}
