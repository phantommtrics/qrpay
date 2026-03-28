import { PlanCode } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";

const SLUG_PATTERN = /^[a-z][a-z0-9.]*$/;

/** Order matches platform convention: view, edit, delete, export, create. */
const CRUD_ACTION_SUFFIXES = ["view", "edit", "delete", "export", "create"] as const;

/**
 * Strip trailing .view / .edit / … so "inventory" or "inventory.view" both yield base "inventory".
 */
function normalizeResourceBaseSlug(slug: string): string {
  let s = slug.trim().toLowerCase();
  for (;;) {
    const dot = s.lastIndexOf(".");
    if (dot <= 0) {
      break;
    }
    const suffix = s.slice(dot + 1);
    if (!CRUD_ACTION_SUFFIXES.includes(suffix as (typeof CRUD_ACTION_SUFFIXES)[number])) {
      break;
    }
    s = s.slice(0, dot);
  }
  return s;
}

const CRUD_ACTION_LABEL: Record<(typeof CRUD_ACTION_SUFFIXES)[number], string> = {
  view: "View",
  edit: "Edit",
  delete: "Delete",
  export: "Export",
  create: "Create",
};

function displayNameForCrudAction(
  moduleDisplayName: string,
  action: (typeof CRUD_ACTION_SUFFIXES)[number],
) {
  return `${CRUD_ACTION_LABEL[action]} ${moduleDisplayName}`;
}

export async function listSystemServices() {
  return prisma.systemService.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { products: true } },
    },
  });
}

export async function createSystemService(input: {
  name: string;
  description?: string | null;
  sortOrder?: number;
}) {
  const name = input.name.trim();
  if (!name) {
    throw new HttpError(400, "Service name is required.");
  }
  return prisma.systemService.create({
    data: {
      name,
      description: input.description?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateSystemService(
  id: string,
  input: { name?: string; description?: string | null; sortOrder?: number },
) {
  const existing = await prisma.systemService.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Service not found.");
  }
  return prisma.systemService.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
}

export async function deleteSystemService(id: string) {
  const existing = await prisma.systemService.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Service not found.");
  }
  await prisma.systemService.delete({ where: { id } });
}

export async function listSystemProducts(serviceId?: string) {
  return prisma.systemProduct.findMany({
    where: serviceId ? { serviceId } : undefined,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { service: { select: { id: true, name: true } } },
  });
}

export async function createSystemProduct(input: {
  serviceId: string;
  name: string;
  slug: string;
  description?: string | null;
  sortOrder?: number;
}) {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if (!name) {
    throw new HttpError(400, "Product name is required.");
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new HttpError(
      400,
      "Slug must start with a letter and contain only lowercase letters, digits, and dots.",
    );
  }
  const service = await prisma.systemService.findUnique({
    where: { id: input.serviceId },
  });
  if (!service) {
    throw new HttpError(404, "Service not found.");
  }

  const resourceBase = normalizeResourceBaseSlug(slug);
  if (!resourceBase) {
    throw new HttpError(400, "Resource slug (base) is required.");
  }
  if (!SLUG_PATTERN.test(resourceBase)) {
    throw new HttpError(
      400,
      "Resource base slug must start with a letter and contain only lowercase letters, digits, and dots.",
    );
  }

  for (const action of CRUD_ACTION_SUFFIXES) {
    const full = `${resourceBase}.${action}`;
    if (!SLUG_PATTERN.test(full)) {
      throw new HttpError(400, `Invalid derived slug: ${full}`);
    }
  }

  return prisma.$transaction(async (tx) => {
    let viewProduct: Awaited<ReturnType<typeof tx.systemProduct.findUnique>> = null;
    let createdAny = false;

    for (let i = 0; i < CRUD_ACTION_SUFFIXES.length; i += 1) {
      const action = CRUD_ACTION_SUFFIXES[i];
      const siblingSlug = `${resourceBase}.${action}`;
      const existing = await tx.systemProduct.findUnique({
        where: { slug: siblingSlug },
      });
      if (existing) {
        if (action === "view") {
          viewProduct = existing;
        }
        continue;
      }
      createdAny = true;
      const row = await tx.systemProduct.create({
        data: {
          serviceId: input.serviceId,
          name: displayNameForCrudAction(name, action),
          slug: siblingSlug,
          description: input.description?.trim() || null,
          sortOrder: input.sortOrder != null ? input.sortOrder + i : i,
        },
      });
      if (action === "view") {
        viewProduct = row;
      }
    }

    if (!createdAny) {
      throw new HttpError(
        400,
        "All five CRUD entitlement products already exist for this base slug (.view, .edit, .delete, .export, .create).",
      );
    }

    if (!viewProduct) {
      throw new HttpError(500, "Expected .view product after create.");
    }

    return viewProduct;
  });
}

export async function updateSystemProduct(
  id: string,
  input: {
    serviceId?: string;
    name?: string;
    slug?: string;
    description?: string | null;
    sortOrder?: number;
  },
) {
  const existing = await prisma.systemProduct.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "System product not found.");
  }
  if (input.serviceId) {
    const service = await prisma.systemService.findUnique({
      where: { id: input.serviceId },
    });
    if (!service) {
      throw new HttpError(404, "Service not found.");
    }
  }
  let slug = input.slug;
  if (slug !== undefined) {
    slug = slug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug)) {
      throw new HttpError(
        400,
        "Slug must start with a letter and contain only lowercase letters, digits, and dots.",
      );
    }
  }
  return prisma.systemProduct.update({
    where: { id },
    data: {
      ...(input.serviceId !== undefined ? { serviceId: input.serviceId } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
}

export async function deleteSystemProduct(id: string) {
  const existing = await prisma.systemProduct.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "System product not found.");
  }
  await prisma.systemProduct.delete({ where: { id } });
}

export async function getPlanEntitlementsDetail(planCode: PlanCode) {
  const plan = await prisma.plan.findUnique({
    where: { code: planCode },
    include: {
      planSystemProducts: {
        include: {
          systemProduct: { include: { service: true } },
        },
      },
    },
  });
  if (!plan) {
    throw new HttpError(404, "Plan not found.");
  }
  return plan;
}

export async function setPlanEntitlements(planCode: PlanCode, systemProductIds: string[]) {
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) {
    throw new HttpError(404, "Plan not found.");
  }
  const uniqueIds = Array.from(new Set(systemProductIds));
  if (uniqueIds.length > 0) {
    const found = await prisma.systemProduct.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    if (found.length !== uniqueIds.length) {
      throw new HttpError(400, "One or more system product ids are invalid.");
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.planSystemProduct.deleteMany({ where: { planId: plan.id } });
    for (const systemProductId of uniqueIds) {
      await tx.planSystemProduct.create({
        data: { planId: plan.id, systemProductId },
      });
    }
  });
  return getPlanEntitlementsDetail(planCode);
}
