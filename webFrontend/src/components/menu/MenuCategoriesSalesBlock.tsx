import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileDown, FileText, Plus, Trash2 } from 'lucide-react'

import { ConfirmModal } from '../ui/ConfirmModal'
import { SearchableListbox } from '../ui/SearchableListbox'
import { FlashNotice } from '../ui/FlashNotice'
import {
  fetchSalesByCategoryReport,
  type CategorySalesSummaryReport,
  type CategorySalesSummaryRow,
  type SalesLedgerChannelTotalsRow,
} from '../../services/catalogReportsApi'
import {
  ApiError,
  createMenuCategory,
  deleteMenuCategory,
  fetchMenuCategories,
  type MenuCategoryRow,
} from '../../services/subscriptionApi'
import { categoryBreadcrumb, orderedCategoryTree } from '../../utils/menuCategoryTree'
import { downloadCsv, downloadFinancePdf, type PdfTableSection } from '../../utils/financeReportExport'
import { formatMoney } from '../../utils/formatMoney'

const UNCATEGORIZED_KEY = '__uncategorized__'

type CatalogTab = 'categories' | 'summary'

type DatePreset = 'today' | 'current_quarter' | 'last_day' | 'last_week' | 'last_month' | 'custom'

function toYmdUTC(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function utcDay(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m, day))
}

function addUtcDays(d: Date, n: number): Date {
  const x = new Date(d.getTime())
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

function startOfUtcQuarter(d: Date): Date {
  const q = Math.floor(d.getUTCMonth() / 3)
  return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1))
}

function presetRange(preset: DatePreset, ref: Date): { from: string; to: string } | null {
  if (preset === 'custom') return null
  const y = ref.getUTCFullYear()
  const m = ref.getUTCMonth()
  const day = ref.getUTCDate()
  const today = toYmdUTC(ref)

  if (preset === 'today') {
    return { from: today, to: today }
  }

  if (preset === 'last_day') {
    const yest = addUtcDays(utcDay(y, m, day), -1)
    const s = toYmdUTC(yest)
    return { from: s, to: s }
  }

  if (preset === 'last_week') {
    const end = addUtcDays(utcDay(y, m, day), -1)
    const start = addUtcDays(end, -6)
    return { from: toYmdUTC(start), to: toYmdUTC(end) }
  }

  if (preset === 'last_month') {
    const firstThisMonth = utcDay(y, m, 1)
    const lastPrev = addUtcDays(firstThisMonth, -1)
    const firstPrev = utcDay(lastPrev.getUTCFullYear(), lastPrev.getUTCMonth(), 1)
    return { from: toYmdUTC(firstPrev), to: toYmdUTC(lastPrev) }
  }

  if (preset === 'current_quarter') {
    const qs = startOfUtcQuarter(ref)
    return { from: toYmdUTC(qs), to: today }
  }

  return { from: today, to: today }
}

