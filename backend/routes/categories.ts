import { Prisma } from '@prisma/client';
import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { requirePermission } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

/** Names that exist in the installed lucide-react package. */
export const CATEGORY_ICONS = [
  'leaf',
  'droplet',
  'paw-print',
  'syringe',
  'pill',
  'sprout',
  'wheat',
  'bird',
  'shovel',
  'flask-conical',
  'package',
  'bug',
  'tractor',
] as const;

const categoryInclude = {
  parent: { select: { id: true, name: true, sortOrder: true, isActive: true, parentId: true } },
} as const;

type CategoryRow = Prisma.CategoryGetPayload<{ include: typeof categoryInclude }>;

function routeId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function fail(res: Response, status: number, error: string, field?: string) {
  return res.status(status).json(field ? { error, field } : { error });
}

export function categoryNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function present(row: CategoryRow) {
  return {
    id: row.id,
    name: row.name,
    nameKey: row.nameKey,
    description: row.description,
    parentId: row.parentId,
    parentName: row.parent?.name ?? null,
    defaultMarkupPercent: row.defaultMarkupPercent == null ? null : Number(row.defaultMarkupPercent),
    tracksExpiryByDefault: row.tracksExpiryByDefault,
    icon: row.icon,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function percentLabel(value: Prisma.Decimal | null | undefined): string {
  if (value == null) return 'none';
  return `${value.toFixed(2).replace(/\.?0+$/, '')}%`;
}

function quote(name: string): string {
  return `"${name}"`;
}

async function record(
  req: Request,
  action: string,
  description: string,
  metadata: Record<string, unknown>,
) {
  const user = req.user!;
  await logAuditEvent({
    eventType: 'category',
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

function readFlag(value: unknown): boolean {
  if (Array.isArray(value)) return readFlag(value[0]);
  return value === true || value === 'true' || value === '1';
}

function parseMarkup(value: unknown): { ok: true; value: Prisma.Decimal | null } | { ok: false; error: string } {
  if (value instanceof Prisma.Decimal) return { ok: true, value };
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!text || !/^\d+(\.\d+)?$/.test(text)) {
    return { ok: false, error: 'Default markup must be a number from 0 to 1000, with at most 2 decimal places.' };
  }
  const places = text.split('.')[1]?.length ?? 0;
  if (places > 2) {
    return { ok: false, error: 'Default markup must be a number from 0 to 1000, with at most 2 decimal places.' };
  }
  const amount = new Prisma.Decimal(text);
  if (amount.lessThan(0) || amount.greaterThan(1000)) {
    return { ok: false, error: 'Default markup must be a number from 0 to 1000, with at most 2 decimal places.' };
  }
  return { ok: true, value: amount };
}

function parseSortOrder(value: unknown, fallback: number): { ok: true; value: number } | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') return { ok: true, value: fallback };
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(number)) return { ok: false, error: 'Sort order must be a whole number.' };
  return { ok: true, value: number };
}

function parseIcon(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string' || !CATEGORY_ICONS.includes(value as (typeof CATEGORY_ICONS)[number])) {
    return { ok: false, error: `Icon must be empty or one of: ${CATEGORY_ICONS.join(', ')}.` };
  }
  return { ok: true, value };
}

function parseDescription(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: 'Description must be text.' };
  const description = value.trim();
  if (description.length > 2000) return { ok: false, error: 'Description must be 2000 characters or fewer.' };
  return { ok: true, value: description || null };
}

function parseName(value: unknown): { ok: true; name: string; nameKey: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'Name is required and must be 2 to 60 characters.' };
  const name = value.trim();
  if (name.length < 2 || name.length > 60) {
    return { ok: false, error: 'Name is required and must be 2 to 60 characters.' };
  }
  return { ok: true, name, nameKey: categoryNameKey(name) };
}

async function nameTaken(nameKey: string, exceptId?: string): Promise<CategoryRow | null> {
  const existing = await prisma.category.findUnique({ where: { nameKey }, include: categoryInclude });
  if (!existing || existing.id === exceptId) return null;
  return existing;
}

async function validateParent(
  parentId: string | null,
  categoryId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!parentId) return { ok: true };
  if (categoryId && parentId === categoryId) {
    return { ok: false, error: 'A category cannot be its own parent.' };
  }
  const parent = await prisma.category.findUnique({ where: { id: parentId } });
  if (!parent) return { ok: false, error: 'Parent category was not found.' };
  if (!parent.isActive || parent.parentId) {
    return { ok: false, error: 'A sub-category can only be placed under an active top-level category.' };
  }
  if (categoryId) {
    const childCount = await prisma.category.count({ where: { parentId: categoryId } });
    if (childCount > 0) {
      return { ok: false, error: 'A category that already has sub-categories cannot become a sub-category.' };
    }
    const isOwnChild = await prisma.category.findFirst({ where: { id: parentId, parentId: categoryId } });
    if (isOwnChild) {
      return { ok: false, error: 'A category cannot be placed under one of its own sub-categories.' };
    }
  }
  return { ok: true };
}

