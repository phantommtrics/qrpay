import {
  StaffCreationNotificationStatus,
  StaffCreationNotificationType,
  UserRole,
  type Prisma,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { clampPage, clampPageSize } from "./platform-admin.service.js";
import {
  buildPlatformAdminTemporaryPasswordEmailContent,
  sendSignUpTemporaryPasswordEmailContent,
} from "./password-reset.service.js";
import { generateTemporaryPassword, hashPassword } from "../utils/password.js";

export type PlatformAccessFlags = {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  export: boolean;
};

export type PlatformAccessMap = Record<string, PlatformAccessFlags>;

const emptyFlags = (): PlatformAccessFlags => ({
  view: false,
  create: false,
  edit: false,
  delete: false,
  export: false,
});

async function assertRoleTemplateHasPermissions(roleTemplateId: string): Promise<void> {
  const n = await prisma.platformRoleTemplatePermission.count({
    where: { templateId: roleTemplateId },
  });
  if (n === 0) {
    throw new HttpError(
      400,
      "This role template has no permissions defined yet. Configure it on the Role templates screen first.",
    );
  }
}

async function assertFunctionGroupRoleTemplatesHavePermissions(groupId: string): Promise<void> {
  const group = await prisma.platformFunctionGroup.findUnique({
    where: { id: groupId },
    include: { roleTemplates: { select: { id: true } } },
  });
  if (!group) {
    throw new HttpError(404, "Function group not found.");
  }
  if (group.roleTemplates.length === 0) {
    throw new HttpError(
      400,
      "This function group has no role templates assigned. Assign at least one role template before adding users.",
    );
  }
  for (const rt of group.roleTemplates) {
    await assertRoleTemplateHasPermissions(rt.id);
  }
}

export async function getMergedPlatformPermissionsForUser(
  userId: string,
): Promise<PlatformAccessMap> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      platformFunctionGroup: {
        include: {
          roleTemplates: {
            include: {
              permissions: { include: { module: true } },
            },
          },
        },
      },
    },
  });

  if (!user || user.role !== UserRole.PLATFORM_ADMIN || !user.platformFunctionGroup) {
    return {};
  }

  const merged: PlatformAccessMap = {};
  for (const template of user.platformFunctionGroup.roleTemplates) {
    for (const row of template.permissions) {
      const slug = row.module.slug;
      const cur = merged[slug] ?? emptyFlags();
      cur.view ||= row.canView;
      cur.create ||= row.canCreate;
      cur.edit ||= row.canEdit;
      cur.delete ||= row.canDelete;
      cur.export ||= row.canExport;
      merged[slug] = cur;
    }
  }
  return merged;
}

export async function listPlatformModules() {
  return prisma.platformModule.findMany({
    orderBy: { sortOrder: "asc" },
  });
}

export async function listRoleTemplatesPaginated(rawPage: number, rawPageSize: number) {
  const page = clampPage(rawPage);
  const pageSize = clampPageSize(rawPageSize);
  const skip = (page - 1) * pageSize;
  const [rows, total] = await Promise.all([
    prisma.platformRoleTemplate.findMany({
      skip,
      take: pageSize,
      orderBy: { name: "asc" },
      include: {
        permissions: { include: { module: true } },
        _count: { select: { functionGroups: true } },
      },
    }),
    prisma.platformRoleTemplate.count(),
  ]);
  return { rows, total, page, pageSize };
}

export async function listRoleTemplateSummaries() {
  return prisma.platformRoleTemplate.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function createRoleTemplate(input: { name: string; description?: string | null }) {
  const name = input.name.trim();
  if (!name) {
    throw new HttpError(400, "Name is required.");
  }
  return prisma.platformRoleTemplate.create({
    data: {
      name,
      description: input.description?.trim() || null,
    },
  });
}

export async function updateRoleTemplate(
  id: string,
  input: { name?: string; description?: string | null },
) {
  const existing = await prisma.platformRoleTemplate.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Role template not found.");
  }
  const data: { name?: string; description?: string | null } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) {
      throw new HttpError(400, "Name cannot be empty.");
    }
    data.name = name;
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }
  return prisma.platformRoleTemplate.update({
    where: { id },
    data,
  });
}

