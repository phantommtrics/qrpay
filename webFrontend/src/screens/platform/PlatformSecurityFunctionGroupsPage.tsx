import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderTree, Plus, Save, Trash2 } from 'lucide-react'

import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { PageCard } from '../../components/ui/PageCard'
import { PageSectionHeader } from '../../components/ui/PageSectionHeader'
import { PageTransition } from '../../components/ui/PageTransition'
import { SearchableSelect } from '../../components/ui/SearchableSelect'
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
  const [newRoleTemplateId, setNewRoleTemplateId] = useState('')
  const [editRoleTemplateId, setEditRoleTemplateId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const pendingSelectAfterLoadRef = useRef<string | null>(null)

  const selected = groups.find((g) => g.id === selectedId) ?? null

  const roleOptions = useMemo(
    () => summaries.map((t) => ({ value: t.id, label: t.name })),
    [summaries],
  )

  const mappingDirty = Boolean(
    selected && editRoleTemplateId !== (selected.roleTemplates[0]?.id ?? ''),
  )

  const load = useCallback(async (pageOverride?: number) => {
    setLoading(true)
    setError(null)
    try {
      let page = pageOverride !== undefined ? pageOverride : listPage
      const [gPayload, s] = await Promise.all([
        fetchPlatformFunctionGroups({ page, pageSize: PAGE_SIZE }),
        fetchPlatformRoleTemplateSummaries(),
      ])
      const totalPages = Math.max(1, Math.ceil(gPayload.total / gPayload.pageSize))
      if (page > totalPages && gPayload.total > 0) {
        page = totalPages
        setListPage(page)
        const retry = await fetchPlatformFunctionGroups({ page, pageSize: PAGE_SIZE })
        setGroups(retry.data)
        setGroupsTotal(retry.total)
        setSummaries(s)
        setSelectedId((cur) => {
          const pending = pendingSelectAfterLoadRef.current
          const data = retry.data
          if (pending && data.some((x) => x.id === pending)) {
            pendingSelectAfterLoadRef.current = null
            return pending
          }
          if (pending) {
            pendingSelectAfterLoadRef.current = null
          }
          if (cur && data.some((x) => x.id === cur)) return cur
          return data[0]?.id ?? null
        })
        return
      }
      if (pageOverride !== undefined) {
        setListPage(page)
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
    if (!selected) {
      setEditRoleTemplateId('')
      return
    }
    setEditRoleTemplateId(selected.roleTemplates[0]?.id ?? '')
  }, [selected])

  useEffect(() => {
    if (newRoleTemplateId || summaries.length === 0) return
    setNewRoleTemplateId(summaries[0]?.id ?? '')
  }, [summaries, newRoleTemplateId])

  async function handleCreate() {
    const name = newName.trim()
    if (!name || !newRoleTemplateId || !canCreate) return
    setCreating(true)
    setError(null)
    try {
      const row = await createPlatformFunctionGroup({
        name,
        roleTemplateIds: [newRoleTemplateId],
      })
      setNewName('')
      pendingSelectAfterLoadRef.current = row.id
      await load(1)
      setMessage(
        'Function group created. Staff in this group receive every permission defined on that role template.',
      )
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Create failed.')
    } finally {
      setCreating(false)
    }
  }

  async function saveMapping() {
    if (!selectedId || !canEdit || !mappingDirty) return
    setSaving(true)
    setError(null)
    try {
      await updatePlatformFunctionGroup(selectedId, {
        roleTemplateIds: [editRoleTemplateId],
      })
      setMessage('Role template updated.')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Update failed.')
    } finally {
      setSaving(false)
    }
  }

  const deleteTargetName =
    deleteTargetId != null ? groups.find((g) => g.id === deleteTargetId)?.name : undefined

  async function confirmDeleteGroup() {
    if (!deleteTargetId || !canDelete) return
    setDeleting(true)
    setError(null)
    try {
      const id = deleteTargetId
      await deletePlatformFunctionGroup(id)
      if (selectedId === id) setSelectedId(null)
      await load()
      setMessage('Group removed.')
      setDeleteTargetId(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed.')
    } finally {
      setDeleting(false)
    }
  }

  const prerequisitesReady = summaries.length > 0
  const canSubmitCreate =
    canCreate && Boolean(newName.trim() && newRoleTemplateId && prerequisitesReady)

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageSectionHeader
          title="Function groups"
          subtitle="Each group has a name and maps to one role template. Platform staff in that group get the full permission matrix from that template."
        />

        {!canCreate && user?.isPlatformAdmin ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            You can edit mappings here, but only a platform owner (or an admin with create access) can add
            new groups.
          </div>
        ) : null}

        {!prerequisitesReady && !loading ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-950">
            <p className="font-semibold text-sky-900">Create a role template first</p>
            <p className="mt-1 text-sky-800">
              Add at least one template on the{' '}
              <Link
                to={APP_PATHS.platformSecurityRoles}
                className="font-semibold text-teal-700 underline decoration-teal-600/50 underline-offset-2 hover:text-teal-800"
              >
                Role templates
              </Link>{' '}
              screen and set its permissions. Groups map to a single template.
            </p>
          </div>
        ) : null}

        {canCreate ? (
          <PageCard className="border-teal-200/80 bg-gradient-to-br from-teal-50/90 to-white p-6 shadow-sm">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-teal-900">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                </span>
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Create a function group</h4>
                  <p className="text-sm text-slate-600">Enter a name and pick which role template applies to this group.</p>
                </div>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:items-end">
                <label className="min-w-0">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Group name
                  </span>
                  <input
                    className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none ring-teal-500/30 transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4"
                    placeholder="e.g. Billing admins"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </label>
                <div className="min-w-0">
                  <label htmlFor="fg-new-role" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Role template
                  </label>
                  <SearchableSelect
                    id="fg-new-role"
                    value={newRoleTemplateId}
                    onChange={setNewRoleTemplateId}
                    options={roleOptions}
                    placeholder={summaries.length === 0 ? 'No roles yet' : 'Search or choose…'}
                    disabled={summaries.length === 0}
                    emptyMessage="No role templates"
                    ariaLabel="Role template for new group"
                    className="min-w-0"
                  />
                </div>
              </div>
              <div className="flex justify-stretch pt-1 sm:justify-end">
                <button
                  type="button"
                  disabled={creating || !canSubmitCreate}
                  onClick={() => void handleCreate()}
                  className="inline-flex w-full min-w-[10rem] items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
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
                                  {g.roleTemplates.map((t) => t.name).join(', ') || '—'}
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-slate-400">
                                  {g.userCount} user{g.userCount === 1 ? '' : 's'}
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
                                  onClick={() => setDeleteTargetId(g.id)}
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
                          Change which role template this group uses. Permissions follow that template’s
                          matrix on the Role screen.
                        </p>
                      </div>
                      {canEdit && prerequisitesReady ? (
                        <button
                          type="button"
                          disabled={saving || !mappingDirty}
                          onClick={() => void saveMapping()}
                          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Save className="h-4 w-4" />
                          {saving ? 'Saving…' : 'Save role'}
                        </button>
                      ) : null}
                    </div>

                    {!prerequisitesReady ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
                        Go to{' '}
                        <Link
                          to={APP_PATHS.platformSecurityRoles}
                          className="font-semibold text-teal-700 underline"
                        >
                          Role templates
                        </Link>{' '}
                        and create templates first.
                      </div>
                    ) : (
                      <div className="max-w-xl">
                        <label htmlFor="fg-edit-role" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Role template
                        </label>
                        <SearchableSelect
                          id="fg-edit-role"
                          value={editRoleTemplateId}
                          onChange={setEditRoleTemplateId}
                          options={roleOptions}
                          placeholder="Choose role…"
                          disabled={!canEdit}
                          emptyMessage="No role templates"
                          ariaLabel={`Role template for ${selected.name}`}
                          className="min-w-0"
                        />
                      </div>
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

        <ConfirmModal
          open={deleteTargetId != null}
          title="Delete function group?"
          variant="danger"
          confirmLabel="Delete"
          loading={deleting}
          onCancel={() => {
            if (!deleting) setDeleteTargetId(null)
          }}
          onConfirm={() => void confirmDeleteGroup()}
        >
          {deleteTargetName ? (
            <p>
              <span className="font-medium text-slate-800">{deleteTargetName}</span> will be removed.
              Users must not still be assigned to this group.
            </p>
          ) : (
            <p>This group will be removed. Users must not still be assigned to it.</p>
          )}
        </ConfirmModal>
      </div>
    </PageTransition>
  )
}
