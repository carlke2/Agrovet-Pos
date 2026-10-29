import { Customer, Prisma } from '@prisma/client';
import { Router, Request, Response } from 'express';
import { normalizePhoneKey } from '@/lib/phone';
import { requirePermission } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';
import prisma from '@/services/prisma';

const router = Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WALK_IN_KEY = 'WALK_IN';
const CREDIT_ERROR = 'Credit is enabled in a later step';

type ParsedText = { ok: true; present: boolean; value: string | null } | { ok: false; error: string };
type ParsedPhone =
  | { ok: true; present: boolean; phone: string | null; phoneKey: string | null }
  | { ok: false; error: string };

type CustomerInput = {
  name: string;
  phone: string | null;
  phoneKey: string | null;
  email: string | null;
  notes: string | null;
};

function routeId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function fail(res: Response, status: number, error: string, field?: string) {
  return res.status(status).json(field ? { error, field } : { error });
}

function locked(res: Response) {
  return res.status(403).json({
    code: 'SYSTEM_CUSTOMER_LOCKED',
    error: 'The Walk-in customer is locked.',
  });
}

function quote(name: string): string {
  return `"${name}"`;
}

function queryText(value: unknown): string {
  if (Array.isArray(value)) return queryText(value[0]);
  return typeof value === 'string' ? value.trim() : '';
}

function shown(value: string | null | undefined): string {
  return value == null || value === '' ? 'none' : value;
}

function isLocked(row: { isSystem: boolean; systemKey: string | null }): boolean {
  return row.isSystem || row.systemKey === WALK_IN_KEY;
}

function creditSent(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, 'creditLimit');
}