export async function deleteRoleTemplate(id: string) {
  const existing = await prisma.platformRoleTemplate.findUnique({
    where: { id },
    include: { _count: { select: { functionGroups: true } } },
  });
  if (!existing) {
    throw new HttpError(404, "Role template not found.");
  }
  if (existing._count.functionGroups > 0) {
    throw new HttpError(
      400,
      "This role template is assigned to one or more function groups. Remove it from those groups before deleting.",
    );
  }
  await prisma.platformRoleTemplate.delete({ where: { id } });
}

export type PermissionRowInput = {
  moduleId: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
};

export async function setRoleTemplatePermissions(templateId: string, rows: PermissionRowInput[]) {
  const template = await prisma.platformRoleTemplate.findUnique({ where: { id: templateId } });
  if (!template) {
    throw new HttpError(404, "Role template not found.");
  }

  const moduleIds = [...new Set(rows.map((r) => r.moduleId))];
  const modules = await prisma.platformModule.findMany({
    where: { id: { in: moduleIds } },
    select: { id: true },
  });
  if (modules.length !== moduleIds.length) {
    throw new HttpError(400, "One or more modules are invalid.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.platformRoleTemplatePermission.deleteMany({ where: { templateId } });
    if (rows.length === 0) {
      return;
    }
    await tx.platformRoleTemplatePermission.createMany({
      data: rows.map((r) => ({
        templateId,
        moduleId: r.moduleId,
        canView: r.canView,
        canCreate: r.canCreate,
        canEdit: r.canEdit,
        canDelete: r.canDelete,
        canExport: r.canExport,
      })),
    });
  });

  return prisma.platformRoleTemplate.findUniqueOrThrow({
    where: { id: templateId },
    include: { permissions: { include: { module: true } } },
  });
}

export async function listFunctionGroups() {
  return prisma.platformFunctionGroup.findMany({
    orderBy: { name: "asc" },
    include: {
      roleTemplates: { select: { id: true, name: true } },
      _count: { select: { users: true } },
    },
  });
}

export async function listFunctionGroupsPaginated(rawPage: number, rawPageSize: number) {
  const page = clampPage(rawPage);
  const pageSize = clampPageSize(rawPageSize);
  const skip = (page - 1) * pageSize;
  const [rows, total] = await Promise.all([
    prisma.platformFunctionGroup.findMany({
      skip,
      take: pageSize,
      orderBy: { name: "asc" },
      include: {
        roleTemplates: { select: { id: true, name: true } },
        _count: { select: { users: true } },
      },
    }),
    prisma.platformFunctionGroup.count(),
  ]);
  return { rows, total, page, pageSize };
}

export async function createFunctionGroup(input: {
  name: string;
  description?: string | null;
  roleTemplateIds: string[];
}) {
  const name = input.name.trim();
  if (!name) {
    throw new HttpError(400, "Name is required.");
  }
  const roleTemplateIds = [...new Set(input.roleTemplateIds.map((id) => id.trim()).filter(Boolean))];
  if (roleTemplateIds.length === 0) {
    throw new HttpError(400, "At least one role template is required.");
  }

  const found = await prisma.platformRoleTemplate.findMany({
    where: { id: { in: roleTemplateIds } },
    select: { id: true },
  });
  if (found.length !== roleTemplateIds.length) {
    throw new HttpError(400, "One or more role templates are invalid.");
  }
  for (const id of roleTemplateIds) {
    await assertRoleTemplateHasPermissions(id);
  }

  return prisma.platformFunctionGroup.create({
    data: {
      name,
      description: input.description?.trim() || null,
      roleTemplates: {
        connect: roleTemplateIds.map((id) => ({ id })),
      },
    },
    include: {
      roleTemplates: { select: { id: true, name: true } },
      _count: { select: { users: true } },
    },
  });
}

