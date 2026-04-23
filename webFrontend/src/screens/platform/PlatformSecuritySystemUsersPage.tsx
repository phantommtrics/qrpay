import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, UserPlus } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageSectionHeader } from '../../components/ui/PageSectionHeader'
import { PageTransition } from '../../components/ui/PageTransition'
import { SearchableSelect } from '../../components/ui/SearchableSelect'
import { TablePagination } from '../../components/ui/TablePagination'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  createPlatformStaffUserRequest,
  fetchPlatformFunctionGroupsAll,
  fetchPlatformStaffUsersList,
  updatePlatformStaffUserRequest,
  type PlatformFunctionGroupRow,
  type PlatformStaffUserRow,
} from '../../services/subscriptionApi'

const SU_MODULE = 'platform.security_system_users'
const PAGE_SIZE = 10

export function PlatformSecuritySystemUsersPage() {
  const { user } = useAuth()
  const canCreate = Boolean(user?.isPlatformOwner || user?.platformPermissions?.[SU_MODULE]?.create)
  const canEdit = Boolean(user?.isPlatformOwner || user?.platformPermissions?.[SU_MODULE]?.edit)

  const [rows, setRows] = useState<PlatformStaffUserRow[]>([])
  const [usersTotal, setUsersTotal] = useState(0)
  const [listPage, setListPage] = useState(1)
  const [groups, setGroups] = useState<PlatformFunctionGroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newGroupId, setNewGroupId] = useState('')

  const load = useCallback(async (pageOverride?: number) => {
    setLoading(true)
    setError(null)
    try {
      let page = pageOverride !== undefined ? pageOverride : listPage
      const [uPayload, g] = await Promise.all([
        fetchPlatformStaffUsersList({ page, pageSize: PAGE_SIZE }),
        fetchPlatformFunctionGroupsAll(),
      ])
      const totalPages = Math.max(1, Math.ceil(uPayload.total / uPayload.pageSize))
      if (page > totalPages && uPayload.total > 0) {
        page = totalPages
        setListPage(page)
        const retry = await fetchPlatformStaffUsersList({ page, pageSize: PAGE_SIZE })
        setRows(retry.data)
        setUsersTotal(retry.total)
        setGroups(g)
        setNewGroupId((prev) => {
          if (prev && g.some((x) => x.id === prev)) {
            return prev
          }
          return g[0]?.id ?? ''
        })
        return
      }
      if (pageOverride !== undefined) {
        setListPage(page)
      }
      setRows(uPayload.data)
      setUsersTotal(uPayload.total)
      setGroups(g)
      setNewGroupId((prev) => {
        if (prev && g.some((x) => x.id === prev)) {
          return prev
        }
        return g[0]?.id ?? ''
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

  const inviteGroupOptions = useMemo(
    () =>
      groups.map((g) => ({
        value: g.id,
        label: g.name,
        hint: g.roleTemplates.map((t) => t.name).join(', ') || '—',
      })),
    [groups],
  )

  const tableGroupOptions = useMemo(
    () =>
      groups.map((g) => ({
        value: g.id,
        label: g.name,
        hint: g.roleTemplates.map((t) => t.name).join(', ') || '—',
      })),
    [groups],
  )

  const createBlockedReason =
    groups.length === 0
      ? 'Create a function group first (name + role template).'
      : null

  async function handleCreate() {
    const name = newName.trim()
    const email = newEmail.trim().toLowerCase()
    if (!name || !email || !newGroupId || !canCreate) return
    setCreating(true)
    setError(null)
    try {
      await createPlatformStaffUserRequest({
        name,
        email,
        platformFunctionGroupId: newGroupId,
      })
      setNewName('')
      setNewEmail('')
      await load(1)
      setMessage('User created. They will receive an email with a temporary password.')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create user.')
    } finally {
      setCreating(false)
    }
  }

  async function patchUser(id: string, payload: { platformFunctionGroupId?: string; isActive?: boolean }) {
    if (!canEdit) return
    setError(null)
    try {
      await updatePlatformStaffUserRequest(id, payload)
      setMessage('Saved.')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Update failed.')
    }
  }

  const canSubmitCreate =
    canCreate && Boolean(newName.trim() && newEmail.trim() && newGroupId) && !createBlockedReason

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageSectionHeader
          title="System users"
        />

        {!canCreate && user?.isPlatformAdmin ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            You can update existing users, but only DPay (or an admin with create access)
            can invite new platform staff.
          </div>
        ) : null}

        {canCreate ? (
          <PageCard className="border-teal-200/80 bg-gradient-to-br from-teal-50/90 to-white p-6 shadow-sm">
            <div className="flex flex-col gap-6">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
                  <UserPlus className="h-5 w-5" strokeWidth={2.5} />
                </span>
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Invite a platform admin</h4>
                </div>
              </div>

              {createBlockedReason ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <p className="font-medium text-amber-900">{createBlockedReason}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    <Link
                      to={APP_PATHS.platformSecurityFunctionGroups}
                      className="inline-flex items-center gap-1 font-semibold text-teal-800 underline decoration-teal-600/40 underline-offset-2 hover:text-teal-900"
                    >
                      Open function groups
                    </Link>
                    <span className="text-amber-800/60">·</span>
                    <Link
                      to={APP_PATHS.platformSecurityRoles}
                      className="inline-flex items-center gap-1 font-semibold text-teal-800 underline decoration-teal-600/40 underline-offset-2 hover:text-teal-900"
                    >
                      Open role templates
                    </Link>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
                <label className="lg:col-span-3">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Full name
                  </span>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none ring-teal-500/20 focus:border-teal-500 focus:ring-4"
                    placeholder="Jane Doe"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoComplete="name"
                  />
                </label>
                <label className="lg:col-span-4">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Work email
                  </span>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none ring-teal-500/20 focus:border-teal-500 focus:ring-4"
                    placeholder="jane@company.com"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    autoComplete="email"
                  />
                </label>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label htmlFor="invite-function-group" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Function group
                  </label>
                  <SearchableSelect
                    id="invite-function-group"
                    value={newGroupId}
                    onChange={setNewGroupId}
                    options={inviteGroupOptions}
                    placeholder={groups.length === 0 ? 'No groups yet' : 'Search or choose a group…'}
                    disabled={groups.length === 0}
                    emptyMessage="No function groups"
                    ariaLabel="Function group for new user"
                  />
                </div>
                <div className="lg:col-span-2">
                  <button
                    type="button"
                    disabled={creating || !canSubmitCreate}
                    onClick={() => void handleCreate()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-5 w-5" strokeWidth={2.5} />
                    {creating ? 'Sending…' : 'Create & email'}
                  </button>
                </div>
              </div>
            </div>
          </PageCard>
        ) : null}

        <PageCard className="overflow-hidden p-0">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading…</div>
          ) : usersTotal === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <UserPlus className="mb-4 h-12 w-12 text-slate-300" />
              <p className="text-lg font-semibold text-slate-800">No platform admins yet</p>
              <p className="mt-2 max-w-md text-sm text-slate-600">
                {canCreate
                  ? 'Use the form above to invite someone. They appear here after you create them.'
                  : 'Only users with permission to create system users can add staff.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th className="whitespace-nowrap px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                      Name
                    </th>
                    <th className="whitespace-nowrap px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                      Email
                    </th>
                    <th className="whitespace-nowrap px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                      Function group
                    </th>
                    <th className="whitespace-nowrap px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                      Active
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 transition hover:bg-slate-50/80">
                      <td className="px-5 py-4 font-semibold text-slate-900">{r.name}</td>
                      <td className="px-5 py-4 text-slate-600">{r.email}</td>
                      <td className="px-5 py-4">
                        {canEdit ? (
                          <SearchableSelect
                            value={r.platformFunctionGroupId ?? ''}
                            onChange={(v) => void patchUser(r.id, { platformFunctionGroupId: v })}
                            options={tableGroupOptions}
                            placeholder="Group…"
                            ariaLabel={`Function group for ${r.name}`}
                            className="max-w-[min(100%,280px)]"
                            buttonClassName="rounded-lg py-2 pl-3 pr-2 text-sm"
                            listMaxHeightClass="max-h-52"
                          />
                        ) : (
                          <span className="text-slate-700">{r.platformFunctionGroup?.name ?? '—'}</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {canEdit ? (
                          <label className="inline-flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={r.isActive}
                              onChange={() => void patchUser(r.id, { isActive: !r.isActive })}
                              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                            />
                            <span className="text-slate-600">{r.isActive ? 'Yes' : 'No'}</span>
                          </label>
                        ) : (
                          <span className="font-medium text-slate-700">{r.isActive ? 'Yes' : 'No'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                page={listPage}
                pageSize={PAGE_SIZE}
                total={usersTotal}
                onPageChange={setListPage}
              />
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
