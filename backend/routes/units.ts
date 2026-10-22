import { Prisma } from '@prisma/client';
import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { requirePermission } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

function routeId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function fail(res: Response, status: number, error: string, field?: string) {
  res.status(status).json(field ? { error, field } : { error });
}

function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function quote(name: string): string {
  return `"${name}"`;
}

function readFlag(value: unknown): boolean {
  if (Array.isArray(value)) return readFlag(value[0]);
  return value === true || value === 'true' || value === '1';
}

function present(row: {
  id: string;
  name: string;
  abbreviation: string;
  nameKey: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    nameKey: row.nameKey,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function record(req: Request, action: string, description: string, metadata: Record<string, unknown>) {
  const user = req.user!;
  await logAuditEvent({
    eventType: 'unit',
    userType: user.role.name,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    action,
    description,
    metadata,
    ipAddress: req.ip,
  });
}

router.get('/', requirePermission('view_catalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const includeInactive = readFlag(req.query.includeInactive);
    const rows = await prisma.unit.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json(rows.map(present));
  } catch (error) {
    console.error('GET /api/units error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.post('/', requirePermission('manage_catalog'), async (req: Request, res: Response): Promise<void> => {
  if (typeof req.body?.name !== 'string') {
    fail(res, 400, 'Name is required and must be 2 to 30 characters.', 'name');
    return;
  }
  const name = req.body.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 30) {
    fail(res, 400, 'Name is required and must be 2 to 30 characters.', 'name');
    return;
  }
  if (typeof req.body?.abbreviation !== 'string') {
    fail(res, 400, 'Abbreviation is required and must be 1 to 10 characters.', 'abbreviation');
    return;
  }
  const abbreviation = req.body.abbreviation.trim();
  if (abbreviation.length < 1 || abbreviation.length > 10) {
    fail(res, 400, 'Abbreviation is required and must be 1 to 10 characters.', 'abbreviation');
    return;
  }

  const key = nameKey(name);
  try {
    const takenName = await prisma.unit.findUnique({ where: { nameKey: key } });
    if (takenName) {
      fail(res, 409, `A unit named ${quote(takenName.name)} already uses this name.`, 'name');
      return;
    }
    const takenAbbreviation = await prisma.unit.findFirst({
      where: { abbreviation: { equals: abbreviation, mode: 'insensitive' } },
    });
    if (takenAbbreviation) {
      fail(res, 409, `A unit named ${quote(takenAbbreviation.name)} already uses the abbreviation ${quote(takenAbbreviation.abbreviation)}.`, 'abbreviation');
      return;
    }
    const created = await prisma.unit.create({
      data: { name, abbreviation, nameKey: key, isActive: true },
    });
    await record(req, 'create', `Created unit ${quote(created.name)} (${created.abbreviation})`, { unitId: created.id });
    res.status(201).json(present(created));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      fail(res, 409, 'A unit with this name already exists.', 'name');
      return;
    }
    console.error('POST /api/units error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.patch('/:id/status', requirePermission('manage_catalog'), async (req: Request, res: Response): Promise<void> => {
  if (typeof req.body?.isActive !== 'boolean') {
    fail(res, 400, 'isActive must be true or false.', 'isActive');
    return;
  }
  const existing = await prisma.unit.findUnique({ where: { id: routeId(req.params.id) } });
  if (!existing) {
    fail(res, 404, 'Unit not found.');
    return;
  }
  if (existing.isActive === req.body.isActive) {
    res.json(present(existing));
    return;
  }
  try {
    const updated = await prisma.unit.update({
      where: { id: existing.id },
      data: { isActive: req.body.isActive },
    });
    await record(
      req,
      'status',
      updated.isActive
        ? `Activated unit ${quote(updated.name)}`
        : `Deactivated unit ${quote(updated.name)}`,
      { unitId: updated.id, isActive: updated.isActive },
    );
    res.json(present(updated));
  } catch (error) {
    console.error('PATCH /api/units/:id/status error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

export default router;