function sortRows(rows: CategoryRow[]): CategoryRow[] {
  return [...rows].sort((a, b) => {
    const aOrder = a.parent ? a.parent.sortOrder : a.sortOrder;
    const bOrder = b.parent ? b.parent.sortOrder : b.sortOrder;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aGroup = a.parent ? a.parent.name : a.name;
    const bGroup = b.parent ? b.parent.name : b.name;
    const group = aGroup.localeCompare(bGroup, 'en');
    if (group !== 0) return group;
    const depth = (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0);
    if (depth !== 0) return depth;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name, 'en');
  });
}

router.get('/', requirePermission('view_catalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const includeInactive = readFlag(req.query.includeInactive);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const rows = await prisma.category.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: categoryInclude,
    });
    res.json(sortRows(rows).map(present));
  } catch (error) {
    console.error('GET /api/categories error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.get('/:id', requirePermission('view_catalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const row = await prisma.category.findUnique({
      where: { id: routeId(req.params.id) },
      include: categoryInclude,
    });
    if (!row) {
      fail(res, 404, 'Category not found.');
      return;
    }
    res.json(present(row));
  } catch (error) {
    console.error('GET /api/categories/:id error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.post('/', requirePermission('manage_catalog'), async (req: Request, res: Response): Promise<void> => {
  const nameResult = parseName(req.body?.name);
  if (!nameResult.ok) {
    fail(res, 400, nameResult.error, 'name');
    return;
  }
  const description = parseDescription(req.body?.description);
  if (!description.ok) {
    fail(res, 400, description.error, 'description');
    return;
  }
  const markup = parseMarkup(req.body?.defaultMarkupPercent);
  if (!markup.ok) {
    fail(res, 400, markup.error, 'defaultMarkupPercent');
    return;
  }
  const icon = parseIcon(req.body?.icon);
  if (!icon.ok) {
    fail(res, 400, icon.error, 'icon');
    return;
  }
  const sortOrder = parseSortOrder(req.body?.sortOrder, 0);
  if (!sortOrder.ok) {
    fail(res, 400, sortOrder.error, 'sortOrder');
    return;
  }
  if (req.body?.tracksExpiryByDefault !== undefined && typeof req.body.tracksExpiryByDefault !== 'boolean') {
    fail(res, 400, 'Tracks expiry must be true or false.', 'tracksExpiryByDefault');
    return;
  }
  const parentId = req.body?.parentId ? String(req.body.parentId) : null;
  const parent = await validateParent(parentId);
  if (!parent.ok) {
    fail(res, 400, parent.error, 'parentId');
    return;
  }

  try {
    const taken = await nameTaken(nameResult.nameKey);
    if (taken) {
      fail(res, 409, `A category named ${quote(taken.name)} already uses this name.`, 'name');
      return;
    }
    const created = await prisma.category.create({
      data: {
        name: nameResult.name,
        nameKey: nameResult.nameKey,
        description: description.value,
        parentId,
        defaultMarkupPercent: markup.value,
        tracksExpiryByDefault: req.body?.tracksExpiryByDefault === true,
        icon: icon.value,
        sortOrder: sortOrder.value,
      },
      include: categoryInclude,
    });
    await record(req, 'create', `Created category ${quote(created.name)}`, { categoryId: created.id });
    res.status(201).json(present(created));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      fail(res, 409, 'A category with this name already exists.', 'name');
      return;
    }
    console.error('POST /api/categories error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.put('/:id', requirePermission('manage_catalog'), async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.category.findUnique({
    where: { id: routeId(req.params.id) },
    include: categoryInclude,
  });
  if (!existing) {
    fail(res, 404, 'Category not found.');
    return;
  }

  const nameResult = parseName(req.body?.name ?? existing.name);
  if (!nameResult.ok) {
    fail(res, 400, nameResult.error, 'name');
    return;
  }
  const description = parseDescription(req.body?.description === undefined ? existing.description : req.body.description);
  if (!description.ok) {
    fail(res, 400, description.error, 'description');
    return;
  }
  const markup = parseMarkup(
    req.body?.defaultMarkupPercent === undefined ? existing.defaultMarkupPercent : req.body.defaultMarkupPercent,
  );
  if (!markup.ok) {
    fail(res, 400, markup.error, 'defaultMarkupPercent');
    return;
  }
  const icon = parseIcon(req.body?.icon === undefined ? existing.icon : req.body.icon);
  if (!icon.ok) {
    fail(res, 400, icon.error, 'icon');
    return;
  }
  const sortOrder = parseSortOrder(req.body?.sortOrder === undefined ? existing.sortOrder : req.body.sortOrder, existing.sortOrder);
  if (!sortOrder.ok) {
    fail(res, 400, sortOrder.error, 'sortOrder');
    return;
  }
  const tracksExpiry =
    req.body?.tracksExpiryByDefault === undefined ? existing.tracksExpiryByDefault : req.body.tracksExpiryByDefault;
  if (typeof tracksExpiry !== 'boolean') {
    fail(res, 400, 'Tracks expiry must be true or false.', 'tracksExpiryByDefault');
    return;
  }
  const parentId = req.body?.parentId === undefined ? existing.parentId : req.body.parentId ? String(req.body.parentId) : null;
  const parent = await validateParent(parentId, routeId(req.params.id));
  if (!parent.ok) {
    fail(res, 400, parent.error, 'parentId');
    return;
  }

  const changes: string[] = [];
  if (nameResult.name !== existing.name) {
    changes.push(`Renamed category ${quote(existing.name)} to ${quote(nameResult.name)}`);
  }
  if ((description.value ?? null) !== (existing.description ?? null)) {
    changes.push(`Changed the description of ${quote(nameResult.name)}`);
  }
  if ((parentId ?? null) !== (existing.parentId ?? null)) {
    if (!parentId) changes.push(`Made ${quote(nameResult.name)} a top-level category`);
    else {
      const nextParent = await prisma.category.findUnique({ where: { id: parentId }, select: { name: true } });
      changes.push(`Moved ${quote(nameResult.name)} under ${quote(nextParent?.name || 'its parent')}`);
    }
  }
  const previousMarkup = existing.defaultMarkupPercent;
  const nextMarkup = markup.value;
  const markupChanged =
    (previousMarkup == null && nextMarkup != null) ||
    (previousMarkup != null && nextMarkup == null) ||
    (previousMarkup != null && nextMarkup != null && !previousMarkup.equals(nextMarkup));
  if (markupChanged) {
    changes.push(
      `Changed default markup of ${quote(nameResult.name)} from ${percentLabel(previousMarkup)} to ${percentLabel(nextMarkup)}`,
    );
  }
  if (tracksExpiry !== existing.tracksExpiryByDefault) {
    changes.push(
      tracksExpiry
        ? `Turned expiry tracking on for ${quote(nameResult.name)}`
        : `Turned expiry tracking off for ${quote(nameResult.name)}`,
    );
  }
  if ((icon.value ?? null) !== (existing.icon ?? null)) {
    changes.push(`Changed the icon of ${quote(nameResult.name)}`);
  }
  if (sortOrder.value !== existing.sortOrder) {
    changes.push(`Changed sort order of ${quote(nameResult.name)} from ${existing.sortOrder} to ${sortOrder.value}`);
  }

  try {
    const taken = await nameTaken(nameResult.nameKey, existing.id);
    if (taken) {
      fail(res, 409, `A category named ${quote(taken.name)} already uses this name.`, 'name');
      return;
    }
    const updated = await prisma.category.update({
      where: { id: existing.id },
      data: {
        name: nameResult.name,
        nameKey: nameResult.nameKey,
        description: description.value,
        parentId,
        defaultMarkupPercent: markup.value,
        tracksExpiryByDefault: tracksExpiry,
        icon: icon.value,
        sortOrder: sortOrder.value,
      },
      include: categoryInclude,
    });
    if (changes.length > 0) {
      await record(req, 'update', changes.join('. '), { categoryId: updated.id });
    }
    res.json(present(updated));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      fail(res, 409, 'A category with this name already exists.', 'name');
      return;
    }
    console.error('PUT /api/categories/:id error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.patch('/:id/status', requirePermission('manage_catalog'), async (req: Request, res: Response): Promise<void> => {
  if (typeof req.body?.isActive !== 'boolean') {
    fail(res, 400, 'isActive must be true or false.', 'isActive');
    return;
  }
  const existing = await prisma.category.findUnique({
    where: { id: routeId(req.params.id) },
    include: categoryInclude,
  });
  if (!existing) {
    fail(res, 404, 'Category not found.');
    return;
  }
  const isActive = req.body.isActive as boolean;
  if (existing.isActive === isActive) {
    res.json(present(existing));
    return;
  }

  if (!isActive) {
    const activeChildren = await prisma.category.count({ where: { parentId: existing.id, isActive: true } });
    if (activeChildren > 0) {
      fail(
        res,
        400,
        `Cannot deactivate ${quote(existing.name)} while it still has active sub-categories.`,
        'isActive',
      );
      return;
    }
    const activeItems = await prisma.item.count({ where: { categoryId: existing.id, isActive: true } });
    if (activeItems > 0) {
      fail(
        res,
        400,
        `Cannot deactivate ${quote(existing.name)} while it still has active items.`,
        'isActive',
      );
      return;
    }
  } else if (existing.parent && !existing.parent.isActive) {
    fail(
      res,
      400,
      `Activate the parent category ${quote(existing.parent.name)} before activating ${quote(existing.name)}.`,
      'isActive',
    );
    return;
  }

  try {
    const updated = await prisma.category.update({
      where: { id: existing.id },
      data: { isActive },
      include: categoryInclude,
    });
    await record(
      req,
      'status',
      isActive ? `Activated category ${quote(updated.name)}` : `Deactivated category ${quote(updated.name)}`,
      { categoryId: updated.id, isActive },
    );
    res.json(present(updated));
  } catch (error) {
    console.error('PATCH /api/categories/:id/status error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

export default router;
