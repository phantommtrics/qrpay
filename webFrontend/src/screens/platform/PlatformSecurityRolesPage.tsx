import { useCallback, useEffect, useRef, useState } from 'react'
import { Layers, Plus, Save, Trash2 } from 'lucide-react'

import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { PageCard } from '../../components/ui/PageCard'
import { PageSectionHeader } from '../../components/ui/PageSectionHeader'
import { PageTransition } from '../../components/ui/PageTransition'
import { TablePagination } from '../../components/ui/TablePagination'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  createPlatformRoleTemplate,
  deletePlatformRoleTemplate,
  fetchPlatformRoleTemplates,
  fetchPlatformSecurityModules,
  savePlatformRoleTemplatePermissions,
  type PlatformRoleTemplate,
  type PlatformSecurityModule,
} from '../../services/subscriptionApi'

const SEC_MODULE = 'platform.security_roles'
const PAGE_SIZE = 10

type MatrixRow = {
  moduleId: string
  canView: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  canExport: boolean
}

function templateToMatrix(
  template: PlatformRoleTemplate | null,
  modules: PlatformSecurityModule[],
): MatrixRow[] {
  const byModule = new Map(template?.permissions.map((p) => [p.moduleId, p]) ?? [])
  return modules.map((m) => {
    const p = byModule.get(m.id)
    return {
      moduleId: m.id,
      canView: p?.canView ?? false,
      canCreate: p?.canCreate ?? false,
      canEdit: p?.canEdit ?? false,
      canDelete: p?.canDelete ?? false,
      canExport: p?.canExport ?? false,
    }
  })
}

const actionLabels: { key: keyof Omit<MatrixRow, 'moduleId'>; short: string; hint: string }[] = [
  { key: 'canView', short: 'View', hint: 'Open screens and lists' },
  { key: 'canCreate', short: 'Create', hint: 'Add new records' },
  { key: 'canEdit', short: 'Edit', hint: 'Change existing records' },
  { key: 'canDelete', short: 'Delete', hint: 'Remove records' },
  { key: 'canExport', short: 'Export', hint: 'Download / export data' },
]

const PMATRIX_CELL = 'data-pmatrix-cell'

function applyRectToSnapshot(
  snapshot: MatrixRow[],
  r0: number,
  c0: number,
  r1: number,
  c1: number,
  paint: boolean,
): MatrixRow[] {
  const rLo = Math.min(r0, r1)
  const rHi = Math.max(r0, r1)
  const cLo = Math.min(c0, c1)
  const cHi = Math.max(c0, c1)
  return snapshot.map((row, ri) => {
    if (ri < rLo || ri > rHi) return row
    const next = { ...row }
    for (let ci = cLo; ci <= cHi; ci++) {
      const k = actionLabels[ci]?.key
      if (k) next[k] = paint
    }
    return next
  })
}

