import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { ensureAuthenticated, hasPermission, requirePermission } from '@/middlewares/auth';
import { PERMISSIONS, isPermission } from '@/permissions';
import { logAuditEvent } from '@/services/audit';

const router = Router();

const roleSelect = {
  id: true,
  name: true,
  description: true,
  isSystem: true,
  permissions: { select: { permission: true }, orderBy: { permission: 'asc' as const } },
} as const;

function presentRole(role: {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: { permission: string }[];
}) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map((row) => row.permission),
  };
}

function canReadRoles(req: Request): boolean {
  return hasPermission(req.user, 'manage_roles') || hasPermission(req.user, 'manage_users');
}

router.get('/', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  if (!canReadRoles(req)) return res.status(403).json({ error: 'Permission denied' });
  try {
    const roles = await prisma.role.findMany({ orderBy: { name: 'asc' }, select: roleSelect });
    return res.json(roles.map(presentRole));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

router.get('/:id', requirePermission('manage_roles'), async (req: Request, res: Response): Promise<any> => {
  try {
    const role = await prisma.role.findUnique({
      where: { id: req.params.id as string },
      select: roleSelect,
    });
    if (!role) return res.status(404).json({ message: 'Role not found' });
    return res.json(presentRole(role));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

router.put('/:id/permissions', requirePermission('manage_roles'), async (req: Request, res: Response): Promise<any> => {
  const incoming = req.body?.permissions;
  if (!Array.isArray(incoming)) {
    return res.status(422).json({ message: 'permissions must be an array' });
  }

  const permissions = [...new Set(incoming.map((value) => String(value)))];
  const unknown = permissions.filter((value) => !isPermission(value));
  if (unknown.length > 0) {
    return res.status(422).json({ message: `Unknown permissions: ${unknown.join(', ')}` });
  }

  try {
    const role = await prisma.role.findUnique({
      where: { id: req.params.id as string },
      select: roleSelect,
    });
    if (!role) return res.status(404).json({ message: 'Role not found' });

    if (role.name === 'Admin') {
      const missing = PERMISSIONS.filter((key) => !permissions.includes(key));
      if (missing.length > 0) {
        return res.status(422).json({ message: 'The Admin role cannot lose any permission.' });
      }
    }

    const desired = new Set(permissions);
    const current = role.permissions.map((row) => row.permission);
    const stale = current.filter((permission) => !desired.has(permission));
    const missing = permissions.filter((permission) => !current.includes(permission));

    if (stale.length > 0) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permission: { in: stale } },
      });
    }
    if (missing.length > 0) {
      await prisma.rolePermission.createMany({
        data: missing.map((permission) => ({ roleId: role.id, permission })),
      });
    }

    const updated = await prisma.role.findUniqueOrThrow({ where: { id: role.id }, select: roleSelect });

    await logAuditEvent({
      eventType: 'role_permissions_updated',
      userType: req.user!.role.name,
      userId: req.user!.id,
      userName: req.user!.name,
      userEmail: req.user!.email,
      action: 'Update role permissions',
      description: `${req.user!.name} set ${role.name} permissions to ${permissions.join(', ') || 'none'}`,
      metadata: { roleId: role.id, before: current, after: permissions },
      ipAddress: req.ip,
    });

    return res.json(presentRole(updated));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;
