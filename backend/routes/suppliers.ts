import { Prisma } from '@prisma/client';
import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { requirePermission } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';

const router = Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type VendorRow = {
  id: string;
  name: string;
  nameKey: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxPin: string | null;
  paymentTerms: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type ParsedText = { ok: true; present: boolean; value: string | null } | { ok: false; error: string };

function routeId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function fail(res: Response, status: number, error: string, field?: string) {
  return res.status(status).json(field ? { error, field } : { error });
}

function quote(name: string): string {
  return `"${name}"`;
}

function queryText(value: unknown): string {
  if (Array.isArray(value)) return queryText(value[0]);
  return typeof value === 'string' ? value.trim() : '';
}

export function supplierNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function shown(value: string | null | undefined): string {
  return value == null || value === '' ? 'none' : value;
}

function present(row: VendorRow) {
  return {
    id: row.id,
    name: row.name,
    nameKey: row.nameKey,
    contactPerson: row.contactPerson,
    phone: row.phone,
    email: row.email,
    address: row.address,
    taxPin: row.taxPin,
    paymentTerms: row.paymentTerms,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function record(req: Request, action: string, description: string, metadata: Record<string, unknown>) {
  const user = req.user!;
  await logAuditEvent({
    eventType: 'supplier',
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

function parseName(value: unknown): { ok: true; name: string; nameKey: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'Name is required and must be 2 to 120 characters.' };
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120) {
    return { ok: false, error: 'Name is required and must be 2 to 120 characters.' };
  }
  return { ok: true, name, nameKey: supplierNameKey(name) };
}

function parseOptionalText(value: unknown, label: string, max: number, collapse: boolean): ParsedText {
  if (value === undefined) return { ok: true, present: false, value: null };
  if (value === null) return { ok: true, present: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: `${label} must be text.` };
  const text = collapse ? value.trim().replace(/\s+/g, ' ') : value.trim();
  if (!text) return { ok: true, present: true, value: null };
  if (text.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer.` };
  return { ok: true, present: true, value: text };
}

function parsePhone(value: unknown): ParsedText {
  if (value === undefined) return { ok: true, present: false, value: null };
  if (value === null) return { ok: true, present: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: 'Phone must be 9 to 15 digits.' };
  const phone = value.trim();
  if (!phone) return { ok: true, present: true, value: null };
  const digits = phone.replace(/[\s+-]/g, '');
  if (!/^\d{9,15}$/.test(digits)) return { ok: false, error: 'Phone must be 9 to 15 digits.' };
  return { ok: true, present: true, value: phone };
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

async function nameTaken(nameKey: string, exceptId?: string): Promise<VendorRow | null> {
  const existing = await prisma.vendor.findUnique({ where: { nameKey } });
  if (!existing || existing.id === exceptId) return null;
  return existing;
}

function conflict(res: Response, existing: VendorRow) {
  return fail(res, 409, `A supplier named ${quote(existing.name)} already exists.`, 'name');
}

type SupplierInput = {
  name: string;
  nameKey: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxPin: string | null;
  paymentTerms: string | null;
  notes: string | null;
};

function readInput(
  body: Record<string, unknown>,
  current?: VendorRow,
): { ok: true; value: SupplierInput } | { ok: false; error: string; field: string } {
  const nameSource = body.name === undefined && current ? current.name : body.name;
  const nameResult = parseName(nameSource);
  if (!nameResult.ok) return { ok: false, error: nameResult.error, field: 'name' };

  const contactPerson = parseOptionalText(body.contactPerson, 'Contact person', 120, true);
  if (!contactPerson.ok) return { ok: false, error: contactPerson.error, field: 'contactPerson' };
  const phone = parsePhone(body.phone);
  if (!phone.ok) return { ok: false, error: phone.error, field: 'phone' };
  const email = parseEmail(body.email);
  if (!email.ok) return { ok: false, error: email.error, field: 'email' };
  const address = parseOptionalText(body.address, 'Address', 200, false);
  if (!address.ok) return { ok: false, error: address.error, field: 'address' };
  const taxPin = parseOptionalText(body.taxPin, 'Tax PIN', 20, true);
  if (!taxPin.ok) return { ok: false, error: taxPin.error, field: 'taxPin' };
  const paymentTerms = parseOptionalText(body.paymentTerms, 'Payment terms', 60, true);
  if (!paymentTerms.ok) return { ok: false, error: paymentTerms.error, field: 'paymentTerms' };
  const notes = parseOptionalText(body.notes, 'Notes', 500, false);
  if (!notes.ok) return { ok: false, error: notes.error, field: 'notes' };

  return {
    ok: true,
    value: {
      name: nameResult.name,
      nameKey: nameResult.nameKey,
      contactPerson: contactPerson.present ? contactPerson.value : current?.contactPerson ?? null,
      phone: phone.present ? phone.value : current?.phone ?? null,
      email: email.present ? email.value : current?.email ?? null,
      address: address.present ? address.value : current?.address ?? null,
      taxPin: taxPin.present ? taxPin.value : current?.taxPin ?? null,
      paymentTerms: paymentTerms.present ? paymentTerms.value : current?.paymentTerms ?? null,
      notes: notes.present ? notes.value : current?.notes ?? null,
    },
  };
}

function describeChanges(before: VendorRow, after: SupplierInput): string {
  const name = after.name;
  const lines: string[] = [];
  if (before.name !== after.name) lines.push(`Changed name of ${quote(before.name)} from ${before.name} to ${after.name}`);
  if (before.contactPerson !== after.contactPerson) {
    lines.push(`Changed contact person of ${quote(name)} from ${shown(before.contactPerson)} to ${shown(after.contactPerson)}`);
  }
  if (before.phone !== after.phone) {
    lines.push(`Changed phone of ${quote(name)} from ${shown(before.phone)} to ${shown(after.phone)}`);
  }
  if (before.email !== after.email) {
    lines.push(`Changed email of ${quote(name)} from ${shown(before.email)} to ${shown(after.email)}`);
  }
  if (before.address !== after.address) {
    lines.push(`Changed address of ${quote(name)} from ${shown(before.address)} to ${shown(after.address)}`);
  }
  if (before.taxPin !== after.taxPin) {
    lines.push(`Changed tax PIN of ${quote(name)} from ${shown(before.taxPin)} to ${shown(after.taxPin)}`);
  }
  if (before.paymentTerms !== after.paymentTerms) {
    lines.push(`Changed payment terms of ${quote(name)} from ${shown(before.paymentTerms)} to ${shown(after.paymentTerms)}`);
  }
  if (before.notes !== after.notes) {
    lines.push(`Changed notes of ${quote(name)} from ${shown(before.notes)} to ${shown(after.notes)}`);
  }
  return lines.length > 0 ? lines.join('. ') : `Updated supplier ${quote(name)}`;
}

router.get('/', requirePermission('view_suppliers'), async (req: Request, res: Response): Promise<void> => {
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
    const where: Prisma.VendorWhereInput = {};
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.vendor.count({ where }),
      prisma.vendor.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    res.json({
      suppliers: rows.map(present),
      page,
      pageSize,
      total,
      pageCount: total === 0 ? 1 : Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('GET /api/suppliers error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.get('/:id', requirePermission('view_suppliers'), async (req: Request, res: Response): Promise<void> => {
  try {
    const row = await prisma.vendor.findUnique({ where: { id: routeId(req.params.id) } });
    if (!row) {
      fail(res, 404, 'Supplier not found.');
      return;
    }
    res.json(present(row));
  } catch (error) {
    console.error('GET /api/suppliers/:id error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.post('/', requirePermission('manage_suppliers'), async (req: Request, res: Response): Promise<void> => {
  const parsed = readInput((req.body ?? {}) as Record<string, unknown>);
  if (!parsed.ok) {
    fail(res, 400, parsed.error, parsed.field);
    return;
  }
  const taken = await nameTaken(parsed.value.nameKey);
  if (taken) {
    conflict(res, taken);
    return;
  }
  try {
    const created = await prisma.vendor.create({ data: parsed.value });
    await record(req, 'create', `Created supplier ${quote(created.name)}`, { supplierId: created.id });
    res.status(201).json(present(created));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await nameTaken(parsed.value.nameKey);
      if (existing) {
        conflict(res, existing);
        return;
      }
      fail(res, 409, 'A supplier with this name already exists.', 'name');
      return;
    }
    console.error('POST /api/suppliers error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.put('/:id', requirePermission('manage_suppliers'), async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.vendor.findUnique({ where: { id: routeId(req.params.id) } });
  if (!existing) {
    fail(res, 404, 'Supplier not found.');
    return;
  }
  const parsed = readInput((req.body ?? {}) as Record<string, unknown>, existing);
  if (!parsed.ok) {
    fail(res, 400, parsed.error, parsed.field);
    return;
  }
  const taken = await nameTaken(parsed.value.nameKey, existing.id);
  if (taken) {
    conflict(res, taken);
    return;
  }
  try {
    const updated = await prisma.vendor.update({ where: { id: existing.id }, data: parsed.value });
    await record(req, 'update', describeChanges(existing, parsed.value), { supplierId: updated.id });
    res.json(present(updated));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const clash = await nameTaken(parsed.value.nameKey, existing.id);
      if (clash) {
        conflict(res, clash);
        return;
      }
      fail(res, 409, 'A supplier with this name already exists.', 'name');
      return;
    }
    console.error('PUT /api/suppliers/:id error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.patch('/:id/status', requirePermission('manage_suppliers'), async (req: Request, res: Response): Promise<void> => {
  if (typeof req.body?.isActive !== 'boolean') {
    fail(res, 400, 'isActive must be true or false.', 'isActive');
    return;
  }
  const existing = await prisma.vendor.findUnique({ where: { id: routeId(req.params.id) } });
  if (!existing) {
    fail(res, 404, 'Supplier not found.');
    return;
  }
  if (existing.isActive === req.body.isActive) {
    res.json(present(existing));
    return;
  }
  try {
    const updated = await prisma.vendor.update({
      where: { id: existing.id },
      data: { isActive: req.body.isActive },
    });
    await record(
      req,
      'status',
      updated.isActive ? `Activated supplier ${quote(updated.name)}` : `Deactivated supplier ${quote(updated.name)}`,
      { supplierId: updated.id, isActive: updated.isActive },
    );
    res.json(present(updated));
  } catch (error) {
    console.error('PATCH /api/suppliers/:id/status error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

export default router;