function humanizeEnumToken(s: string): string {
  return s
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

function channelKey(r: CategorySalesSummaryRow): string {
  return `${r.paymentMethod}|${r.paymentProvider}|${r.gatewayCode ?? ''}`
}

function channelLabel(r: CategorySalesSummaryRow): string {
  const method = humanizeEnumToken(r.paymentMethod)
  const provider = humanizeEnumToken(r.paymentProvider)
  /** Omit gateway code in parentheses (e.g. "(aps_wallet)") — method + provider is enough. */
  return `${method} | ${provider}`
}

function ledgerChannelLabel(r: SalesLedgerChannelTotalsRow): string {
  return `${humanizeEnumToken(r.paymentMethod)} | ${humanizeEnumToken(r.paymentProvider)}`
}

function recorderKey(r: CategorySalesSummaryRow): string {
  return r.recordedByUserId ?? UNCATEGORIZED_KEY
}

function recorderLabel(r: CategorySalesSummaryRow): string {
  return r.recordedByName?.trim() ? r.recordedByName.trim() : 'Guest / unassigned'
}

type CategoryDisplayLine = {
  categoryId: string
  name: string
  depth: number
  rollup: number
}

type RecorderSection = {
  key: string
  label: string
  uncatAmount: number
  categoryLines: CategoryDisplayLine[]
  sectionTotal: number
}

type ChannelSection = {
  key: string
  label: string
  recorders: RecorderSection[]
  channelTotal: number
}

type DateReportBlock = {
  saleDate: string
  channels: ChannelSection[]
  dayTotal: number
}

function buildChannelSectionsFromRows(
  rows: CategorySalesSummaryRow[],
  categories: MenuCategoryRow[],
): ChannelSection[] {
  if (rows.length === 0) return []

  const byId = new Map(categories.map((c) => [c.id, c]))
  const childrenByParent = new Map<string | null, MenuCategoryRow[]>()
  for (const c of categories) {
    const k = c.parentId
    if (!childrenByParent.has(k)) childrenByParent.set(k, [])
    childrenByParent.get(k)!.push(c)
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  }

  const channelMap = new Map<
    string,
    { label: string; byRecorder: Map<string, { label: string; direct: Map<string | typeof UNCATEGORIZED_KEY, number> }> }
  >()

  for (const r of rows) {
    if (Math.abs(r.amount) < 1e-9) continue
    const ck = channelKey(r)
    const rk = recorderKey(r)
    if (!channelMap.has(ck)) {
      channelMap.set(ck, { label: channelLabel(r), byRecorder: new Map() })
    }
    const ch = channelMap.get(ck)!
    if (!ch.byRecorder.has(rk)) {
      ch.byRecorder.set(rk, { label: recorderLabel(r), direct: new Map() })
    }
    const rec = ch.byRecorder.get(rk)!
    const catKey = r.menuCategoryId ?? UNCATEGORIZED_KEY
    rec.direct.set(catKey, (rec.direct.get(catKey) ?? 0) + r.amount)
  }

  function rollupForSlice(direct: Map<string | typeof UNCATEGORIZED_KEY, number>, categoryId: string): number {
    let sum = direct.get(categoryId) ?? 0
    const kids = childrenByParent.get(categoryId) ?? []
    for (const k of kids) {
      sum += rollupForSlice(direct, k.id)
    }
    return sum
  }

  function buildCategoryLines(direct: Map<string | typeof UNCATEGORIZED_KEY, number>): CategoryDisplayLine[] {
    const rollupMemo = new Map<string, number>()
    const rollup = (id: string): number => {
      if (rollupMemo.has(id)) return rollupMemo.get(id)!
      const v = rollupForSlice(direct, id)
      rollupMemo.set(id, v)
      return v
    }

    const lines: CategoryDisplayLine[] = []
    const walk = (id: string, depth: number) => {
      const ru = rollup(id)
      if (ru < 1e-6) return
      const row = byId.get(id)
      lines.push({
        categoryId: id,
        name: row?.name ?? 'Unknown category',
        depth,
        rollup: ru,
      })
      const kids = childrenByParent.get(id) ?? []
      for (const k of kids) walk(k.id, depth + 1)
    }

    const roots = childrenByParent.get(null) ?? []
    for (const root of roots) walk(root.id, 0)
    return lines
  }

  const channels: ChannelSection[] = []
  for (const [ck, ch] of channelMap) {
    const recorders: RecorderSection[] = []
    let channelTotal = 0
    const sortedRec = [...ch.byRecorder.entries()].sort((a, b) =>
      a[1].label.localeCompare(b[1].label, undefined, { sensitivity: 'base' }),
    )
    for (const [recKey, rec] of sortedRec) {
      const uncat = rec.direct.get(UNCATEGORIZED_KEY) ?? 0
      const categoryLines = buildCategoryLines(rec.direct)
      const rootsOnly = (childrenByParent.get(null) ?? []).reduce((s, root) => {
        const ru = rollupForSlice(rec.direct, root.id)
        return s + ru
      }, 0)
      const total = rootsOnly + uncat

      recorders.push({
        key: recKey,
        label: rec.label,
        uncatAmount: uncat,
        categoryLines,
        sectionTotal: total,
      })
      channelTotal += total
    }

    channels.push({
      key: ck,
      label: ch.label,
      recorders,
      channelTotal,
    })
  }

  channels.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  return channels
}

function buildReportByDate(
  report: CategorySalesSummaryReport | null,
  categories: MenuCategoryRow[],
): DateReportBlock[] {
  if (!report || report.rows.length === 0) return []

  const byDate = new Map<string, CategorySalesSummaryRow[]>()
  for (const r of report.rows) {
    if (Math.abs(r.amount) < 1e-9) continue
    const list = byDate.get(r.saleDate) ?? []
    list.push(r)
    byDate.set(r.saleDate, list)
  }

  const sortedDates = [...byDate.keys()].sort()
  return sortedDates.map((saleDate) => {
    const dayRows = byDate.get(saleDate) ?? []
    const channels = buildChannelSectionsFromRows(dayRows, categories)
    const dayTotal = dayRows.reduce((s, x) => s + x.amount, 0)
    return { saleDate, channels, dayTotal }
  })
}

export type SalesByCategoryFlatRow = {
  saleDate: string
  channel: string
  recordedBy: string
  /** Breadcrumb path without leading spaces (for UI). */
  categoryPath: string
  /** Tree depth: 0 = parent section total row (bold/larger in UI). */
  categoryDepth: number
  /** Indented path for CSV / PDF text column. */
  categoryCsv: string
  amount: number
}

function flattenSectionsForExport(blocks: DateReportBlock[], categories: MenuCategoryRow[]): SalesByCategoryFlatRow[] {
  const out: SalesByCategoryFlatRow[] = []
  for (const block of blocks) {
    for (const ch of block.channels) {
      for (const rec of ch.recorders) {
        for (const line of rec.categoryLines) {
          const indent = '  '.repeat(line.depth)
          const path = categoryBreadcrumb(categories, line.categoryId)
          out.push({
            saleDate: block.saleDate,
            channel: ch.label,
            recordedBy: rec.label,
            categoryPath: path,
            categoryDepth: line.depth,
            categoryCsv: `${indent}${path}`,
            amount: line.rollup,
          })
        }
        if (rec.uncatAmount >= 1e-6) {
          out.push({
            saleDate: block.saleDate,
            channel: ch.label,
            recordedBy: rec.label,
            categoryPath: 'Uncategorized',
            categoryDepth: 0,
            categoryCsv: 'Uncategorized',
            amount: rec.uncatAmount,
          })
        }
      }
    }
  }
  return out
}

export type MenuCategoriesSalesBlockProps = {
  businessId: string | undefined
  businessName: string | undefined
  allowed: boolean
  variant: 'catalog' | 'restaurant'
  canCreate: boolean
  canDeleteCategory: boolean
  canExportReports: boolean
}

function copyForVariant(variant: 'catalog' | 'restaurant') {
  if (variant === 'restaurant') {
    return {
      categoryTreeHeading: 'Categories',
      nameLabel: 'Menu name',
      parentLabel: 'Main menu',
      parentPlaceholder: 'Top level — leave empty, or search to nest under…',
      addButton: 'Add category',
      listId: 'restaurant-menu-parent-picker',
      deleteBranchBody:
        'This removes the whole branch under this category. Products in any of those categories will be unassigned from the menu until you assign a category again when editing each product.',
      deleteLeafBody:
        'Products that use this category will be unassigned from the menu until you assign another category.',
    }
  }
  return {
    categoryTreeHeading: 'Category tree',
    nameLabel: 'Category name',
    parentLabel: 'Under category',
    parentPlaceholder: 'Top level — or search to nest under…',
    addButton: 'Add category',
    listId: 'catalog-category-parent-picker',
    deleteBranchBody:
      'This removes the whole branch under this category. Products in any of those categories will be unassigned until you pick a category again when editing each product.',
    deleteLeafBody:
      'Products that use this category will be unassigned until you assign another category when editing each product.',
  }
}

export function MenuCategoriesSalesBlock({
  businessId,
  businessName,
  allowed,
  variant,
  canCreate,
  canDeleteCategory,
  canExportReports,
}: MenuCategoriesSalesBlockProps) {
  const copy = copyForVariant(variant)

  const [tab, setTab] = useState<CatalogTab>('categories')
  const [categories, setCategories] = useState<MenuCategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const [newCatName, setNewCatName] = useState('')
  const [newCatParent, setNewCatParent] = useState<string>('')

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
    hasChildren: boolean
  } | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  const [datePreset, setDatePreset] = useState<DatePreset>('today')
  const [from, setFrom] = useState(() => presetRange('today', new Date())!.from)
  const [to, setTo] = useState(() => presetRange('today', new Date())!.to)

  const [report, setReport] = useState<CategorySalesSummaryReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!businessId || !allowed) {
      setCategories([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const c = await fetchMenuCategories(businessId)
      setCategories(c)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load categories.')
    } finally {
      setLoading(false)
    }
  }, [businessId, allowed])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (datePreset === 'custom') return
    const r = presetRange(datePreset, new Date())
    if (r) {
      setFrom(r.from)
      setTo(r.to)
    }
  }, [datePreset])

  const loadReport = useCallback(() => {
    if (!businessId || !allowed) return
    setReportLoading(true)
    setReportError(null)
    void fetchSalesByCategoryReport(businessId, from, to)
      .then(setReport)
      .catch((e) => {
        setReport(null)
        setReportError(e instanceof ApiError ? e.message : 'Could not load report.')
      })
      .finally(() => setReportLoading(false))
  }, [businessId, allowed, from, to])

  useEffect(() => {
    if (tab !== 'summary' || !businessId || !allowed) return
    loadReport()
  }, [tab, businessId, allowed, loadReport])

  const treeOrdered = useMemo(() => orderedCategoryTree(categories), [categories])

  const parentPickerOptions = useMemo(
    () =>
      treeOrdered.map(({ row, depth }) => ({
        id: row.id,
        label: categoryBreadcrumb(categories, row.id),
        depth,
      })),
    [treeOrdered, categories],
  )

  const reportByDate = useMemo(() => buildReportByDate(report, categories), [report, categories])
  const exportRows = useMemo(() => flattenSectionsForExport(reportByDate, categories), [reportByDate, categories])
  const periodGrandTotal = useMemo(
    () => reportByDate.reduce((sum, b) => sum + b.dayTotal, 0),
    [reportByDate],
  )

  const ledgerByChannelSorted = useMemo(() => {
    const list = report?.ledgerTotalsByChannel ?? []
    return [...list].sort((a, b) =>
      ledgerChannelLabel(a).localeCompare(ledgerChannelLabel(b), undefined, { sensitivity: 'base' }),
    )
  }, [report])

  const ledgerColumnTotals = useMemo(
    () =>
      ledgerByChannelSorted.reduce(
        (acc, r) => ({
          customerSale: acc.customerSale + r.customerSaleLedgerTotal,
          walletFee: acc.walletFee + r.walletFeeLedgerTotal,
        }),
        { customerSale: 0, walletFee: 0 },
      ),
    [ledgerByChannelSorted],
  )

  const periodLabel = useMemo(() => `${from} → ${to}`, [from, to])

  const exportCsv = () => {
    if (!report) return
    const headers = ['Date', 'Payment channel', 'Recorded by', 'Category', 'Amount']
    const mainRows =
      exportRows.length > 0
        ? [
            ...exportRows.map((r) => [
              r.saleDate,
              r.channel,
              r.recordedBy,
              r.categoryCsv,
              r.amount.toFixed(2),
            ]),
            ['', '', '', 'Grand total', periodGrandTotal.toFixed(2)],
          ]
        : [['—', '—', '—', 'No sales in period', '0.00']]

    const ledgerCsv: string[][] = []
    if (ledgerByChannelSorted.length > 0) {
      ledgerCsv.push(['', '', '', '', ''])
      ledgerCsv.push([
        'Sales ledger by payment channel',
        'CUSTOMER_SALE (sum)',
        'WALLET_FEE (sum)',
        'Net',
        '',
      ])
      for (const r of ledgerByChannelSorted) {
        const net = r.customerSaleLedgerTotal - r.walletFeeLedgerTotal
        ledgerCsv.push([
          ledgerChannelLabel(r),
          r.customerSaleLedgerTotal.toFixed(2),
          r.walletFeeLedgerTotal.toFixed(2),
          net.toFixed(2),
          '',
        ])
      }
      const netTot = ledgerColumnTotals.customerSale - ledgerColumnTotals.walletFee
      ledgerCsv.push([
        'Total',
        ledgerColumnTotals.customerSale.toFixed(2),
        ledgerColumnTotals.walletFee.toFixed(2),
        netTot.toFixed(2),
        '',
      ])
    }

    downloadCsv(`sales-by-category-${from}-${to}.csv`, headers, [...mainRows, ...ledgerCsv])
  }

  const exportPdf = async () => {
    if (!report || !businessName) return
    const mainSections: PdfTableSection[] =
      exportRows.length === 0
        ? [
            {
              heading: 'Summary',
              headers: ['Note'],
              rows: [['No completed order payments in this period.']],
              columnWeights: [1],
              columnAlign: ['left'],
            },
          ]
        : [
            {
              heading: 'Sales by category',
              headers: ['Date', 'Payment channel', 'Recorded by', 'Category', 'Amount'],
              rows: exportRows.map((r) => [
                r.saleDate,
                r.channel,
                r.recordedBy,
                r.categoryCsv,
                formatMoney(r.amount, { decimals: 2 }),
              ]),
              rowsTypography: exportRows.map((r) =>
                r.categoryDepth === 0 ? { bold: true, fontSize: 9.5 } : { bold: false, fontSize: 8 },
              ),
              footerRow: [
                '',
                '',
                '',
                `Grand total · ${periodLabel}`,
                formatMoney(periodGrandTotal, { decimals: 2 }),
              ],
              columnWeights: [0.75, 1, 0.95, 2.05, 0.8],
              columnAlign: ['left', 'left', 'left', 'left', 'right'],
            },
          ]

    const ledgerSections: PdfTableSection[] =
      ledgerByChannelSorted.length > 0
        ? [
            {
              heading: 'Sales ledger by payment channel',
              headers: ['Channel', 'CUSTOMER_SALE (sum)', 'WALLET_FEE (sum)', 'Net'],
              rows: ledgerByChannelSorted.map((r) => {
                const net = r.customerSaleLedgerTotal - r.walletFeeLedgerTotal
                return [
                  ledgerChannelLabel(r),
                  formatMoney(r.customerSaleLedgerTotal, { decimals: 2 }),
                  formatMoney(r.walletFeeLedgerTotal, { decimals: 2 }),
                  formatMoney(net, { decimals: 2 }),
                ]
              }),
              footerRow: [
                'Total',
                formatMoney(ledgerColumnTotals.customerSale, { decimals: 2 }),
                formatMoney(ledgerColumnTotals.walletFee, { decimals: 2 }),
                formatMoney(ledgerColumnTotals.customerSale - ledgerColumnTotals.walletFee, { decimals: 2 }),
              ],
              columnWeights: [1.4, 0.85, 0.85, 0.75],
              columnAlign: ['left', 'right', 'right', 'right'],
            },
          ]
        : []

    const sections: PdfTableSection[] = [...mainSections, ...ledgerSections]

    await downloadFinancePdf({
      title: 'Summary sales by category',
      subtitle: `${businessName} · ${periodLabel} · ${report.currency}`,
      sections,
      filename: `sales-by-category-${from}-${to}.pdf`,
    })
  }

  const closeDeleteModal = () => {
    if (!deleteSubmitting) {
      setDeleteTarget(null)
    }
  }

  const runDeleteCategory = () => {
    if (!businessId || !deleteTarget) return
    void (async () => {
      setDeleteSubmitting(true)
      try {
        await deleteMenuCategory(businessId, deleteTarget.id)
        setFlash(deleteTarget.hasChildren ? 'Category tree deleted.' : 'Category deleted.')
        setDeleteTarget(null)
        void load()
      } catch (err) {
        setFlash(err instanceof ApiError ? err.message : 'Could not delete.')
      } finally {
        setDeleteSubmitting(false)
      }
    })()
  }

  const presetButtons: { id: DatePreset; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'current_quarter', label: 'Current quarter' },
    { id: 'last_day', label: 'Last day' },
    { id: 'last_week', label: 'Last week' },
    { id: 'last_month', label: 'Last month' },
    { id: 'custom', label: 'Custom' },
  ]

  if (!allowed) return null

  return (
    <>
      <FlashNotice message={flash} onDismiss={() => setFlash(null)} />

      <ConfirmModal
        open={deleteTarget != null}
        title={
          deleteTarget == null
            ? ''
            : deleteTarget.hasChildren
              ? `Delete “${deleteTarget.name}” and subcategories?`
              : `Delete “${deleteTarget.name}”?`
        }
        variant="danger"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleteSubmitting}
        onCancel={closeDeleteModal}
        onConfirm={runDeleteCategory}
      >
        {deleteTarget?.hasChildren ? <p>{copy.deleteBranchBody}</p> : <p>{copy.deleteLeafBody}</p>}
      </ConfirmModal>

      {error ? <div className="border-b border-red-200 bg-red-50 py-3 text-sm text-red-800">{error}</div> : null}

      <div className="space-y-0">
        <div className="flex gap-8 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setTab('categories')}
            className={`relative pb-3 text-sm font-medium transition-colors ${
              tab === 'categories' ? 'text-teal-800' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Category
            {tab === 'categories' ? (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" aria-hidden />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setTab('summary')}
            className={`relative pb-3 text-sm font-medium transition-colors ${
              tab === 'summary' ? 'text-teal-800' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Summary sales by Category
            {tab === 'summary' ? (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" aria-hidden />
            ) : null}
          </button>
        </div>

        {tab === 'categories' ? (
          <div className="border-b border-slate-200 py-8">
            {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}
            {!loading ? (
              <>
                <h2 className="text-base font-semibold text-slate-900">{copy.categoryTreeHeading}</h2>

                <form
                  className="mt-6 flex flex-col gap-4 border-b border-slate-200 pb-8 sm:flex-row sm:items-end"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!businessId || !canCreate || !newCatName.trim()) return
                    try {
                      await createMenuCategory(businessId, {
                        name: newCatName.trim(),
                        parentId: newCatParent || null,
                      })
                      setNewCatName('')
                      setNewCatParent('')
                      setFlash('Category created.')
                      void load()
                    } catch (err) {
                      setFlash(err instanceof ApiError ? err.message : 'Could not create category.')
                    }
                  }}
                >
                  <label className="block flex-1">
                    <span className="mb-1 block text-xs font-medium text-slate-600">{copy.nameLabel}</span>
                    <input
                      value={newCatName}
                      onChange={(ev) => setNewCatName(ev.target.value)}
                      className="w-full border-b border-slate-200 bg-transparent py-2 text-sm outline-none focus:border-teal-500"
                      placeholder={variant === 'restaurant' ? 'e.g. Starters' : 'e.g. Beverages'}
                    />
                  </label>
                  <div className="w-full sm:w-64 sm:shrink-0">
                    <SearchableListbox
                      fieldLabel={copy.parentLabel}
                      options={parentPickerOptions}
                      value={newCatParent}
                      onChange={setNewCatParent}
                      placeholder={copy.parentPlaceholder}
                      listId={copy.listId}
                      disabled={!canCreate}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!canCreate}
                    className="inline-flex items-center justify-center gap-2 border-b-2 border-teal-600 pb-2 text-sm font-semibold text-teal-700 hover:text-teal-900 disabled:border-slate-300 disabled:text-slate-400"
                  >
                    <Plus className="h-4 w-4" />
                    {copy.addButton}
                  </button>
                </form>

                <div className="mt-8 overflow-x-auto">
                  {categories.length === 0 ? (
                    <p className="border-b border-slate-200 py-6 text-center text-sm text-slate-500">
                      No categories yet.
                    </p>
                  ) : (
                    <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                          <th className="py-3 pr-4 font-medium">Category</th>
                          <th className="py-3 pr-4 font-medium">Path</th>
                          <th className="w-28 py-3 text-right font-medium"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {treeOrdered.map(({ row, depth }) => {
                          const path = categoryBreadcrumb(categories, row.id)
                          const hasChildren = categories.some((c) => c.parentId === row.id)
                          return (
                            <tr key={row.id} className="border-b border-slate-200">
                              <td className="py-3 pr-4 align-top">
                                <span
                                  className="font-medium text-slate-900"
                                  style={{ paddingLeft: `${depth * 0.75}rem` }}
                                >
                                  {row.name}
                                </span>
                              </td>
                              <td className="max-w-md py-3 pr-4 align-top text-slate-500">{path}</td>
                              <td className="py-3 text-right align-top">
                                <button
                                  type="button"
                                  disabled={!canDeleteCategory}
                                  onClick={() => {
                                    if (!canDeleteCategory) return
                                    setDeleteTarget({
                                      id: row.id,
                                      name: row.name,
                                      hasChildren,
                                    })
                                  }}
                                  className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline disabled:opacity-40"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="space-y-0 py-8">
            <div className="border-b border-slate-200 pb-6">
              <h2 className="text-base font-semibold text-slate-900">Summary sales by category</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Completed POS order payments, one row per UTC day. Category amounts are grouped by payment channel,
                staff recorder, and category (parent totals include nested categories), and include allocated wallet fee
                deductions. The table below shows full payment-level totals from the sales ledger (
                <span className="font-mono text-xs">CUSTOMER_SALE</span> vs{' '}
                <span className="font-mono text-xs">WALLET_FEE</span>) per channel for the same period.
              </p>
            </div>

            <div className="flex flex-col gap-5 border-b border-slate-200 py-6">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Date range</span>
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {presetButtons.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setDatePreset(b.id)}
                    className={`border-b-2 px-0.5 pb-1.5 text-xs font-medium transition-colors ${
                      datePreset === b.id
                        ? 'border-teal-600 text-teal-900'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-6">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">From</span>
                  <input
                    type="date"
                    value={from}
                    disabled={datePreset !== 'custom'}
                    onChange={(e) => {
                      setDatePreset('custom')
                      setFrom(e.target.value)
                    }}
                    className="block border-b border-slate-200 bg-transparent py-2 text-sm outline-none focus:border-teal-500 disabled:text-slate-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">To</span>
                  <input
                    type="date"
                    value={to}
                    disabled={datePreset !== 'custom'}
                    onChange={(e) => {
                      setDatePreset('custom')
                      setTo(e.target.value)
                    }}
                    className="block border-b border-slate-200 bg-transparent py-2 text-sm outline-none focus:border-teal-500 disabled:text-slate-400"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => loadReport()}
                  className="border-b-2 border-teal-600 pb-2 text-sm font-semibold text-teal-700 hover:text-teal-900"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-b border-slate-200 py-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                <span className="font-medium text-slate-800">{periodLabel}</span>
                {report?.currency ? <span className="text-slate-500"> · {report.currency}</span> : null}
              </p>
              {canExportReports ? (
                <div className="flex flex-wrap gap-4">
                  <button
                    type="button"
                    disabled={!report || reportLoading}
                    onClick={() => exportCsv()}
                    className="inline-flex items-center gap-1.5 border-b border-slate-800 pb-1 text-sm font-medium text-slate-800 hover:border-teal-600 hover:text-teal-800 disabled:opacity-40"
                  >
                    <FileDown className="h-4 w-4" />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    disabled={!report || reportLoading}
                    onClick={() => void exportPdf()}
                    className="inline-flex items-center gap-1.5 border-b border-slate-800 pb-1 text-sm font-medium text-slate-800 hover:border-teal-600 hover:text-teal-800 disabled:opacity-40"
                  >
                    <FileText className="h-4 w-4" />
                    Export PDF
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Export needs the <strong>Export reports</strong> permission.
                </p>
              )}
            </div>

            {reportError ? (
              <div className="border-b border-red-200 py-3 text-sm text-red-800">{reportError}</div>
            ) : null}

            {reportLoading ? (
              <p className="border-b border-slate-200 py-4 text-sm text-slate-500">Loading report…</p>
            ) : null}

            {!reportLoading && report ? (
              <div className="overflow-x-auto pt-6">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                      <th className="py-3 pr-3 font-medium whitespace-nowrap">Date</th>
                      <th className="py-3 pr-3 font-medium">Payment channel</th>
                      <th className="py-3 pr-3 font-medium">Recorded by</th>
                      <th className="py-3 pr-3 font-medium">Category</th>
                      <th className="py-3 text-right font-medium whitespace-nowrap">Amount</th>
                    </tr>
                  </thead>
                  {reportByDate.length === 0 ? (
                    <tbody>
                      <tr className="border-b border-slate-200">
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No completed order payments in this period.
                        </td>
                      </tr>
                    </tbody>
                  ) : (
                    <>
                      {reportByDate.map((block) => {
                        const blockRows = flattenSectionsForExport([block], categories)
                        return (
                          <tbody key={block.saleDate}>
                            {blockRows.map((r, i) => {
                              const parentRow = r.categoryDepth === 0
                              return (
                                <tr key={`${block.saleDate}-${i}`} className="border-b border-slate-200">
                                  <td
                                    className={`py-3 pr-3 align-top tabular-nums whitespace-nowrap ${
                                      parentRow ? 'text-sm font-semibold text-slate-700' : 'text-slate-600'
                                    }`}
                                  >
                                    {r.saleDate}
                                  </td>
                                  <td
                                    className={`py-3 pr-3 align-top ${
                                      parentRow ? 'text-sm font-semibold text-slate-900' : 'text-slate-800'
                                    }`}
                                  >
                                    {r.channel}
                                  </td>
                                  <td
                                    className={`py-3 pr-3 align-top ${
                                      parentRow ? 'text-sm font-semibold text-slate-800' : 'text-slate-700'
                                    }`}
                                  >
                                    {r.recordedBy}
                                  </td>
                                  <td
                                    style={{ paddingLeft: `${4 + r.categoryDepth * 14}px` }}
                                    className={
                                      parentRow
                                        ? 'py-3 pr-3 align-top text-base font-bold leading-snug text-slate-900'
                                        : 'py-3 pr-3 align-top text-sm font-normal leading-snug text-slate-700'
                                    }
                                  >
                                    {r.categoryPath}
                                  </td>
                                  <td
                                    className={
                                      parentRow
                                        ? 'py-3 text-right align-top text-base font-bold tabular-nums text-slate-900 whitespace-nowrap'
                                        : 'py-3 text-right align-top text-sm font-medium tabular-nums text-slate-900 whitespace-nowrap'
                                    }
                                  >
                                    {formatMoney(r.amount, { decimals: 2 })}
                                  </td>
                                </tr>
                              )
                            })}
                            <tr className="border-b border-slate-300 bg-slate-50/80 text-slate-800">
                              <td colSpan={4} className="py-2.5 pr-3 text-xs font-semibold uppercase tracking-wide">
                                Day subtotal · {block.saleDate}
                              </td>
                              <td className="py-2.5 text-right text-sm font-semibold tabular-nums">
                                {formatMoney(block.dayTotal, { decimals: 2 })}
                              </td>
                            </tr>
                          </tbody>
                        )
                      })}
                      <tfoot>
                        <tr className="border-t-2 border-slate-900">
                          <td colSpan={5} className="p-0 pt-3 pb-3">
                            <div className="flex justify-end pr-1">
                              <div className="inline-block max-w-full text-right [border-bottom-style:double] border-b-[3px] border-slate-900 pb-2">
                                <div className="flex flex-row flex-wrap items-baseline justify-end gap-x-3 gap-y-0.5">
                                  <span className="text-sm font-bold text-slate-900 whitespace-nowrap">
                                    Grand total · {periodLabel}
                                  </span>
                                  <span className="text-lg font-bold tabular-nums text-slate-900 whitespace-nowrap">
                                    {formatMoney(periodGrandTotal, { decimals: 2 })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </tfoot>
                    </>
                  )}
                </table>

                {ledgerByChannelSorted.length > 0 ? (
                  <div className="mt-12 overflow-x-auto border-t border-slate-200 pt-10">
                    <h3 className="text-sm font-semibold text-slate-900">Sales ledger by payment channel</h3>
                    <p className="mt-1 max-w-3xl text-xs text-slate-500">
                      Sums of succeeded ledger entries by completed order payment; dated by ledger{' '}
                      <span className="font-mono">succeededAt</span> (UTC day range above).
                    </p>
                    <table className="mt-4 w-full min-w-[520px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                          <th className="py-3 pr-3 font-medium">Payment channel</th>
                          <th className="py-3 pr-3 text-right font-medium whitespace-nowrap">Customer sale (ledger)</th>
                          <th className="py-3 pr-3 text-right font-medium whitespace-nowrap">Wallet fee (ledger)</th>
                          <th className="py-3 text-right font-medium whitespace-nowrap">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerByChannelSorted.map((r) => {
                          const net = r.customerSaleLedgerTotal - r.walletFeeLedgerTotal
                          return (
                            <tr key={`${r.paymentMethod}|${r.paymentProvider}|${r.gatewayCode ?? ''}`} className="border-b border-slate-200">
                              <td className="py-3 pr-3 text-slate-800">{ledgerChannelLabel(r)}</td>
                              <td className="py-3 pr-3 text-right tabular-nums text-slate-800">
                                {formatMoney(r.customerSaleLedgerTotal, { decimals: 2 })}
                              </td>
                              <td className="py-3 pr-3 text-right tabular-nums text-slate-800">
                                {formatMoney(r.walletFeeLedgerTotal, { decimals: 2 })}
                              </td>
                              <td className="py-3 text-right tabular-nums font-medium text-slate-900">
                                {formatMoney(net, { decimals: 2 })}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-50/80">
                          <td className="py-2.5 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-700">
                            Total
                          </td>
                          <td className="py-2.5 pr-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                            {formatMoney(ledgerColumnTotals.customerSale, { decimals: 2 })}
                          </td>
                          <td className="py-2.5 pr-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                            {formatMoney(ledgerColumnTotals.walletFee, { decimals: 2 })}
                          </td>
                          <td className="py-2.5 text-right text-sm font-semibold tabular-nums text-slate-900">
                            {formatMoney(ledgerColumnTotals.customerSale - ledgerColumnTotals.walletFee, {
                              decimals: 2,
                            })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  )
}
