import { prisma } from "../lib/prisma.js";
import { PLATFORM_MODULES_SEED } from "../config/platform-modules.js";

/**
 * Upserts every module from `PLATFORM_MODULES_SEED` so new routes (e.g. billing, move users)
 * always appear in Security → Role templates without a manual DB seed.
 */
export async function ensurePlatformModulesSeeded(): Promise<void> {
  for (const m of PLATFORM_MODULES_SEED) {
    await prisma.platformModule.upsert({
      where: { slug: m.slug },
      create: {
        slug: m.slug,
        label: m.label,
        sortOrder: m.sortOrder,
      },
      update: {
        label: m.label,
        sortOrder: m.sortOrder,
      },
    });
  }
}