export async function updateFunctionGroup(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    roleTemplateIds?: string[];
  },
) {
  const existing = await prisma.platformFunctionGroup.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Function group not found.");
  }

  const data: Prisma.PlatformFunctionGroupUpdateInput = {};

  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) {
      throw new HttpError(400, "Name cannot be empty.");
    }
    data.name = n;
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }

  if (input.roleTemplateIds !== undefined) {
    const roleTemplateIds = [
      ...new Set(input.roleTemplateIds.map((x) => x.trim()).filter(Boolean)),
    ];
    if (roleTemplateIds.length === 0) {
      throw new HttpError(400, "At least one role template is required.");
    }
    const found = await prisma.platformRoleTemplate.findMany({
      where: { id: { in: roleTemplateIds } },
      select: { id: true },
    });
    if (found.length !== roleTemplateIds.length) {
      throw new HttpError(400, "One or more role templates are invalid.");
    }
    for (const tid of roleTemplateIds) {
      await assertRoleTemplateHasPermissions(tid);
    }
    data.roleTemplates = {
      set: roleTemplateIds.map((tid) => ({ id: tid })),
    };
  }

  return prisma.platformFunctionGroup.update({
    where: { id },
    data,
    include: {
      roleTemplates: { select: { id: true, name: true } },
      _count: { select: { users: true } },
    },
  });
}

export async function deleteFunctionGroup(id: string) {
  const existing = await prisma.platformFunctionGroup.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!existing) {
    throw new HttpError(404, "Function group not found.");
  }
  if (existing._count.users > 0) {
    throw new HttpError(
      400,
      "Cannot delete a function group that still has system users assigned.",
    );
  }
  await prisma.platformFunctionGroup.delete({ where: { id } });
}

export async function listPlatformStaffUsers() {
  return prisma.user.findMany({
    where: { role: UserRole.PLATFORM_ADMIN },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
      platformFunctionGroupId: true,
      platformFunctionGroup: { select: { id: true, name: true } },
    },
  });
}

export async function listPlatformStaffUsersPaginated(
  rawPage: number,
  rawPageSize: number,
  options?: { platformFunctionGroupId?: string },
) {
  const page = clampPage(rawPage);
  const pageSize = clampPageSize(rawPageSize);
  const skip = (page - 1) * pageSize;
  const groupId = options?.platformFunctionGroupId?.trim();
  const where: Prisma.UserWhereInput = {
    role: UserRole.PLATFORM_ADMIN,
    ...(groupId ? { platformFunctionGroupId: groupId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        platformFunctionGroupId: true,
        platformFunctionGroup: { select: { id: true, name: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export async function createPlatformStaffUser(input: {
  name: string;
  email: string;
  platformFunctionGroupId: string;
}) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name || !email) {
    throw new HttpError(400, "Name and email are required.");
  }

  const group = await prisma.platformFunctionGroup.findUnique({
    where: { id: input.platformFunctionGroupId },
    select: { id: true },
  });
  if (!group) {
    throw new HttpError(404, "Function group not found.");
  }
  try {
    await assertFunctionGroupRoleTemplatesHavePermissions(group.id);
  } catch (e) {
    if (e instanceof HttpError) {
      throw new HttpError(
        400,
        "This function group’s role templates are not ready. Configure permissions on each assigned role template before adding users.",
      );
    }
    throw e;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new HttpError(409, "An account with this email already exists.");
  }

  const temporaryPassword = generateTemporaryPassword();

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: hashPassword(temporaryPassword),
      role: UserRole.PLATFORM_ADMIN,
      mustChangePassword: true,
      platformFunctionGroupId: group.id,
    },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
      platformFunctionGroupId: true,
      platformFunctionGroup: { select: { id: true, name: true } },
    },
  });

  const emailContent = buildPlatformAdminTemporaryPasswordEmailContent({
    userName: user.name,
    userEmail: user.email,
    temporaryPassword,
  });

  const notificationLog = await prisma.staffCreationNotificationLog.create({
    data: {
      businessId: null,
      userId: user.id,
      recipientName: user.name,
      recipientEmail: user.email,
      staffRole: UserRole.PLATFORM_ADMIN,
      notificationType: StaffCreationNotificationType.PLATFORM_ADMIN_INVITE,
      deliveryStatus: StaffCreationNotificationStatus.PENDING,
      provider: "resend",
      subject: emailContent.subject,
      htmlBody: emailContent.htmlBody,
      textBody: emailContent.textBody,
    },
  });

  try {
    const emailResult = await sendSignUpTemporaryPasswordEmailContent(user.email, emailContent);
    await prisma.staffCreationNotificationLog.update({
      where: { id: notificationLog.id },
      data: {
        deliveryStatus: StaffCreationNotificationStatus.SENT,
        resendEmailId: emailResult.resendEmailId,
        sentAt: new Date(),
      },
    });
  } catch (e) {
    await prisma.staffCreationNotificationLog.update({
      where: { id: notificationLog.id },
      data: {
        deliveryStatus: StaffCreationNotificationStatus.FAILED,
        failureReason: e instanceof Error ? e.message : "Unknown error",
      },
    });
    await prisma.user.delete({ where: { id: user.id } });
    if (e instanceof HttpError) {
      throw e;
    }
    throw new HttpError(502, "Could not send sign-in email. The user was not created.");
  }

  return user;
}

