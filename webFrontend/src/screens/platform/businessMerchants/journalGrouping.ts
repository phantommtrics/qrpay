import type {
  PlatformMerchantCategoryJournal,
  PlatformMerchantCategoryJournalCategory,
  PlatformMerchantCategoryJournalRow,
} from '../../../services/catalogReportsApi'
import { categoryBreadcrumb } from '../../../utils/menuCategoryTree'
import { humanizeEnumToken } from './reportDatePresets'

const UNCATEGORIZED_KEY = '__uncategorized__'

function channelKey(r: PlatformMerchantCategoryJournalRow): string {
  return `${r.paymentMethod}|${r.paymentProvider}|${r.gatewayCode ?? ''}`
}

function channelLabel(r: PlatformMerchantCategoryJournalRow): string {
  return `${humanizeEnumToken(r.paymentMethod)} | ${humanizeEnumToken(r.paymentProvider)}`
}

function recorderKey(r: PlatformMerchantCategoryJournalRow): string {
  return r.recordedByUserId ?? UNCATEGORIZED_KEY
}

function recorderLabel(r: PlatformMerchantCategoryJournalRow): string {
  return r.recordedByName?.trim() ? r.recordedByName.trim() : 'Guest / unassigned'
}

type CategoryRow = {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
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

type MerchantSection = {
  businessId: string
  businessName: string
  channels: ChannelSection[]
  merchantDayTotal: number
}

export type DateReportBlock = {
  saleDate: string
  merchants: MerchantSection[]
  dayTotal: number
}

export type JournalFlatRow = {
  saleDate: string
  merchant: string
  channel: string
  recordedBy: string
  categoryPath: string
  categoryDepth: number
  categoryCsv: string
  amount: number
}

function toCategoryRows(categories: PlatformMerchantCategoryJournalCategory[], businessId: string): CategoryRow[] {
  return categories
    .filter((c) => c.businessId === businessId)
    .map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      sortOrder: c.sortOrder,
    }))
}

function buildChannelSectionsFromRows(
  rows: PlatformMerchantCategoryJournalRow[],
  categories: CategoryRow[],
): ChannelSection[] {
  if (rows.length === 0) return []

  const byId = new Map(categories.map((c) => [c.id, c]))
  const childrenByParent = new Map<string | null, CategoryRow[]>()
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

export function buildReportByDate(report: PlatformMerchantCategoryJournal | null): DateReportBlock[] {
  if (!report || report.rows.length === 0) return []

  const byDate = new Map<string, PlatformMerchantCategoryJournalRow[]>()
  for (const r of report.rows) {
    if (Math.abs(r.amount) < 1e-9) continue
    const list = byDate.get(r.saleDate) ?? []
    list.push(r)
    byDate.set(r.saleDate, list)
  }

  const sortedDates = [...byDate.keys()].sort()
  return sortedDates.map((saleDate) => {
    const dayRows = byDate.get(saleDate) ?? []
    const byMerchant = new Map<string, PlatformMerchantCategoryJournalRow[]>()
    for (const r of dayRows) {
      const list = byMerchant.get(r.businessId) ?? []
      list.push(r)
      byMerchant.set(r.businessId, list)
    }

    const merchants: MerchantSection[] = [...byMerchant.entries()]
      .map(([businessId, rows]) => {
        const categories = toCategoryRows(report.categories, businessId)
        const channels = buildChannelSectionsFromRows(rows, categories)
        const merchantDayTotal = rows.reduce((s, x) => s + x.amount, 0)
        return {
          businessId,
          businessName: rows[0]?.businessName ?? 'Unknown merchant',
          channels,
          merchantDayTotal,
        }
      })
      .sort((a, b) => a.businessName.localeCompare(b.businessName, undefined, { sensitivity: 'base' }))

    const dayTotal = dayRows.reduce((s, x) => s + x.amount, 0)
    return { saleDate, merchants, dayTotal }
  })
}

export function flattenSectionsForExport(
  blocks: DateReportBlock[],
  categories: PlatformMerchantCategoryJournalCategory[],
): JournalFlatRow[] {
  const out: JournalFlatRow[] = []
  for (const block of blocks) {
    for (const merch of block.merchants) {
      const merchCats = toCategoryRows(categories, merch.businessId).map((c) => ({
        ...c,
        createdAt: '',
        updatedAt: '',
      }))
      for (const ch of merch.channels) {
        for (const rec of ch.recorders) {
          for (const line of rec.categoryLines) {
            const indent = '  '.repeat(line.depth)
            const path = categoryBreadcrumb(merchCats, line.categoryId)
            out.push({
              saleDate: block.saleDate,
              merchant: merch.businessName,
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
              merchant: merch.businessName,
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
  }
  return out
}
