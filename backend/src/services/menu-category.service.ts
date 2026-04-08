import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { assertMenuCategoryCatalogBusiness } from "./restaurant-guard.service.js";

export async function listMenuCategoriesFlat(businessId: string) {
  await assertMenuCategoryCatalogBusiness(businessId);
  return prisma.menuCategory.findMany({
    where: { businessId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

async function categoryBelongsToBusiness(categoryId: string, businessId: string) {
  const row = await prisma.menuCategory.findFirst({
    where: { id: categoryId, businessId },
    select: { id: true },
  });
  return Boolean(row);
}

async function assertNoAncestorCycle(categoryId: string, newParentId: string | null) {
  if (!newParentId) {
    return;
  }
  let current: string | null = newParentId;
  const seen = new Set<string>();
  while (current) {
    if (current === categoryId) {
      throw new HttpError(400, "Category cannot be its own ancestor.");
    }
    if (seen.has(current)) {
      throw new HttpError(400, "Invalid parent hierarchy.");
    }
    seen.add(current);
    const parentRow: { parentId: string | null } | null = await prisma.menuCategory.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = parentRow?.parentId ?? null;
  }
}

export async function createMenuCategory(input: {
  businessId: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
}) {
  await assertMenuCategoryCatalogBusiness(input.businessId);
  const name = input.name.trim();
  if (name.length < 1) {
    throw new HttpError(400, "Category name is required.");
  }
  if (input.parentId) {
    const ok = await categoryBelongsToBusiness(input.parentId, input.businessId);
    if (!ok) {
      throw new HttpError(400, "Parent category not found for this business.");
    }
  }

  return prisma.menuCategory.create({
    data: {
      businessId: input.businessId,
      name,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateMenuCategory(input: {
  businessId: string;
  categoryId: string;
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
}) {
  await assertMenuCategoryCatalogBusiness(input.businessId);
  const row = await prisma.menuCategory.findFirst({
    where: { id: input.categoryId, businessId: input.businessId },
  });
  if (!row) {
    throw new HttpError(404, "Category not found.");
  }

  if (input.parentId !== undefined && input.parentId !== null) {
    const ok = await categoryBelongsToBusiness(input.parentId, input.businessId);
    if (!ok) {
      throw new HttpError(400, "Parent category not found for this business.");
    }
    await assertNoAncestorCycle(row.id, input.parentId);
  }

  const data: { name?: string; parentId?: string | null; sortOrder?: number } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 1) {
      throw new HttpError(400, "Category name cannot be empty.");
    }
    data.name = name;
  }
  if (input.parentId !== undefined) {
    data.parentId = input.parentId;
  }
  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder;
  }

  return prisma.menuCategory.update({
    where: { id: row.id },
    data,
  });
}

/** Post-order IDs: children first, then parent (safe for FK Restrict on parentId). */
function subtreePostOrderDeletionIds(
  rootId: string,
  rows: { id: string; parentId: string | null }[],
): string[] {
  const childrenByParent = new Map<string | null, string[]>();
  for (const r of rows) {
    const p = r.parentId;
    if (!childrenByParent.has(p)) {
      childrenByParent.set(p, []);
    }
    childrenByParent.get(p)!.push(r.id);
  }
  const ordered: string[] = [];
  const dfs = (id: string) => {
    const kids = childrenByParent.get(id) ?? [];
    for (const k of kids) {
      dfs(k);
    }
    ordered.push(id);
  };
  dfs(rootId);
  return ordered;
}

/**
 * Deletes one category. If it has subcategories, deletes the whole subtree (deepest first).
 * Products on deleted categories get menuCategoryId cleared (schema onDelete: SetNull).
 */
export async function deleteMenuCategory(businessId: string, categoryId: string) {
  await assertMenuCategoryCatalogBusiness(businessId);
  const row = await prisma.menuCategory.findFirst({
    where: { id: categoryId, businessId },
  });
  if (!row) {
    throw new HttpError(404, "Category not found.");
  }

  const allRows = await prisma.menuCategory.findMany({
    where: { businessId },
    select: { id: true, parentId: true },
  });

  const ordered = subtreePostOrderDeletionIds(row.id, allRows);

  await prisma.$transaction(ordered.map((id) => prisma.menuCategory.delete({ where: { id } })));
}

/** Menu categories that have no children (products may only use these). */
export async function assertMenuCategoryIsLeafForBusiness(
  businessId: string,
  menuCategoryId: string,
): Promise<{ id: string; name: string }> {
  const row = await prisma.menuCategory.findFirst({
    where: { id: menuCategoryId, businessId },
  });
  if (!row) {
    throw new HttpError(400, "Menu category not found for this business.");
  }
  const child = await prisma.menuCategory.findFirst({
    where: { parentId: row.id },
    select: { id: true },
  });
  if (child) {
    throw new HttpError(400, "Products can only be assigned to leaf categories (categories with no subcategories).");
  }
  return { id: row.id, name: row.name };
}
