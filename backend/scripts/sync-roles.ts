import '../loadEnv';
import prisma from '@/services/prisma';
import { ROLE_MATRIX } from '../permissions';

async function main() {
  for (const definition of ROLE_MATRIX) {
    const role = await prisma.role.upsert({
      where: { name: definition.name },
      update: {
        description: definition.description,
        isSystem: true,
      },
      create: {
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
    });

    const desired = new Set<string>(definition.permissions);
    const existing = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { id: true, permission: true },
    });

    // Admin keeps any extra permission already stored. Other system roles drop keys that left the matrix.
    const staleIds = role.name === 'Admin'
      ? []
      : existing.filter((row) => !desired.has(row.permission)).map((row) => row.id);
    if (staleIds.length > 0) {
      await prisma.rolePermission.deleteMany({ where: { id: { in: staleIds } } });
    }

    const present = new Set(existing.map((row) => row.permission));
    const missing = definition.permissions.filter((permission) => !present.has(permission));
    if (missing.length > 0) {
      await prisma.rolePermission.createMany({
        data: missing.map((permission) => ({ roleId: role.id, permission })),
      });
    }

    const kept = role.name === 'Admin'
      ? existing.map((row) => row.permission).filter((permission) => !desired.has(permission))
      : [];
    const listed = [...definition.permissions, ...kept];
    console.log(`${definition.name}: ${listed.length > 0 ? listed.join(', ') : '(none)'}`);
  }

  console.log('Roles and permissions are in sync with ROLE_MATRIX.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
