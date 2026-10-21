import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';
import { ensureAuthenticated, hasPermission, requirePermission } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  roleId: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { name: true } },
} as const;

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  roleId: string;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  role: { name: string };
};

function presentUser(user: UserRow) {
  return {
    ...user,
    _id: user.id,
    role: user.role.name,
  };
}

// ─── GET /api/users ───────────────────────────────────────────────────────────
router.get('/', requirePermission('manage_users'), async (_req: Request, res: Response): Promise<any> => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: userSelect,
    });
    return res.json(users.map(presentUser));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/users ──────────────────────────────────────────────────────────
router.post('/', requirePermission('manage_users'), async (req: Request, res: Response): Promise<any> => {
  const { name, email, password, phone, roleId, status } = req.body;

  if (!name || !email || !password || !roleId) {
    return res.status(422).json({ message: 'Name, email, password and roleId are required' });
  }

  try {
    const role = await prisma.role.findUnique({ where: { id: String(roleId) }, select: { id: true, name: true } });
    if (!role) return res.status(422).json({ message: 'Role not found' });

    const existing = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });
    if (existing) return res.status(409).json({ message: 'An account with this email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email: String(email).trim().toLowerCase(),
        password: hashed,
        phone,
        roleId: role.id,
        status: status === 'inactive' ? 'inactive' : 'active',
      },
      select: userSelect,
    });

    await logAuditEvent({
      eventType: 'user_created',
      userType: req.user!.role.name,
      userId: req.user!.id,
      userName: req.user!.name,
      userEmail: req.user!.email,
      action: 'Create user',
      description: `${req.user!.name} created a ${role.name} account for ${name} (${user.email})`,
      metadata: { roleId: role.id, roleName: role.name },
      ipAddress: req.ip,
    });

    return res.status(201).json(presentUser(user));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/users/:id ───────────────────────────────────────────────────────
router.get('/:id', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      select: userSelect,
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!hasPermission(req.user, 'manage_users') && req.user!.id !== user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    return res.json(presentUser(user));
  } catch {
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── PUT /api/users/:id ───────────────────────────────────────────────────────
router.put('/:id', requirePermission('manage_users'), async (req: Request, res: Response): Promise<any> => {
  const { name, email, phone, password, roleId, status } = req.body;
  try {
    if (email) {
      const conflict = await prisma.user.findFirst({
        where: { email: String(email).trim().toLowerCase(), id: { not: req.params.id as string } },
      });
      if (conflict) return res.status(409).json({ message: 'Another user uses this email' });
    }

    const data: Record<string, unknown> = {};
    if (name) data.name = name;
    if (email) data.email = String(email).trim().toLowerCase();
    if (phone !== undefined) data.phone = phone;
    if (roleId) {
      const role = await prisma.role.findUnique({ where: { id: String(roleId) }, select: { id: true } });
      if (!role) return res.status(422).json({ message: 'Role not found' });
      data.roleId = role.id;
    }
    if (status && ['active', 'inactive'].includes(status)) data.status = status;
    if (password) data.password = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data,
      select: userSelect,
    });

    await logAuditEvent({
      eventType: 'user_updated',
      userType: req.user!.role.name,
      userId: req.user!.id,
      userName: req.user!.name,
      userEmail: req.user!.email,
      action: 'Update user',
      description: `${req.user!.name} updated the ${user.role.name} account for ${user.name}`,
      ipAddress: req.ip,
    });

    return res.json(presentUser(user));
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'User not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── PATCH /api/users/:id/status ──────────────────────────────────────────────
router.patch('/:id/status', requirePermission('manage_users'), async (req: Request, res: Response): Promise<any> => {
  const status = String(req.body.status || '').trim();
  if (!['active', 'inactive'].includes(status)) {
    return res.status(422).json({ message: 'status must be active or inactive' });
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { status },
      select: userSelect,
    });

    await logAuditEvent({
      eventType: status === 'active' ? 'user_activated' : 'user_deactivated',
      userType: req.user!.role.name,
      userId: req.user!.id,
      userName: req.user!.name,
      userEmail: req.user!.email,
      action: status === 'active' ? 'Activate user' : 'Deactivate user',
      description: `${req.user!.name} set ${user.name} (${user.email}) to ${status}`,
      ipAddress: req.ip,
    });

    return res.json(presentUser(user));
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'User not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── DELETE /api/users/:id ────────────────────────────────────────────────────
router.delete('/:id', requirePermission('manage_users'), async (req: Request, res: Response): Promise<any> => {
  try {
    if (req.params.id === req.user!.id) {
      return res.status(422).json({ message: 'Cannot delete your own account' });
    }

    const user = await prisma.user.delete({
      where: { id: req.params.id as string },
      include: { role: { select: { name: true } } },
    });

    await logAuditEvent({
      eventType: 'user_deleted',
      userType: req.user!.role.name,
      userId: req.user!.id,
      userName: req.user!.name,
      userEmail: req.user!.email,
      action: 'Delete user',
      description: `${req.user!.name} deleted ${user.role.name} ${user.name} (${user.email})`,
      ipAddress: req.ip,
    });

    return res.json({ message: 'User deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'User not found' });
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;