function present(row: Customer) {
  return {
    id: row.id,
    customerNo: row.customerNo,
    name: row.name,
    phone: row.phone,
    phoneKey: row.phoneKey,
    email: row.email,
    notes: row.notes,
    creditLimit: row.creditLimit.toFixed(2),
    isSystem: row.isSystem,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function record(req: Request, action: string, description: string, metadata: Record<string, unknown>) {
  const user = req.user!;
  await logAuditEvent({
    eventType: 'customer',
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

function parseName(value: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'Name is required and must be 2 to 120 characters.' };
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120) {
    return { ok: false, error: 'Name is required and must be 2 to 120 characters.' };
  }
  return { ok: true, name };
}

function parseOptionalText(value: unknown, label: string, max: number): ParsedText {
  if (value === undefined) return { ok: true, present: false, value: null };
  if (value === null) return { ok: true, present: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: `${label} must be text.` };
  const text = value.trim();
  if (!text) return { ok: true, present: true, value: null };
  if (text.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer.` };
  return { ok: true, present: true, value: text };
}

function parsePhone(value: unknown): ParsedPhone {
  if (value === undefined) return { ok: true, present: false, phone: null, phoneKey: null };
  if (value === null) return { ok: true, present: true, phone: null, phoneKey: null };
  if (typeof value !== 'string') return { ok: false, error: 'Phone must be 9 to 15 digits.' };
  const phone = value.trim();
  if (!phone) return { ok: true, present: true, phone: null, phoneKey: null };
  const phoneKey = normalizePhoneKey(phone);
  if (!phoneKey) return { ok: false, error: 'Phone must be 9 to 15 digits.' };
  return { ok: true, present: true, phone, phoneKey };
}

function parseEmail(value: unknown): ParsedText {
  if (value === undefined) return { ok: true, present: false, value: null };
  if (value === null) return { ok: true, present: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: 'Email must be a valid email address.' };
  const email = value.trim();
  if (!email) return { ok: true, present: true, value: null };
  if (email.length > 120 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: 'Email must be a valid email address.' };
  }
  return { ok: true, present: true, value: email };
}

function readInput(
  body: Record<string, unknown>,
  current?: Customer,
): { ok: true; value: CustomerInput } | { ok: false; error: string; field: string } {
  const nameSource = body.name === undefined && current ? current.name : body.name;
  const nameResult = parseName(nameSource);
  if (!nameResult.ok) return { ok: false, error: nameResult.error, field: 'name' };

  const phone = parsePhone(body.phone);
  if (!phone.ok) return { ok: false, error: phone.error, field: 'phone' };
  const email = parseEmail(body.email);
  if (!email.ok) return { ok: false, error: email.error, field: 'email' };
  const notes = parseOptionalText(body.notes, 'Notes', 500);
  if (!notes.ok) return { ok: false, error: notes.error, field: 'notes' };

  return {
    ok: true,
    value: {
      name: nameResult.name,
      phone: phone.present ? phone.phone : current?.phone ?? null,
      phoneKey: phone.present ? phone.phoneKey : current?.phoneKey ?? null,
      email: email.present ? email.value : current?.email ?? null,
      notes: notes.present ? notes.value : current?.notes ?? null,
    },
  };
}

function describeChanges(before: Customer, after: CustomerInput): string {
  const name = after.name;
  const lines: string[] = [];
  if (before.name !== after.name) lines.push(`Changed name of ${quote(before.name)} from ${before.name} to ${after.name}`);
  if (before.phone !== after.phone) {
    lines.push(`Changed phone of ${quote(name)} from ${shown(before.phone)} to ${shown(after.phone)}`);
  }
  if (before.email !== after.email) {
    lines.push(`Changed email of ${quote(name)} from ${shown(before.email)} to ${shown(after.email)}`);
  }
  if (before.notes !== after.notes) {
    lines.push(`Changed notes of ${quote(name)} from ${shown(before.notes)} to ${shown(after.notes)}`);
  }
  return lines.length > 0 ? lines.join('. ') : `Updated customer ${quote(name)}`;
}

async function phoneTaken(phoneKey: string | null, exceptId?: string): Promise<Customer | null> {
  if (!phoneKey) return null;
  const existing = await prisma.customer.findUnique({ where: { phoneKey } });
  if (!existing || existing.id === exceptId) return null;
  return existing;
}

function phoneConflict(res: Response, existing: Customer) {
  return fail(res, 409, `A customer named ${quote(existing.name)} already uses this phone.`, 'phone');
}

function customerNoFromSearch(search: string): number | null {
  const match = /^(?:cus-)?(\d+)$/i.exec(search);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) return null;
  return value;
}

function listWhere(search: string, status: string): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = {};
  if (status === 'active') where.isActive = true;
  if (status === 'inactive') where.isActive = false;
  if (!search) return where;

  const or: Prisma.CustomerWhereInput[] = [
    { name: { contains: search, mode: 'insensitive' } },
    { phone: { contains: search, mode: 'insensitive' } },
  ];
  const phoneKey = normalizePhoneKey(search);
  if (phoneKey) or.push({ phoneKey });
  const customerNo = customerNoFromSearch(search);
  if (customerNo != null) or.push({ customerNo });
  where.OR = or;
  return where;
}

router.get('/', requirePermission('view_customers'), async (req: Request, res: Response): Promise<void> => {
  const search = queryText(req.query.search);
  const status = queryText(req.query.status) || 'active';
  if (!['active', 'inactive', 'all'].includes(status)) {
    fail(res, 400, 'Status must be active, inactive, or all.', 'status');
    return;
  }
  const pageText = queryText(req.query.page);
  const pageSizeText = queryText(req.query.pageSize);
  if (pageText && !/^\d+$/.test(pageText)) {
    fail(res, 400, 'page must be a whole number of at least 1.', 'page');
    return;
  }
  const page = pageText ? Number(pageText) : 1;
  if (page < 1) {
    fail(res, 400, 'page must be a whole number of at least 1.', 'page');
    return;
  }
  if (pageSizeText && !/^\d+$/.test(pageSizeText)) {
    fail(res, 400, 'pageSize must be a whole number from 1 to 100.', 'pageSize');
    return;
  }
  const pageSize = pageSizeText ? Number(pageSizeText) : 25;
  if (pageSize < 1 || pageSize > 100) {
    fail(res, 400, 'pageSize must be a whole number from 1 to 100.', 'pageSize');
    return;
  }

  try {
    const where = listWhere(search, status);
    const walkIn = await prisma.customer.findFirst({
      where: { AND: [where, { systemKey: WALK_IN_KEY }] },
    });
    const total = await prisma.customer.count({ where });
    const othersWhere: Prisma.CustomerWhereInput = walkIn
      ? { AND: [where, { id: { not: walkIn.id } }] }
      : where;
    const skip = walkIn ? Math.max(0, (page - 1) * pageSize - 1) : (page - 1) * pageSize;
    const take = walkIn && page === 1 ? Math.max(0, pageSize - 1) : pageSize;
    const others = take === 0
      ? []
      : await prisma.customer.findMany({
          where: othersWhere,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip,
          take,
        });
    const rows = walkIn && page === 1 ? [walkIn, ...others] : others;
    res.json({
      customers: rows.map(present),
      page,
      pageSize,
      total,
      pageCount: total === 0 ? 1 : Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('GET /api/customers error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.get('/walk-in', requirePermission('view_customers'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const row = await prisma.customer.findUnique({ where: { systemKey: WALK_IN_KEY } });
    if (!row) {
      res.status(409).json({ code: 'WALKIN_MISSING', message: 'Run npm run db:create-walkin' });
      return;
    }
    res.json(present(row));
  } catch (error) {
    console.error('GET /api/customers/walk-in error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.get('/:id', requirePermission('view_customers'), async (req: Request, res: Response): Promise<void> => {
  try {
    const row = await prisma.customer.findUnique({ where: { id: routeId(req.params.id) } });
    if (!row) {
      fail(res, 404, 'Customer not found.');
      return;
    }
    res.json(present(row));
  } catch (error) {
    console.error('GET /api/customers/:id error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.post('/', requirePermission('manage_customers'), async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (creditSent(body)) {
    fail(res, 400, CREDIT_ERROR, 'creditLimit');
    return;
  }
  const parsed = readInput(body);
  if (!parsed.ok) {
    fail(res, 400, parsed.error, parsed.field);
    return;
  }
  const taken = await phoneTaken(parsed.value.phoneKey);
  if (taken) {
    phoneConflict(res, taken);
    return;
  }
  try {
    const created = await prisma.customer.create({ data: parsed.value });
    await record(req, 'create', `Created customer ${quote(created.name)}`, { customerId: created.id });
    res.status(201).json(present(created));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await phoneTaken(parsed.value.phoneKey);
      if (existing) {
        phoneConflict(res, existing);
        return;
      }
    }
    console.error('POST /api/customers error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.put('/:id', requirePermission('manage_customers'), async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.customer.findUnique({ where: { id: routeId(req.params.id) } });
  if (!existing) {
    fail(res, 404, 'Customer not found.');
    return;
  }
  if (isLocked(existing)) {
    locked(res);
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (creditSent(body)) {
    fail(res, 400, CREDIT_ERROR, 'creditLimit');
    return;
  }
  const parsed = readInput(body, existing);
  if (!parsed.ok) {
    fail(res, 400, parsed.error, parsed.field);
    return;
  }
  const taken = await phoneTaken(parsed.value.phoneKey, existing.id);
  if (taken) {
    phoneConflict(res, taken);
    return;
  }
  try {
    const updated = await prisma.customer.update({ where: { id: existing.id }, data: parsed.value });
    await record(req, 'update', describeChanges(existing, parsed.value), { customerId: updated.id });
    res.json(present(updated));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const clash = await phoneTaken(parsed.value.phoneKey, existing.id);
      if (clash) {
        phoneConflict(res, clash);
        return;
      }
    }
    console.error('PUT /api/customers/:id error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.patch('/:id/status', requirePermission('manage_customers'), async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.customer.findUnique({ where: { id: routeId(req.params.id) } });
  if (!existing) {
    fail(res, 404, 'Customer not found.');
    return;
  }
  if (isLocked(existing)) {
    locked(res);
    return;
  }
  if (typeof req.body?.isActive !== 'boolean') {
    fail(res, 400, 'isActive must be true or false.', 'isActive');
    return;
  }
  if (existing.isActive === req.body.isActive) {
    res.json(present(existing));
    return;
  }
  try {
    const updated = await prisma.customer.update({
      where: { id: existing.id },
      data: { isActive: req.body.isActive },
    });
    await record(
      req,
      'status',
      updated.isActive ? `Activated customer ${quote(updated.name)}` : `Deactivated customer ${quote(updated.name)}`,
      { customerId: updated.id, isActive: updated.isActive },
    );
    res.json(present(updated));
  } catch (error) {
    console.error('PATCH /api/customers/:id/status error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

export default router;