export function PlatformSecurityRolesPage() {
  const { user } = useAuth()
  const canCreateTpl = Boolean(user?.isPlatformOwner || user?.platformPermissions?.[SEC_MODULE]?.create)
  const canEditTpl = Boolean(user?.isPlatformOwner || user?.platformPermissions?.[SEC_MODULE]?.edit)
  const canDeleteTpl = Boolean(user?.isPlatformOwner || user?.platformPermissions?.[SEC_MODULE]?.delete)

  const [modules, setModules] = useState<PlatformSecurityModule[]>([])
  const [templates, setTemplates] = useState<PlatformRoleTemplate[]>([])
  const [templatesTotal, setTemplatesTotal] = useState(0)
  const [listPage, setListPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [matrix, setMatrix] = useState<MatrixRow[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const pendingSelectAfterLoadRef = useRef<string | null>(null)

  const selected = templates.find((t) => t.id === selectedId) ?? null

  const load = useCallback(async (pageOverride?: number) => {
    setLoading(true)
    setError(null)
    try {
      let page = pageOverride !== undefined ? pageOverride : listPage
      const [modList, tplPayload] = await Promise.all([
        fetchPlatformSecurityModules(),
        fetchPlatformRoleTemplates({ page, pageSize: PAGE_SIZE }),
      ])
      setModules(modList)
      const totalPages = Math.max(1, Math.ceil(tplPayload.total / tplPayload.pageSize))
      if (page > totalPages && tplPayload.total > 0) {
        page = totalPages
        setListPage(page)
        const retry = await fetchPlatformRoleTemplates({ page, pageSize: PAGE_SIZE })
        setTemplates(retry.data)
        setTemplatesTotal(retry.total)
        setSelectedId((current) => {
          const pending = pendingSelectAfterLoadRef.current
          const data = retry.data
          if (pending && data.some((t) => t.id === pending)) {
            pendingSelectAfterLoadRef.current = null
            return pending
          }
          if (pending) {
            pendingSelectAfterLoadRef.current = null
          }
          if (current && data.some((t) => t.id === current)) {
            return current
          }
          return data[0]?.id ?? null
        })
        return
      }
      if (pageOverride !== undefined) {
        setListPage(page)
      }
      setTemplates(tplPayload.data)
      setTemplatesTotal(tplPayload.total)
      setSelectedId((current) => {
        const pending = pendingSelectAfterLoadRef.current
        if (pending && tplPayload.data.some((t) => t.id === pending)) {
          pendingSelectAfterLoadRef.current = null
          return pending
        }
        if (pending) {
          pendingSelectAfterLoadRef.current = null
        }
        if (current && tplPayload.data.some((t) => t.id === current)) {
          return current
        }
        return tplPayload.data[0]?.id ?? null
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
    setMatrix(templateToMatrix(selected, modules))
  }, [selected, modules])

  async function handleSaveMatrix() {
    if (!selectedId || !canEditTpl) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      await savePlatformRoleTemplatePermissions(selectedId, matrix)
      setMessage('Permissions saved.')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreate() {
    const name = newName.trim()
    if (!name || !canCreateTpl) return
    setCreating(true)
    setError(null)
    try {
      const row = await createPlatformRoleTemplate({ name })
      setNewName('')
      pendingSelectAfterLoadRef.current = row.id
      await load(1)
      setMessage('Role template created. Set permissions below, then save.')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Create failed.')
    } finally {
      setCreating(false)
    }
  }

  const deleteTargetName =
    deleteTargetId != null ? templates.find((t) => t.id === deleteTargetId)?.name : undefined

  async function confirmDeleteTemplate() {
    if (!deleteTargetId || !canDeleteTpl) return
    setDeleting(true)
    setError(null)
    try {
      const id = deleteTargetId
      await deletePlatformRoleTemplate(id)
      if (selectedId === id) {
        setSelectedId(null)
      }
      await load()
      setMessage('Template deleted.')
      setDeleteTargetId(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed.')
    } finally {
      setDeleting(false)
    }
  }

  const toggle = (moduleId: string, key: keyof Omit<MatrixRow, 'moduleId'>) => {
    if (!canEditTpl) return
    setMatrix((rows) =>
      rows.map((r) => (r.moduleId === moduleId ? { ...r, [key]: !r[key] } : r)),
    )
  }

  const paintDragRef = useRef<{
    snapshot: MatrixRow[]
    paint: boolean
    r0: number
    c0: number
  } | null>(null)
  const paintCleanupRef = useRef<(() => void) | null>(null)

  const clearMatrixPaintListeners = useCallback(() => {
    paintCleanupRef.current?.()
    paintCleanupRef.current = null
    paintDragRef.current = null
  }, [])

  useEffect(() => () => clearMatrixPaintListeners(), [clearMatrixPaintListeners])

  const startMatrixPaint = useCallback(
    (e: React.PointerEvent, rowIndex: number, colIndex: number) => {
      if (!canEditTpl) return
      e.preventDefault()
      clearMatrixPaintListeners()
      const snapshot = matrix.map((r) => ({ ...r }))
      const key = actionLabels[colIndex]?.key
      if (!key) return
      const paint = !snapshot[rowIndex][key]
      paintDragRef.current = { snapshot, paint, r0: rowIndex, c0: colIndex }
      setMatrix(
        applyRectToSnapshot(snapshot, rowIndex, colIndex, rowIndex, colIndex, paint),
      )

      const onMove = (ev: PointerEvent) => {
        const d = paintDragRef.current
        if (!d) return
        const el = document.elementFromPoint(ev.clientX, ev.clientY)
        const host = (el as HTMLElement | null)?.closest(`[${PMATRIX_CELL}]`)
        const raw = host?.getAttribute(PMATRIX_CELL)
        if (raw == null) return
        const parts = raw.split(',').map((x) => Number.parseInt(x, 10))
        if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return
        const [r1, c1] = parts
        setMatrix(applyRectToSnapshot(d.snapshot, d.r0, d.c0, r1, c1, d.paint))
      }

      const onEnd = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onEnd)
        window.removeEventListener('pointercancel', onEnd)
        paintDragRef.current = null
        paintCleanupRef.current = null
      }

      paintCleanupRef.current = onEnd
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onEnd)
      window.addEventListener('pointercancel', onEnd)
    },
    [canEditTpl, clearMatrixPaintListeners, matrix],
  )

  const toggleWholeRow = useCallback((rowIndex: number) => {
    if (!canEditTpl) return
    setMatrix((rows) => {
      const row = rows[rowIndex]
      if (!row) return rows
      const allOn = actionLabels.every(({ key }) => row[key])
      const nextVal = !allOn
      return rows.map((r, i) => {
        if (i !== rowIndex) return r
        const next = { ...r }
        for (const { key } of actionLabels) {
          next[key] = nextVal
        }
        return next
      })
    })
  }, [canEditTpl])

  const toggleWholeColumn = useCallback((colIndex: number) => {
    if (!canEditTpl) return
    const key = actionLabels[colIndex]?.key
    if (!key) return
    setMatrix((rows) => {
      const allOn = rows.every((row) => row[key])
      const nextVal = !allOn
      return rows.map((row) => ({ ...row, [key]: nextVal }))
    })
  }, [canEditTpl])

  const moduleById = new Map(modules.map((m) => [m.id, m]))

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageSectionHeader
          title="Role templates"
          subtitle="Build reusable permission matrices. Function groups attach these templates so platform staff inherit the combined access."
        />

        {!canCreateTpl && user?.isPlatformAdmin ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            You can view and edit templates, but only a platform owner (or an admin with create access
            on this screen) can add new templates.
          </div>
        ) : null}

        {canCreateTpl ? (
          <PageCard className="border-teal-200/80 bg-gradient-to-br from-teal-50/90 to-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2 text-teal-900">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
                    <Plus className="h-5 w-5" strokeWidth={2.5} />
                  </span>
                  <div>
                    <h4 className="text-base font-semibold text-slate-900">Create a role template</h4>
                    <p className="text-sm text-slate-600">
                      Name it (e.g. “Billing read-only”), then tick permissions in the table below.
                    </p>
                  </div>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Template name
                  </span>
                  <input
                    className="w-full max-w-xl rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none ring-teal-500/30 transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4"
                    placeholder="e.g. Full platform access"
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
                {creating ? 'Creating…' : 'Create template'}
              </button>
            </div>
          </PageCard>
        ) : null}

        <PageCard className="p-0 overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading…</div>
          ) : (
            <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,17.5rem)_minmax(0,1fr)] lg:divide-x lg:divide-slate-100">
              <aside className="flex min-h-0 min-w-0 flex-col border-b border-slate-100 bg-slate-50/50 lg:border-b-0 lg:bg-slate-50/30">
                <div className="shrink-0 px-3 pb-2 pt-3 sm:px-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Your templates ({templatesTotal})
                  </p>
                </div>
                <div className="min-h-0 min-w-0 max-h-[min(42vh,18rem)] flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 sm:px-4 md:max-h-[min(48vh,22rem)] lg:max-h-none [scrollbar-gutter:stable]">
                  {templates.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
                      <Layers className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                      No templates yet.
                      {canCreateTpl ? (
                        <p className="mt-2 text-slate-500">Use the green section above to create one.</p>
                      ) : null}
                    </div>
                  ) : (
                    <ul className="space-y-1.5 pb-1">
                      {templates.map((t) => {
                        const active = t.id === selectedId
                        const linkedGroups = t.assignedFunctionGroupCount ?? 0
                        const deleteBlocked = linkedGroups > 0
                        return (
                          <li key={t.id}>
                            <div
                              className={`flex min-w-0 items-stretch gap-1 overflow-hidden rounded-xl border-2 transition ${
                                active
                                  ? 'border-teal-500 bg-white shadow-md ring-1 ring-teal-500/20'
                                  : 'border-transparent bg-white/80 hover:border-slate-200 hover:bg-white'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedId(t.id)}
                                className="min-w-0 flex-1 px-3 py-3 text-left"
                              >
                                <span className="block truncate font-semibold text-slate-900">{t.name}</span>
                              </button>
                              {canDeleteTpl ? (
                                <button
                                  type="button"
                                  aria-label={
                                    deleteBlocked
                                      ? `Cannot delete: used by ${linkedGroups} function group(s)`
                                      : `Delete ${t.name}`
                                  }
                                  title={
                                    deleteBlocked
                                      ? 'Remove this template from all function groups before deleting.'
                                      : undefined
                                  }
                                  disabled={deleteBlocked}
                                  className="flex w-11 shrink-0 items-center justify-center border-l border-slate-100 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                  onClick={() => setDeleteTargetId(t.id)}
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
                {templatesTotal > 0 ? (
                  <div className="shrink-0 border-t border-slate-200 bg-slate-50/80">
                    <TablePagination
                      compact
                      page={listPage}
                      pageSize={PAGE_SIZE}
                      total={templatesTotal}
                      onPageChange={setListPage}
                      className="border-t-0 bg-transparent"
                    />
                  </div>
                ) : null}
              </aside>

              <div className="min-w-0 p-4 sm:p-6">
                {selected ? (
                  <>
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-lg font-semibold text-slate-900">{selected.name}</h4>
                        <p className="text-sm text-slate-600">
                          Drag across the grid to paint a row, column, or block. Click a module name to
                          toggle an entire row, or a column header to toggle that column. Then save.
                        </p>
                      </div>
                      {canEditTpl ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleSaveMatrix()}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-500 disabled:opacity-50"
                        >
                          <Save className="h-4 w-4" />
                          {saving ? 'Saving…' : 'Save permissions'}
                        </button>
                      ) : null}
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                      <table
                        role="grid"
                        aria-label="Permission matrix"
                        className="w-full min-w-[600px] border-collapse text-sm select-none"
                      >
                        <thead>
                          <tr role="row" className="border-b border-slate-200 bg-slate-50 text-left">
                            <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                              Module
                            </th>
                            {actionLabels.map(({ key, short, hint }, colIndex) => (
                              <th
                                key={key}
                                className="w-14 px-1 py-2 text-center text-xs font-bold uppercase tracking-wide text-slate-600"
                              >
                                <button
                                  type="button"
                                  disabled={!canEditTpl}
                                  title={`${hint} — click to toggle entire column`}
                                  onClick={() => toggleWholeColumn(colIndex)}
                                  className="mx-auto block w-full max-w-[3.25rem] rounded-lg py-2 text-center leading-tight transition hover:bg-slate-200/80 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                                >
                                  {short}
                                </button>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {matrix.map((row, rowIndex) => {
                            const mod = moduleById.get(row.moduleId)
                            if (!mod) {
                              return null
                            }
                            return (
                              <tr
                                key={row.moduleId}
                                role="row"
                                className="border-b border-slate-100 transition hover:bg-slate-50/80"
                              >
                                <td className="px-2 py-2">
                                  <button
                                    type="button"
                                    disabled={!canEditTpl}
                                    title="Click to toggle all permissions for this module"
                                    onClick={() => toggleWholeRow(rowIndex)}
                                    className="w-full rounded-lg px-2 py-2 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-200/60 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                                  >
                                    {mod.label}
                                  </button>
                                </td>
                                {actionLabels.map(({ key }, colIndex) => (
                                  <td
                                    key={key}
                                    data-pmatrix-cell={`${rowIndex},${colIndex}`}
                                    className={`px-1 py-2 text-center ${
                                      canEditTpl ? 'cursor-pointer' : ''
                                    }`}
                                    onPointerDown={(e) => startMatrixPaint(e, rowIndex, colIndex)}
                                    onKeyDown={(e) => {
                                      if (!canEditTpl) return
                                      if (e.key === ' ' || e.key === 'Enter') {
                                        e.preventDefault()
                                        toggle(row.moduleId, key)
                                      }
                                    }}
                                    tabIndex={canEditTpl ? 0 : -1}
                                    role="gridcell"
                                    aria-checked={row[key]}
                                    aria-label={`${mod.label} — ${actionLabels[colIndex]?.short ?? key}`}
                                  >
                                    <input
                                      type="checkbox"
                                      tabIndex={-1}
                                      checked={row[key]}
                                      readOnly
                                      aria-hidden
                                      className="pointer-events-none h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-0"
                                    />
                                  </td>
                                ))}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                    <Layers className="mb-3 h-10 w-10 text-slate-300" />
                    <p className="max-w-sm text-base font-medium text-slate-800">
                      {templates.length === 0
                        ? 'Create your first template above'
                        : 'Select a template from the list'}
                    </p>
                    <p className="mt-2 max-w-sm text-sm text-slate-600">
                      {templates.length === 0 && canCreateTpl
                        ? 'Start by naming a template in the highlighted section at the top of this page.'
                        : null}
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
          title="Delete role template?"
          variant="danger"
          confirmLabel="Delete"
          loading={deleting}
          onCancel={() => {
            if (!deleting) setDeleteTargetId(null)
          }}
          onConfirm={() => void confirmDeleteTemplate()}
        >
          {deleteTargetName ? (
            <p>
              <span className="font-medium text-slate-800">{deleteTargetName}</span> will be removed.
              This cannot be undone.
            </p>
          ) : (
            <p>This template will be removed. This cannot be undone.</p>
          )}
        </ConfirmModal>
      </div>
    </PageTransition>
  )
}