export async function updatePlatformStaffUser(
  id: string,
  input: { platformFunctionGroupId?: string; isActive?: boolean },
) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== UserRole.PLATFORM_ADMIN) {
    throw new HttpError(404, "System user not found.");
  }

  if (input.platformFunctionGroupId !== undefined) {
    const group = await prisma.platformFunctionGroup.findUnique({
      where: { id: input.platformFunctionGroupId },
      select: { id: true },
    });
    if (!group) {
      throw new HttpError(404, "Function group not found.");
    }
    try {
      await assertFunctionGroupRoleTemplatesHavePermissions(group.id);
    } catch (e) {
      if (e instanceof HttpError) {
        throw new HttpError(
          400,
          "This function group’s role templates are not ready. Configure permissions on each assigned role template before assigning users.",
        );
      }
      throw e;
    }
  }

  return prisma.user.update({
    where: { id },
    data: {
      ...(input.platformFunctionGroupId !== undefined
        ? { platformFunctionGroupId: input.platformFunctionGroupId }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
      platformFunctionGroupId: true,
      platformFunctionGroup: { select: { id: true, name: true } },
    },
  });
}

export async function bulkMovePlatformStaffUsers(input: {
  fromGroupId: string;
  toGroupId: string;
  /** If omitted or empty, every platform admin in the source group is moved. */
  userIds?: string[];
}): Promise<{ movedCount: number }> {
  const fromGroupId = input.fromGroupId.trim();
  const toGroupId = input.toGroupId.trim();
  if (!fromGroupId || !toGroupId) {
    throw new HttpError(400, "Source and target groups are required.");
  }
  if (fromGroupId === toGroupId) {
    throw new HttpError(400, "Source and target function groups must be different.");
  }

  const toGroup = await prisma.platformFunctionGroup.findUnique({
    where: { id: toGroupId },
    select: { id: true },
  });
  if (!toGroup) {
    throw new HttpError(404, "Target function group not found.");
  }
  try {
    await assertFunctionGroupRoleTemplatesHavePermissions(toGroup.id);
  } catch (e) {
    if (e instanceof HttpError) {
      throw new HttpError(
        400,
        "The target group’s role templates are not ready. Configure permissions on each assigned role template before moving users here.",
      );
    }
    throw e;
  }

  const fromExists = await prisma.platformFunctionGroup.findUnique({
    where: { id: fromGroupId },
    select: { id: true },
  });
  if (!fromExists) {
    throw new HttpError(404, "Source function group not found.");
  }

  const ids = input.userIds?.filter((id) => id.trim().length > 0).map((id) => id.trim());
  const where: Prisma.UserWhereInput = {
    role: UserRole.PLATFORM_ADMIN,
    platformFunctionGroupId: fromGroupId,
    ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
  };

  if (ids && ids.length > 0) {
    const found = await prisma.user.findMany({
      where,
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new HttpError(
        400,
        "Every selected user must be a platform admin in the source function group.",
      );
    }
  }

  const result = await prisma.user.updateMany({
    where,
    data: { platformFunctionGroupId: toGroupId },
  });

  if (result.count === 0) {
    throw new HttpError(400, "No users matched the move criteria.");
  }

  return { movedCount: result.count };
}
