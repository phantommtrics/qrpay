import type { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { isRestaurantIndustry } from "./product.service.js";
import { createOrder } from "./sale.service.js";

type ProductRow = Prisma.ProductGetPayload<Record<string, never>>;

export type MenuTreeNode = {
  id: string;
  name: string;
  sortOrder: number;
  children: MenuTreeNode[];
  products: ProductRow[];
};

function sortMenuNodes(nodes: MenuTreeNode[]) {
  nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  for (const n of nodes) {
    sortMenuNodes(n.children);
  }
}

export async function resolveRestaurantGuestContext(businessSlug: string, tableToken: string) {
  const slug = businessSlug.trim();
  const token = tableToken.trim();
  if (!slug || !token) {
    throw new HttpError(404, "Not found.");
  }

  const business = await prisma.business.findUnique({
    where: { slug },
  });
  if (!business || !isRestaurantIndustry(business.industry)) {
    throw new HttpError(404, "Not found.");
  }

  const table = await prisma.diningTable.findFirst({
    where: {
      businessId: business.id,
      publicToken: token,
      isActive: true,
    },
  });
  if (!table) {
    throw new HttpError(404, "Not found.");
  }

  return { business, table };
}

function isLeafCategory(categoryId: string, all: { id: string; parentId: string | null }[]) {
  return !all.some((c) => c.parentId === categoryId);
}

export async function buildRestaurantMenuTree(businessId: string): Promise<{
  categories: MenuTreeNode[];
  uncategorizedProducts: ProductRow[];
}> {
  const categories = await prisma.menuCategory.findMany({
    where: { businessId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const products = await prisma.product.findMany({
    where: { businessId },
    orderBy: { name: "asc" },
  });

  const nodeMap = new Map<string, MenuTreeNode>();

  for (const c of categories) {
    nodeMap.set(c.id, {
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      children: [],
      products: [],
    });
  }

  const roots: MenuTreeNode[] = [];
  for (const c of categories) {
    const node = nodeMap.get(c.id)!;
    if (c.parentId && nodeMap.has(c.parentId)) {
      nodeMap.get(c.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  sortMenuNodes(roots);

  const uncategorized: ProductRow[] = [];
  for (const p of products) {
    if (!p.menuCategoryId || !nodeMap.has(p.menuCategoryId)) {
      uncategorized.push(p);
      continue;
    }
    if (!isLeafCategory(p.menuCategoryId, categories)) {
      uncategorized.push(p);
      continue;
    }
    const node = nodeMap.get(p.menuCategoryId)!;
    node.products.push(p);
  }

  return {
    categories: roots,
    uncategorizedProducts: uncategorized,
  };
}

export async function getRestaurantGuestMenuPayload(businessSlug: string, tableToken: string) {
  const { business, table } = await resolveRestaurantGuestContext(businessSlug, tableToken);
  const menu = await buildRestaurantMenuTree(business.id);
  return { business, table, menu };
}

export async function createRestaurantGuestOrder(input: {
  businessSlug: string;
  tableToken: string;
  lines: { productId: string; quantity: number }[];
}) {
  const { business, table } = await resolveRestaurantGuestContext(
    input.businessSlug,
    input.tableToken,
  );
  return createOrder({
    businessId: business.id,
    userId: null,
    lines: input.lines,
    diningTableId: table.id,
    tableLabelSnapshot: table.label,
  });
}
