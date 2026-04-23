import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightLeft } from 'lucide-react'

import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { PageCard } from '../../components/ui/PageCard'
import { PageSectionHeader } from '../../components/ui/PageSectionHeader'
import { PageTransition } from '../../components/ui/PageTransition'
import { SearchableSelect } from '../../components/ui/SearchableSelect'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  bulkMovePlatformStaffUsers,
  fetchPlatformFunctionGroupsAll,
  fetchPlatformStaffUsersList,
  type PlatformFunctionGroupRow,
  type PlatformStaffUserRow,
} from '../../services/subscriptionApi'

const MOVE_USERS_MODULE = 'platform.security_move_users'
const SU_MODULE = 'platform.security_system_users'
const PAGE_SIZE = 100

async function loadAllUsersInGroup(groupId: string): Promise<PlatformStaffUserRow[]> {
  let page = 1
  const all: PlatformStaffUserRow[] = []
  let total = Infinity
  while (all.length < total) {
    const res = await fetchPlatformStaffUsersList({
      page,
      pageSize: PAGE_SIZE,
      functionGroupId: groupId,
    })
    total = res.total
    all.push(...res.data)
    if (res.data.length === 0) break
    page += 1
  }
  return all
}

export function PlatformSecurityMoveUsersPage() {
  const { user } = useAuth()
  const canEdit = Boolean(
    user?.isPlatformOwner ||
      user?.platformPermissions?.[MOVE_USERS_MODULE]?.edit ||
      user?.platformPermissions?.[SU_MODULE]?.edit,
  )

  const [groups, setGroups] = useState<PlatformFunctionGroupRow[]>([])
  const [fromGroupId, setFromGroupId] = useState('')
  const [toGroupId, setToGroupId] = useState('')
  const [sourceUsers, setSourceUsers] = useState<PlatformStaffUserRow[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [moving, setMoving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [moveConfirmKind, setMoveConfirmKind] = useState<null | 'selected' | 'everyone'>(null)

  const fromGroupOptions = useMemo(
    () =>
      groups.map((g) => ({
        value: g.id,
        label: g.name,
        hint: `${g.userCount} user${g.userCount === 1 ? '' : 's'}`,
      })),
    [groups],
  )

  const toGroupOptions = useMemo(
    () =>
      groups.map((g) => ({
        value: g.id,
        label: g.name,
        hint: g.roleTemplates.map((t) => t.name).join(', ') || '—',
      })),
    [groups],
  )

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true)
    setError(null)
    try {
      const g = await fetchPlatformFunctionGroupsAll()
      setGroups(g)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load function groups.')
    } finally {
      setLoadingGroups(false)
    }
  }, [])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  useEffect(() => {
    if (!fromGroupId) {
      setSourceUsers([])
      setSelectedIds(new Set())
      return
    }
    let cancelled = false
    setLoadingUsers(true)
    setError(null)
    void loadAllUsersInGroup(fromGroupId)
      .then((rows) => {
        if (!cancelled) {
          setSourceUsers(rows)
          setSelectedIds(new Set(rows.map((r) => r.id)))
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setSourceUsers([])
          setSelectedIds(new Set())
          setError(e instanceof ApiError ? e.message : 'Could not load users.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false)
      })
    return () => {
      cancelled = true
    }
  }, [fromGroupId])

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(sourceUsers.map((r) => r.id)))
  const selectNone = () => setSelectedIds(new Set())

  const sameGroup = Boolean(fromGroupId && toGroupId && fromGroupId === toGroupId)
  const targetReady = Boolean(toGroupId && groups.some((g) => g.id === toGroupId))
  const selectedCount = selectedIds.size
  const fromName = groups.find((g) => g.id === fromGroupId)?.name ?? 'source'
  const toName = groups.find((g) => g.id === toGroupId)?.name ?? 'target'

  const canMoveSelected =
    canEdit &&
    fromGroupId &&
    toGroupId &&
    !sameGroup &&
    targetReady &&
    sourceUsers.length > 0 &&
    selectedCount > 0

  const canMoveEveryone =
    canEdit &&
    fromGroupId &&
    toGroupId &&
    !sameGroup &&
    targetReady &&
    sourceUsers.length > 0

  async function afterMoveSuccess() {
    const rows = await loadAllUsersInGroup(fromGroupId)
    setSourceUsers(rows)
    setSelectedIds(new Set(rows.map((r) => r.id)))
    await loadGroups()
  }

  function openMoveSelectedModal() {
    if (!canMoveSelected) return
    setMoveConfirmKind('selected')
  }

  function openMoveEveryoneModal() {
    if (!canMoveEveryone) return
    setMoveConfirmKind('everyone')
  }

  async function confirmMove() {
    if (!moveConfirmKind) return
    if (moveConfirmKind === 'selected' && !canMoveSelected) {
      setMoveConfirmKind(null)
      return
    }
    if (moveConfirmKind === 'everyone' && !canMoveEveryone) {
      setMoveConfirmKind(null)
      return
    }
    setMoving(true)
    setError(null)
    try {
      if (moveConfirmKind === 'selected') {
        const { movedCount } = await bulkMovePlatformStaffUsers({
          fromGroupId,
          toGroupId,
          userIds: [...selectedIds],
        })
        setMessage(`Moved ${movedCount} user(s).`)
      } else {
        const { movedCount } = await bulkMovePlatformStaffUsers({
          fromGroupId,
          toGroupId,
        })
        setMessage(`Moved ${movedCount} user(s).`)
      }
      setMoveConfirmKind(null)
      await afterMoveSuccess()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Move failed.')
    } finally {
      setMoving(false)
    }
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageSectionHeader
          title="Move users between groups"
        />

        {!canEdit && user?.isPlatformAdmin ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            You can view this screen, but only DPay (or an admin with edit access on system
            users) can move users.
          </div>
        ) : null}

        {groups.length === 0 && !loadingGroups ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-950">
            <p className="font-semibold text-sky-900">Create function groups first</p>
            <Link
              to={APP_PATHS.platformSecurityFunctionGroups}
              className="mt-2 inline-block font-semibold text-teal-800 underline"
            >
              Open function groups
            </Link>
          </div>
        ) : null}

        <PageCard className="p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="move-from-group" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                From group
              </label>
              <SearchableSelect
                id="move-from-group"
                value={fromGroupId}
                onChange={setFromGroupId}
                options={fromGroupOptions}
                placeholder="Search or select source group…"
                disabled={loadingGroups || groups.length === 0}
                emptyMessage="No function groups"
                ariaLabel="Source function group"
              />
            </div>
            <div className="hidden items-center justify-center pb-2 text-slate-300 lg:flex" aria-hidden>
              <ArrowRightLeft className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="move-to-group" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                To group
              </label>
              <SearchableSelect
                id="move-to-group"
                value={toGroupId}
                onChange={setToGroupId}
                options={toGroupOptions}
                placeholder="Search or select target group…"
                disabled={loadingGroups || groups.length === 0}
                emptyMessage="No function groups"
                ariaLabel="Target function group"
              />
            </div>
          </div>
          {sameGroup ? (
            <p className="mt-3 text-sm text-amber-800">Choose two different groups.</p>
          ) : null}
        </PageCard>

        <PageCard className="overflow-hidden p-0">
          {!fromGroupId ? (
            <div className="p-10 text-center text-sm text-slate-500">Select a source group to list users.</div>
          ) : loadingUsers ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading users…</div>
          ) : sourceUsers.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-600">No platform admins in this group.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                <p className="text-sm font-medium text-slate-700">
                  {sourceUsers.length} user{sourceUsers.length === 1 ? '' : 's'} · {selectedCount} selected
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    onClick={selectAll}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    onClick={selectNone}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <ul className="max-h-[min(55vh,24rem)] divide-y divide-slate-100 overflow-y-auto">
                {sourceUsers.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/80">
                    <input
                      type="checkbox"
                      id={`mu-${r.id}`}
                      checked={selectedIds.has(r.id)}
                      disabled={!canEdit}
                      onChange={() => toggleOne(r.id)}
                      className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <label htmlFor={`mu-${r.id}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="block font-semibold text-slate-900">{r.name}</span>
                      <span className="block truncate text-sm text-slate-500">{r.email}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/90 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <button
                  type="button"
                  disabled={!canMoveSelected || moving}
                  onClick={() => openMoveSelectedModal()}
                  className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {moving ? 'Working…' : `Move ${selectedCount} selected`}
                </button>
                <button
                  type="button"
                  disabled={!canMoveEveryone || moving}
                  onClick={() => openMoveEveryoneModal()}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Move everyone in source group
                </button>
              </div>
            </>
          )}
        </PageCard>

        {message ? (
          <p className="rounded-lg bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800">{message}</p>
        ) : null}
        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-800">{error}</p>
        ) : null}

        <ConfirmModal
          open={moveConfirmKind != null}
          title={moveConfirmKind === 'everyone' ? 'Move everyone in this group?' : 'Move selected users?'}
          confirmLabel="Move"
          loading={moving}
          onCancel={() => {
            if (!moving) setMoveConfirmKind(null)
          }}
          onConfirm={() => void confirmMove()}
        >
          {moveConfirmKind === 'everyone' ? (
            <p>
              Move all {sourceUsers.length} user{sourceUsers.length === 1 ? '' : 's'} from{' '}
              <span className="font-medium text-slate-800">“{fromName}”</span> to{' '}
              <span className="font-medium text-slate-800">“{toName}”</span>. Checkbox selection is ignored.
            </p>
          ) : moveConfirmKind === 'selected' ? (
            <p>
              Move {selectedCount} selected user{selectedCount === 1 ? '' : 's'} to{' '}
              <span className="font-medium text-slate-800">“{toName}”</span>?
            </p>
          ) : null}
        </ConfirmModal>
      </div>
    </PageTransition>
  )
}
