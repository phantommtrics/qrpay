import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

export async function listBusinessContacts(businessId: string, query?: string) {
  const q = query?.trim();
  return prisma.businessContact.findMany({
    where: {
      businessId,
      ...(q && q.length > 0
        ? {
            name: { contains: q, mode: "insensitive" as const },
          }
        : {}),
    },
    orderBy: [{ name: "asc" }],
    take: 50,
  });
}

export async function createBusinessContact(
  businessId: string,
  input: { name: string; email?: string | null; phone?: string | null; notes?: string | null },
) {
  const name = input.name.trim();
  if (!name) {
    throw new HttpError(400, "Contact name is required.");
  }
  if (name.length > 200) {
    throw new HttpError(400, "Contact name is too long.");
  }
  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;
  const notes = input.notes?.trim() || null;
  if (email && email.length > 320) {
    throw new HttpError(400, "Email is too long.");
  }
  if (phone && phone.length > 64) {
    throw new HttpError(400, "Phone is too long.");
  }

  return prisma.businessContact.create({
    data: {
      businessId,
      name,
      email,
      phone,
      notes,
    },
  });
}

export async function getBusinessContactOrThrow(businessId: string, contactId: string) {
  const row = await prisma.businessContact.findFirst({
    where: { id: contactId, businessId },
  });
  if (!row) {
    throw new HttpError(404, "Contact not found.");
  }
  return row;
}
