import { prisma } from '../lib/prisma.js';
import { SYSTEM_ROLES, SYSTEM_PERMISSIONS } from '../config/permissions.js';

export async function seedPermissionsAndRoles() {
  console.log('Seeding permissions and roles...');

  // Create permissions
  for (const permission of SYSTEM_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {
        name: permission.name,
        description: permission.description,
        category: permission.category
      },
      create: {
        id: permission.id,
        key: permission.key,
        name: permission.name,
        description: permission.description,
        category: permission.category
      }
    });
  }

  // Create roles and assign permissions
  for (const role of SYSTEM_ROLES) {
    const createdRole = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: {
        id: role.id,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem
      }
    });

    // Assign permissions to role
    for (const permissionKey of role.permissions) {
      const permission = await prisma.permission.findUnique({
        where: { key: permissionKey }
      });

      if (permission) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: createdRole.id,
              permissionId: permission.id
            }
          },
          update: {},
          create: {
            roleId: createdRole.id,
            permissionId: permission.id
          }
        });
      }
    }
  }

  console.log('Permissions and roles seeded successfully');
}

// Create platform owner user
export async function createPlatformOwner(email: string, name: string, passwordHash: string) {
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: 'PLATFORM_OWNER'
    }
  });

  // Assign platform owner role
  const platformOwnerRole = await prisma.role.findUnique({
    where: { name: 'Platform Owner' }
  });

  if (platformOwnerRole) {
    await prisma.userRoleAssignment.create({
      data: {
        userId: user.id,
        roleId: platformOwnerRole.id,
        scope: 'platform'
      }
    });
  }

  return user;
}