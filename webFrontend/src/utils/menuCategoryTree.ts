import type { MenuCategoryRow } from '../services/subscriptionApi'

export function categoryBreadcrumb(rows: MenuCategoryRow[], id: string): string {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const parts: string[] = []
  let cur: MenuCategoryRow | undefined = byId.get(id)
  let guard = 0
  while (cur && guard++ < 32) {
    parts.unshift(cur.name)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return parts.join(' → ')
}

/** Categories with no children — only these can hold products. */
export function leafMenuCategories(rows: MenuCategoryRow[]): MenuCategoryRow[] {
  return rows.filter((r) => !rows.some((c) => c.parentId === r.id))
}

export type OrderedCategoryNode = { row: MenuCategoryRow; depth: number }

/** Depth-first preorder: roots and descendants by `sortOrder`, then name. */
export function orderedCategoryTree(rows: MenuCategoryRow[]): OrderedCategoryNode[] {
  const byParent = new Map<string | null, MenuCategoryRow[]>()
  for (const r of rows) {
    const k = r.parentId
    if (!byParent.has(k)) {
      byParent.set(k, [])
    }
    byParent.get(k)!.push(r)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  }
  const out: OrderedCategoryNode[] = []
  const walk = (parentId: string | null, depth: number) => {
    const kids = byParent.get(parentId) ?? []
    for (const row of kids) {
      out.push({ row, depth })
      walk(row.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}
