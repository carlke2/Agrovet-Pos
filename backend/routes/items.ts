import { Prisma, TaxType } from '@prisma/client';
import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { hasPermission, requirePermission } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';
import { resolveItemPrice, type MarkupSource } from '@/services/itemPricing';

const router = Router();

const TAX_TYPES: readonly TaxType[] = ['NONE', 'STANDARD', 'ZERO_RATED', 'EXEMPT'];
const PRICE_FIELDS = ['costPrice', 'markupPercent', 'sellingPrice'] as const;

const itemInclude = {
  category: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true, abbreviation: true } },
  _count: { select: { packs: true } },
} as const;

type ItemRow = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;

type CategoryForPrice = {
  id: string;
  name: string;
  isActive: boolean;
  tracksExpiryByDefault: boolean;
  defaultMarkupPercent: Prisma.Decimal | null;
  parent: { defaultMarkupPercent: Prisma.Decimal | null } | null;
};

function routeId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function fail(res: Response, status: number, error: string, field?: string, code?: string) {
  res.status(status).json({
    error,
    ...(field ? { field } : {}),
    ...(code ? { code } : {}),
  });
}

function quote(name: string): string {
  return `"${name}"`;
}

function readFlag(value: unknown): boolean {
  if (Array.isArray(value)) return readFlag(value[0]);
  return value === true || value === 'true' || value === '1';
}

function queryText(value: unknown): string {
  if (Array.isArray(value)) return queryText(value[0]);
  return typeof value === 'string' ? value.trim() : '';
}

export function effectiveSku(sku: string | null, itemNo: number): string {
  if (sku && sku.trim()) return sku;
  return `ITM-${String(itemNo).padStart(5, '0')}`;
}

function jsonDecimal(value: Prisma.Decimal | null, places: number): number | null {
  if (value == null) return null;
  return Number(value.toFixed(places));
}

function moneyLabel(value: Prisma.Decimal | null | undefined): string {
  if (value == null) return 'none';
  const text = value.toDecimalPlaces(2).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  return `KES ${text}`;
}

function percentLabel(value: Prisma.Decimal | null | undefined): string {
  if (value == null) return 'none';
  const text = value.toDecimalPlaces(2).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  return `${text}%`;
}

type PackRow = {
  id: string;
  itemId: string;
  name: string;
  nameKey: string;
  quantityInBase: Prisma.Decimal;
  barcode: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function presentPack(pack: PackRow) {
  return {
    id: pack.id,
    itemId: pack.itemId,
    name: pack.name,
    nameKey: pack.nameKey,
    quantityInBase: jsonDecimal(pack.quantityInBase, 3),
    barcode: pack.barcode,
    isActive: pack.isActive,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
  };
}

function present(row: ItemRow & { packs?: PackRow[] }, canViewCost: boolean) {
  const body: Record<string, unknown> = {
    id: row.id,
    itemNo: row.itemNo,
    name: row.name,
    nameKey: row.nameKey,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    brand: row.brand,
    activeIngredient: row.activeIngredient,
    strength: row.strength,
    isRegulated: row.isRegulated,
    imageUrl: row.imageUrl,
    packCount: row._count.packs,
    sku: row.sku,
    effectiveSku: effectiveSku(row.sku, row.itemNo),
    barcode: row.barcode,
    unitId: row.unitId,
    unitName: row.unit.name,
    unitAbbreviation: row.unit.abbreviation,
    sellingPrice: jsonDecimal(row.sellingPrice, 2),
    priceOverridden: row.priceOverridden,
    taxType: row.taxType,
    tracksExpiry: row.tracksExpiry,
    reorderLevel: jsonDecimal(row.reorderLevel, 3),
    isActive: row.isActive,
    needsPrice: row.sellingPrice == null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (canViewCost) {
    body.costPrice = jsonDecimal(row.costPrice, 2);
    body.markupPercent = jsonDecimal(row.markupPercent, 2);
  }
  if (row.packs) body.packs = row.packs.map(presentPack);
  return body;
}

function bodyHasPriceField(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  return PRICE_FIELDS.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function refusePricePermission(req: Request, res: Response): boolean {
  if (!bodyHasPriceField(req.body) || hasPermission(req.user, 'manage_prices')) return false;
  res.status(403).json({
    error: 'Setting cost, markup, or selling price requires the manage prices permission.',
  });
  return true;
}

async function record(
  req: Request,
  action: string,
  description: string,
  metadata: Record<string, unknown>,
  eventType = 'item',
) {
  const user = req.user!;
  await logAuditEvent({
    eventType,
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

type ParsedDecimal =
  | { ok: true; present: boolean; value: Prisma.Decimal | null }
  | { ok: false; error: string };

function decimalText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function parseDecimal(
  value: unknown,
  label: string,
  min: string,
  max: string | null,
  places: number,
): ParsedDecimal {
  if (value === undefined) return { ok: true, present: false, value: null };
  if (Prisma.Decimal.isDecimal(value)) return { ok: true, present: true, value: new Prisma.Decimal(value) };
  if (value === null || value === '') return { ok: true, present: true, value: null };
  const text = decimalText(value);
  const range = max == null ? `at least ${min}` : `from ${min} to ${max}`;
  const message = `${label} must be a number ${range}, with at most ${places} decimal places.`;
  if (!text || !/^\d+(\.\d+)?$/.test(text)) return { ok: false, error: message };
  const fraction = text.split('.')[1]?.length ?? 0;
  if (fraction > places) return { ok: false, error: message };
  const amount = new Prisma.Decimal(text);
  if (amount.lessThan(min) || (max != null && amount.greaterThan(max))) return { ok: false, error: message };
  return { ok: true, present: true, value: amount };
}

function parseName(value: unknown): { ok: true; name: string; nameKey: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'Name is required and must be 2 to 120 characters.' };
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120) {
    return { ok: false, error: 'Name is required and must be 2 to 120 characters.' };
  }
  return { ok: true, name, nameKey: name.toLowerCase() };
}

function parseOptionalText(
  value: unknown,
  label: string,
  max: number,
): { ok: true; present: boolean; value: string | null } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, present: false, value: null };
  if (value === null) return { ok: true, present: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: `${label} must be text.` };
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) return { ok: true, present: true, value: null };
  if (text.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer.` };
  return { ok: true, present: true, value: text };
}

function parseBarcode(value: unknown): { ok: true; present: boolean; value: string | null } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, present: false, value: null };
  if (value === null || value === '') return { ok: true, present: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: 'Barcode must be 4 to 32 characters.' };
  const barcode = value.trim();
  if (barcode.length < 4 || barcode.length > 32) {
    return { ok: false, error: 'Barcode must be 4 to 32 characters.' };
  }
  return { ok: true, present: true, value: barcode };
}

function parseSku(value: unknown): { ok: true; present: boolean; value: string | null } | { ok: false; error: string } {
  const parsed = parseOptionalText(value, 'SKU', 40);
  if (!parsed.ok) return parsed;
  if (parsed.value && parsed.value.length < 1) return { ok: true, present: true, value: null };
  return parsed;
}

function parseBooleanField(
  value: unknown,
  label: string,
): { ok: true; present: boolean; value: boolean } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, present: false, value: false };
  if (typeof value !== 'boolean') return { ok: false, error: `${label} must be true or false.` };
  return { ok: true, present: true, value };
}

function packNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function quantityLabel(value: Prisma.Decimal): string {
  return value.toFixed(3).replace(/\.?0+$/, '');
}

function parsePackName(value: unknown): { ok: true; name: string; nameKey: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'Name is required and must be 2 to 30 characters.' };
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 30) return { ok: false, error: 'Name is required and must be 2 to 30 characters.' };
  return { ok: true, name, nameKey: packNameKey(name) };
}

function parsePackQuantity(value: unknown): { ok: true; value: Prisma.Decimal } | { ok: false; error: string } {
  const parsed = parseDecimal(value, 'Pack quantity', '0', '100000', 3);
  if (!parsed.ok) return parsed;
  if (!parsed.present || parsed.value == null || parsed.value.lte(0)) {
    return { ok: false, error: 'Pack quantity must be greater than 0 and at most 100000, with at most 3 decimal places.' };
  }
  return { ok: true, value: parsed.value };
}

async function barcodeConflict(barcode: string, except?: { itemId?: string; packId?: string }): Promise<string | null> {
  const item = await prisma.item.findUnique({ where: { barcode }, select: { id: true, name: true } });
  if (item && item.id !== except?.itemId) return `Barcode is already used by ${quote(item.name)}.`;
  const pack = await prisma.itemPack.findUnique({
    where: { barcode },
    include: { item: { select: { name: true } } },
  });
  if (pack && pack.id !== except?.packId) {
    return `Barcode is already used by pack ${quote(pack.name)} on ${quote(pack.item.name)}.`;
  }
  return null;
}

function parseTax(value: unknown): { ok: true; present: boolean; value: TaxType } | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') return { ok: true, present: false, value: 'NONE' };
  if (typeof value !== 'string' || !TAX_TYPES.includes(value as TaxType)) {
    return { ok: false, error: 'Tax type must be NONE, STANDARD, ZERO_RATED, or EXEMPT.' };
  }
  return { ok: true, present: true, value: value as TaxType };
}

function decimalsDiffer(left: Prisma.Decimal | null, right: Prisma.Decimal | null): boolean {
  if (left == null && right == null) return false;
  if (left == null || right == null) return true;
  return !left.equals(right);
}

async function loadCategory(id: string): Promise<CategoryForPrice | null> {
  return prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      isActive: true,
      tracksExpiryByDefault: true,
      defaultMarkupPercent: true,
      parent: { select: { defaultMarkupPercent: true } },
    },
  });
}

async function loadUnit(id: string) {
  return prisma.unit.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true },
  });
}

function priceFrom(cost: Prisma.Decimal | null, markup: Prisma.Decimal | null, category: CategoryForPrice) {
  return resolveItemPrice({
    costPrice: cost,
    itemMarkup: markup,
    categoryMarkup: category.defaultMarkupPercent,
    parentMarkup: category.parent?.defaultMarkupPercent ?? null,
  });
}

router.post('/price-preview', requirePermission('manage_prices'), async (req: Request, res: Response): Promise<void> => {
  const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId.trim() : '';
  if (!categoryId) {
    fail(res, 400, 'Category is required.', 'categoryId');
    return;
  }
  const cost = parseDecimal(req.body?.costPrice, 'Cost price', '0', null, 2);
  if (!cost.ok) {
    fail(res, 400, cost.error, 'costPrice');
    return;
  }
  if (!cost.present || cost.value == null) {
    fail(res, 400, 'Cost price is required.', 'costPrice');
    return;
  }
  const markup = parseDecimal(req.body?.markupPercent, 'Markup', '0', '1000', 2);
  if (!markup.ok) {
    fail(res, 400, markup.error, 'markupPercent');
    return;
  }
  try {
    const category = await loadCategory(categoryId);
    if (!category) {
      fail(res, 400, 'Category was not found.', 'categoryId');
      return;
    }
    const priced = priceFrom(cost.value, markup.present ? markup.value : null, category);
    res.json({
      resolvedMarkupPercent: jsonDecimal(priced.resolvedMarkupPercent, 2),
      markupSource: priced.markupSource satisfies MarkupSource,
      suggestedSellingPrice: jsonDecimal(priced.suggestedSellingPrice, 2),
    });
  } catch (error) {
    console.error('POST /api/items/price-preview error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.get('/', requirePermission('view_catalog'), async (req: Request, res: Response): Promise<void> => {
  const search = queryText(req.query.search);
  const categoryId = queryText(req.query.categoryId);
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
  const regulated = queryText(req.query.regulated);
  if (regulated && regulated !== 'true' && regulated !== 'false') {
    fail(res, 400, 'regulated must be true or false.', 'regulated');
    return;
  }

  try {
    const where: Prisma.ItemWhereInput = {};
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;
    if (regulated === 'true') where.isRegulated = true;
    if (regulated === 'false') where.isRegulated = false;
    if (readFlag(req.query.needsPrice)) where.sellingPrice = null;
    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
      if (!category) {
        fail(res, 400, 'Category was not found.', 'categoryId');
        return;
      }
      const children = await prisma.category.findMany({ where: { parentId: categoryId }, select: { id: true } });
      where.categoryId = { in: [categoryId, ...children.map((child) => child.id)] };
    }
    if (search) {
      const or: Prisma.ItemWhereInput[] = [
        { name: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { equals: search } },
        { activeIngredient: { contains: search, mode: 'insensitive' } },
      ];
      const generated = /^ITM-(\d+)$/i.exec(search);
      if (generated) {
        const itemNo = Number(generated[1]);
        if (Number.isSafeInteger(itemNo)) or.push({ itemNo, sku: null });
      }
      where.OR = or;
    }

    const [total, rows] = await Promise.all([
      prisma.item.count({ where }),
      prisma.item.findMany({
        where,
        include: itemInclude,
        orderBy: [{ name: 'asc' }, { itemNo: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const canViewCost = hasPermission(req.user, 'view_cost');
    res.json({
      items: rows.map((row) => present(row, canViewCost)),
      page,
      pageSize,
      total,
      pageCount: total === 0 ? 1 : Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('GET /api/items error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.post('/bulk-category', requirePermission('manage_catalog'), async (req: Request, res: Response): Promise<void> => {
  const rawIds = req.body?.itemIds;
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 200 || rawIds.some((id) => typeof id !== 'string' || !id.trim())) {
    fail(res, 400, 'Choose between 1 and 200 items.', 'itemIds');
    return;
  }
  const itemIds = [...new Set(rawIds.map((id: string) => id.trim()))];
  const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId.trim() : '';
  if (!categoryId) {
    fail(res, 400, 'Category is required.', 'categoryId');
    return;
  }

  try {
    const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true, name: true, isActive: true } });
    if (!category) {
      fail(res, 400, 'Category was not found.', 'categoryId');
      return;
    }
    if (!category.isActive) {
      fail(res, 400, 'Choose an active category.', 'categoryId');
      return;
    }
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      include: { category: { select: { name: true } } },
    });
    if (items.length !== itemIds.length) {
      fail(res, 400, 'One or more items were not found.', 'itemIds');
      return;
    }

    const moving = items.filter((item) => item.categoryId !== categoryId);
    const occupants = await prisma.item.findMany({
      where: {
        categoryId,
        nameKey: { in: moving.map((item) => item.nameKey) },
        id: { notIn: itemIds },
      },
      select: { nameKey: true },
    });
    const occupantKeys = new Set(occupants.map((row) => row.nameKey));
    const batchCount = new Map<string, number>();
    for (const item of moving) batchCount.set(item.nameKey, (batchCount.get(item.nameKey) || 0) + 1);
    const colliding = moving.filter((item) => occupantKeys.has(item.nameKey) || (batchCount.get(item.nameKey) || 0) > 1);
    if (colliding.length > 0) {
      const names = [...new Set(colliding.map((item) => quote(item.name)))].join(', ');
      fail(res, 409, `Cannot move these items because the names already exist in ${quote(category.name)}: ${names}.`, 'itemIds');
      return;
    }

    await prisma.$transaction(moving.map((item) => prisma.item.update({ where: { id: item.id }, data: { categoryId } })));
    const sources = [...new Set(moving.map((item) => item.category.name))];
    const fromText = sources.length > 0 ? `from ${sources.map((name) => quote(name)).join(' and ')} ` : '';
    await record(req, 'bulk-category', `Moved ${moving.length} items ${fromText}to ${quote(category.name)}`, {
      itemIds: moving.map((item) => item.id),
      categoryId,
    });
    res.json({ moved: moving.length, categoryId, categoryName: category.name });
  } catch (error) {
    console.error('POST /api/items/bulk-category error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.get('/:id', requirePermission('view_catalog'), async (req: Request, res: Response): Promise<void> => {
  try {
    const row = await prisma.item.findUnique({
      where: { id: routeId(req.params.id) },
      include: { ...itemInclude, packs: { orderBy: [{ name: 'asc' }, { id: 'asc' }] } },
    });
    if (!row) {
      fail(res, 404, 'Item not found.');
      return;
    }
    res.json(present(row, hasPermission(req.user, 'view_cost')));
  } catch (error) {
    console.error('GET /api/items/:id error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.post('/', requirePermission('manage_catalog'), async (req: Request, res: Response): Promise<void> => {
  if (refusePricePermission(req, res)) return;

  const nameResult = parseName(req.body?.name);
  if (!nameResult.ok) {
    fail(res, 400, nameResult.error, 'name');
    return;
  }
  const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId.trim() : '';
  if (!categoryId) {
    fail(res, 400, 'Category is required.', 'categoryId');
    return;
  }
  const unitId = typeof req.body?.unitId === 'string' ? req.body.unitId.trim() : '';
  if (!unitId) {
    fail(res, 400, 'Unit is required.', 'unitId');
    return;
  }
  const brand = parseOptionalText(req.body?.brand, 'Brand', 80);
  if (!brand.ok) {
    fail(res, 400, brand.error, 'brand');
    return;
  }
  const ingredient = parseOptionalText(req.body?.activeIngredient, 'Active ingredient', 120);
  if (!ingredient.ok) {
    fail(res, 400, ingredient.error, 'activeIngredient');
    return;
  }
  const strength = parseOptionalText(req.body?.strength, 'Strength', 120);
  if (!strength.ok) {
    fail(res, 400, strength.error, 'strength');
    return;
  }
  const regulated = parseBooleanField(req.body?.isRegulated, 'Regulated');
  if (!regulated.ok) {
    fail(res, 400, regulated.error, 'isRegulated');
    return;
  }
  const sku = parseSku(req.body?.sku);
  if (!sku.ok) {
    fail(res, 400, sku.error, 'sku');
    return;
  }
  const barcode = parseBarcode(req.body?.barcode);
  if (!barcode.ok) {
    fail(res, 400, barcode.error, 'barcode');
    return;
  }
  const cost = parseDecimal(req.body?.costPrice, 'Cost price', '0', null, 2);
  if (!cost.ok) {
    fail(res, 400, cost.error, 'costPrice');
    return;
  }
  const markup = parseDecimal(req.body?.markupPercent, 'Markup', '0', '1000', 2);
  if (!markup.ok) {
    fail(res, 400, markup.error, 'markupPercent');
    return;
  }
  const selling = parseDecimal(req.body?.sellingPrice, 'Selling price', '0', null, 2);
  if (!selling.ok) {
    fail(res, 400, selling.error, 'sellingPrice');
    return;
  }
  const reorder = parseDecimal(req.body?.reorderLevel === undefined ? '0' : req.body.reorderLevel, 'Reorder level', '0', null, 3);
  if (!reorder.ok || reorder.value == null) {
    fail(res, 400, reorder.ok ? 'Reorder level must be 0 or greater.' : reorder.error, 'reorderLevel');
    return;
  }
  const tax = parseTax(req.body?.taxType);
  if (!tax.ok) {
    fail(res, 400, tax.error, 'taxType');
    return;
  }
  if (req.body?.tracksExpiry !== undefined && typeof req.body.tracksExpiry !== 'boolean') {
    fail(res, 400, 'Tracks expiry must be true or false.', 'tracksExpiry');
    return;
  }

  try {
    const category = await loadCategory(categoryId);
    if (!category) {
      fail(res, 400, 'Category was not found.', 'categoryId');
      return;
    }
    if (!category.isActive) {
      fail(res, 400, 'Choose an active category.', 'categoryId');
      return;
    }
    const unit = await loadUnit(unitId);
    if (!unit) {
      fail(res, 400, 'Unit was not found.', 'unitId');
      return;
    }
    if (!unit.isActive) {
      fail(res, 400, 'Choose an active unit.', 'unitId');
      return;
    }
    const takenName = await prisma.item.findUnique({
      where: { categoryId_nameKey: { categoryId, nameKey: nameResult.nameKey } },
    });
    if (takenName) {
      fail(res, 409, `An item named ${quote(takenName.name)} already uses this name in this category.`, 'name');
      return;
    }
    if (barcode.value) {
      const barcodeError = await barcodeConflict(barcode.value);
      if (barcodeError) {
        fail(res, 409, barcodeError, 'barcode');
        return;
      }
    }
    if (sku.value) {
      const takenSku = await prisma.item.findUnique({ where: { sku: sku.value } });
      if (takenSku) {
        fail(res, 409, `SKU is already used by ${quote(takenSku.name)}.`, 'sku');
        return;
      }
    }

    const tracksExpiry = req.body?.tracksExpiry === undefined ? category.tracksExpiryByDefault : req.body.tracksExpiry === true;
    const priced = priceFrom(cost.value, markup.value, category);
    let sellingPrice = selling.present ? selling.value : null;
    let priceOverridden = false;
    if (selling.present && selling.value != null) {
      sellingPrice = selling.value;
      priceOverridden = true;
    } else if (!selling.present && priced.suggestedSellingPrice != null) {
      sellingPrice = priced.suggestedSellingPrice;
      priceOverridden = false;
    }

    if (sellingPrice != null && cost.value != null && sellingPrice.lessThan(cost.value) && req.body?.allowBelowCost !== true) {
      fail(
        res,
        422,
        `Selling price ${moneyLabel(sellingPrice)} is below cost ${moneyLabel(cost.value)}.`,
        'sellingPrice',
        'BELOW_COST',
      );
      return;
    }

    const created = await prisma.item.create({
      data: {
        name: nameResult.name,
        nameKey: nameResult.nameKey,
        categoryId,
        unitId,
        brand: brand.value,
        activeIngredient: ingredient.value,
        strength: strength.value,
        isRegulated: regulated.value,
        sku: sku.value,
        barcode: barcode.value,
        costPrice: cost.value,
        markupPercent: markup.value,
        sellingPrice,
        priceOverridden,
        taxType: tax.value,
        tracksExpiry,
        reorderLevel: reorder.value,
      },
      include: itemInclude,
    });
    await record(
      req,
      'create',
      `Created item ${quote(created.name)} with cost ${moneyLabel(created.costPrice)}, markup ${percentLabel(created.markupPercent)}, selling price ${moneyLabel(created.sellingPrice)}${created.isRegulated ? `. Marked ${quote(created.name)} as regulated` : ''}`,
      { itemId: created.id, markupSource: priced.markupSource },
    );
    res.status(201).json(present(created, hasPermission(req.user, 'view_cost')));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      fail(res, 409, 'An item with this name, SKU, or barcode already exists.');
      return;
    }
    console.error('POST /api/items error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.put('/:id', requirePermission('manage_catalog'), async (req: Request, res: Response): Promise<void> => {
  if (refusePricePermission(req, res)) return;

  const existing = await prisma.item.findUnique({
    where: { id: routeId(req.params.id) },
    include: itemInclude,
  });
  if (!existing) {
    fail(res, 404, 'Item not found.');
    return;
  }

  const nameResult = parseName(req.body?.name === undefined ? existing.name : req.body.name);
  if (!nameResult.ok) {
    fail(res, 400, nameResult.error, 'name');
    return;
  }
  const categoryId = req.body?.categoryId === undefined ? existing.categoryId : String(req.body.categoryId || '').trim();
  if (!categoryId) {
    fail(res, 400, 'Category is required.', 'categoryId');
    return;
  }
  const unitId = req.body?.unitId === undefined ? existing.unitId : String(req.body.unitId || '').trim();
  if (!unitId) {
    fail(res, 400, 'Unit is required.', 'unitId');
    return;
  }
  const brand = parseOptionalText(req.body?.brand === undefined ? existing.brand : req.body.brand, 'Brand', 80);
  if (!brand.ok) {
    fail(res, 400, brand.error, 'brand');
    return;
  }
  const ingredient = parseOptionalText(
    req.body?.activeIngredient === undefined ? existing.activeIngredient : req.body.activeIngredient,
    'Active ingredient',
    120,
  );
  if (!ingredient.ok) {
    fail(res, 400, ingredient.error, 'activeIngredient');
    return;
  }
  const strength = parseOptionalText(req.body?.strength === undefined ? existing.strength : req.body.strength, 'Strength', 120);
  if (!strength.ok) {
    fail(res, 400, strength.error, 'strength');
    return;
  }
  const regulated = parseBooleanField(
    req.body?.isRegulated === undefined ? existing.isRegulated : req.body.isRegulated,
    'Regulated',
  );
  if (!regulated.ok) {
    fail(res, 400, regulated.error, 'isRegulated');
    return;
  }
  const sku = parseSku(req.body?.sku === undefined ? existing.sku : req.body.sku);
  if (!sku.ok) {
    fail(res, 400, sku.error, 'sku');
    return;
  }
  const barcode = parseBarcode(req.body?.barcode === undefined ? existing.barcode : req.body.barcode);
  if (!barcode.ok) {
    fail(res, 400, barcode.error, 'barcode');
    return;
  }
  const cost = parseDecimal(req.body?.costPrice === undefined ? existing.costPrice : req.body.costPrice, 'Cost price', '0', null, 2);
  if (!cost.ok) {
    fail(res, 400, cost.error, 'costPrice');
    return;
  }
  const markup = parseDecimal(
    req.body?.markupPercent === undefined ? existing.markupPercent : req.body.markupPercent,
    'Markup',
    '0',
    '1000',
    2,
  );
  if (!markup.ok) {
    fail(res, 400, markup.error, 'markupPercent');
    return;
  }
  const sellingInput = parseDecimal(
    req.body?.sellingPrice === undefined ? undefined : req.body.sellingPrice,
    'Selling price',
    '0',
    null,
    2,
  );
  if (!sellingInput.ok) {
    fail(res, 400, sellingInput.error, 'sellingPrice');
    return;
  }
  const reorder = parseDecimal(
    req.body?.reorderLevel === undefined ? existing.reorderLevel : req.body.reorderLevel,
    'Reorder level',
    '0',
    null,
    3,
  );
  if (!reorder.ok || reorder.value == null) {
    fail(res, 400, reorder.ok ? 'Reorder level must be 0 or greater.' : reorder.error, 'reorderLevel');
    return;
  }
  const tax = parseTax(req.body?.taxType === undefined ? existing.taxType : req.body.taxType);
  if (!tax.ok) {
    fail(res, 400, tax.error, 'taxType');
    return;
  }
  const tracksExpiry = req.body?.tracksExpiry === undefined ? existing.tracksExpiry : req.body.tracksExpiry;
  if (typeof tracksExpiry !== 'boolean') {
    fail(res, 400, 'Tracks expiry must be true or false.', 'tracksExpiry');
    return;
  }

  const nextCost = cost.value;
  const nextMarkup = markup.value;
  const sellingProvided = req.body?.sellingPrice !== undefined;
  const nextSelling = sellingProvided ? sellingInput.value : existing.sellingPrice;
  const nextOverridden = sellingProvided ? sellingInput.value != null : existing.priceOverridden;

  if (
    bodyHasPriceField(req.body) &&
    nextSelling != null &&
    nextCost != null &&
    nextSelling.lessThan(nextCost) &&
    req.body?.allowBelowCost !== true
  ) {
    fail(
      res,
      422,
      `Selling price ${moneyLabel(nextSelling)} is below cost ${moneyLabel(nextCost)}.`,
      'sellingPrice',
      'BELOW_COST',
    );
    return;
  }

  try {
    const category = await loadCategory(categoryId);
    if (!category) {
      fail(res, 400, 'Category was not found.', 'categoryId');
      return;
    }
    if (!category.isActive && categoryId !== existing.categoryId) {
      fail(res, 400, 'Choose an active category.', 'categoryId');
      return;
    }
    const unit = await loadUnit(unitId);
    if (!unit) {
      fail(res, 400, 'Unit was not found.', 'unitId');
      return;
    }
    if (!unit.isActive && unitId !== existing.unitId) {
      fail(res, 400, 'Choose an active unit.', 'unitId');
      return;
    }
    if (unitId !== existing.unitId) {
      const packCount = await prisma.itemPack.count({ where: { itemId: existing.id } });
      if (packCount > 0) {
        fail(res, 409, `The unit of ${quote(existing.name)} cannot be changed while it has pack sizes.`, 'unitId');
        return;
      }
    }
    const takenName = await prisma.item.findUnique({
      where: { categoryId_nameKey: { categoryId, nameKey: nameResult.nameKey } },
    });
    if (takenName && takenName.id !== existing.id) {
      fail(res, 409, `An item named ${quote(takenName.name)} already uses this name in this category.`, 'name');
      return;
    }
    if (barcode.value) {
      const barcodeError = await barcodeConflict(barcode.value, { itemId: existing.id });
      if (barcodeError) {
        fail(res, 409, barcodeError, 'barcode');
        return;
      }
    }
    if (sku.value) {
      const takenSku = await prisma.item.findUnique({ where: { sku: sku.value } });
      if (takenSku && takenSku.id !== existing.id) {
        fail(res, 409, `SKU is already used by ${quote(takenSku.name)}.`, 'sku');
        return;
      }
    }

    const priced = priceFrom(nextCost, nextMarkup, category);
    const changes: string[] = [];
    if (nameResult.name !== existing.name) changes.push(`Renamed item ${quote(existing.name)} to ${quote(nameResult.name)}`);
    if (decimalsDiffer(existing.costPrice, nextCost)) {
      changes.push(`Changed cost of ${quote(nameResult.name)} from ${moneyLabel(existing.costPrice)} to ${moneyLabel(nextCost)}`);
    }
    if (decimalsDiffer(existing.markupPercent, nextMarkup)) {
      changes.push(
        `Changed markup of ${quote(nameResult.name)} from ${percentLabel(existing.markupPercent)} to ${percentLabel(nextMarkup)}`,
      );
    }
    if (decimalsDiffer(existing.sellingPrice, nextSelling)) {
      changes.push(
        `Changed selling price of ${quote(nameResult.name)} from ${moneyLabel(existing.sellingPrice)} to ${moneyLabel(nextSelling)}`,
      );
    }
    if (categoryId !== existing.categoryId) changes.push(`Moved ${quote(nameResult.name)} to category ${quote(category.name)}`);
    if (unitId !== existing.unitId) changes.push(`Changed the unit of ${quote(nameResult.name)} to ${quote(unit.name)}`);
    if ((brand.value ?? null) !== (existing.brand ?? null)) changes.push(`Changed the brand of ${quote(nameResult.name)}`);
    if ((ingredient.value ?? null) !== (existing.activeIngredient ?? null)) {
      changes.push(
        `Changed active ingredient of ${quote(nameResult.name)} from ${existing.activeIngredient || 'none'} to ${ingredient.value || 'none'}`,
      );
    }
    if ((strength.value ?? null) !== (existing.strength ?? null)) {
      changes.push(`Changed strength of ${quote(nameResult.name)} from ${existing.strength || 'none'} to ${strength.value || 'none'}`);
    }
    if (regulated.value !== existing.isRegulated) {
      changes.push(
        regulated.value ? `Marked ${quote(nameResult.name)} as regulated` : `Cleared the regulated mark on ${quote(nameResult.name)}`,
      );
    }
    if ((sku.value ?? null) !== (existing.sku ?? null)) changes.push(`Changed the SKU of ${quote(nameResult.name)}`);
    if ((barcode.value ?? null) !== (existing.barcode ?? null)) changes.push(`Changed the barcode of ${quote(nameResult.name)}`);
    if (tracksExpiry !== existing.tracksExpiry) {
      changes.push(
        tracksExpiry
          ? `Turned expiry tracking on for ${quote(nameResult.name)}`
          : `Turned expiry tracking off for ${quote(nameResult.name)}`,
      );
    }
    if (tax.value !== existing.taxType) changes.push(`Changed the tax type of ${quote(nameResult.name)}`);
    if (decimalsDiffer(existing.reorderLevel, reorder.value)) {
      changes.push(`Changed the reorder level of ${quote(nameResult.name)}`);
    }

    const updated = await prisma.item.update({
      where: { id: existing.id },
      data: {
        name: nameResult.name,
        nameKey: nameResult.nameKey,
        categoryId,
        unitId,
        brand: brand.value,
        activeIngredient: ingredient.value,
        strength: strength.value,
        isRegulated: regulated.value,
        sku: sku.value,
        barcode: barcode.value,
        costPrice: nextCost,
        markupPercent: nextMarkup,
        sellingPrice: nextSelling,
        priceOverridden: nextOverridden,
        taxType: tax.value,
        tracksExpiry,
        reorderLevel: reorder.value,
      },
      include: itemInclude,
    });
    await record(req, 'update', changes.length > 0 ? changes.join('. ') : `Updated item ${quote(updated.name)}`, {
      itemId: updated.id,
      markupSource: priced.markupSource,
      suggestedSellingPrice: priced.suggestedSellingPrice?.toFixed(2) ?? null,
    });
    res.json(present(updated, hasPermission(req.user, 'view_cost')));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      fail(res, 409, 'An item with this name, SKU, or barcode already exists.');
      return;
    }
    console.error('PUT /api/items/:id error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.patch('/:id/status', requirePermission('manage_catalog'), async (req: Request, res: Response): Promise<void> => {
  if (typeof req.body?.isActive !== 'boolean') {
    fail(res, 400, 'isActive must be true or false.', 'isActive');
    return;
  }
  const existing = await prisma.item.findUnique({
    where: { id: routeId(req.params.id) },
    include: itemInclude,
  });
  if (!existing) {
    fail(res, 404, 'Item not found.');
    return;
  }
  if (existing.isActive === req.body.isActive) {
    res.json(present(existing, hasPermission(req.user, 'view_cost')));
    return;
  }
  if (req.body.isActive) {
    const category = await loadCategory(existing.categoryId);
    const unit = await loadUnit(existing.unitId);
    if (!category?.isActive) {
      fail(res, 400, 'Activate the category before activating this item.', 'isActive');
      return;
    }
    if (!unit?.isActive) {
      fail(res, 400, 'Activate the unit before activating this item.', 'isActive');
      return;
    }
  }
  try {
    const updated = await prisma.item.update({
      where: { id: existing.id },
      data: { isActive: req.body.isActive },
      include: itemInclude,
    });
    await record(
      req,
      'status',
      updated.isActive ? `Activated item ${quote(updated.name)}` : `Deactivated item ${quote(updated.name)}`,
      { itemId: updated.id, isActive: updated.isActive },
    );
    res.json(present(updated, hasPermission(req.user, 'view_cost')));
  } catch (error) {
    console.error('PATCH /api/items/:id/status error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

async function loadPackItem(id: string) {
  return prisma.item.findUnique({
    where: { id },
    include: { unit: { select: { abbreviation: true } } },
  });
}

function packSentence(name: string, quantity: Prisma.Decimal, abbreviation: string, itemName: string): string {
  return `pack ${quote(name)} (${quantityLabel(quantity)} ${abbreviation}) to ${quote(itemName)}`;
}

router.get('/:id/packs', requirePermission('view_catalog'), async (req: Request, res: Response): Promise<void> => {
  const item = await prisma.item.findUnique({ where: { id: routeId(req.params.id) }, select: { id: true } });
  if (!item) {
    fail(res, 404, 'Item not found.');
    return;
  }
  const includeInactive = readFlag(req.query.includeInactive);
  const packs = await prisma.itemPack.findMany({
    where: { itemId: item.id, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  res.json(packs.map(presentPack));
});

router.post('/:id/packs', requirePermission('manage_catalog'), async (req: Request, res: Response): Promise<void> => {
  const item = await loadPackItem(routeId(req.params.id));
  if (!item) {
    fail(res, 404, 'Item not found.');
    return;
  }
  if (!item.isActive) {
    fail(res, 409, `Activate ${quote(item.name)} before changing its pack sizes.`);
    return;
  }
  const nameResult = parsePackName(req.body?.name);
  if (!nameResult.ok) {
    fail(res, 400, nameResult.error, 'name');
    return;
  }
  const quantity = parsePackQuantity(req.body?.quantityInBase);
  if (!quantity.ok) {
    fail(res, 400, quantity.error, 'quantityInBase');
    return;
  }
  const barcode = parseBarcode(req.body?.barcode);
  if (!barcode.ok) {
    fail(res, 400, barcode.error, 'barcode');
    return;
  }
  const taken = await prisma.itemPack.findUnique({
    where: { itemId_nameKey: { itemId: item.id, nameKey: nameResult.nameKey } },
  });
  if (taken) {
    fail(res, 409, `A pack named ${quote(taken.name)} already exists on this item.`, 'name');
    return;
  }
  const room = await prisma.itemPack.count({ where: { itemId: item.id, isActive: true } });
  if (room >= 5) {
    fail(res, 409, 'An item can have at most 5 active packs.', 'name');
    return;
  }
  if (barcode.value) {
    const barcodeError = await barcodeConflict(barcode.value);
    if (barcodeError) {
      fail(res, 409, barcodeError, 'barcode');
      return;
    }
  }
  try {
    const created = await prisma.itemPack.create({
      data: {
        itemId: item.id,
        name: nameResult.name,
        nameKey: nameResult.nameKey,
        quantityInBase: quantity.value,
        barcode: barcode.value,
      },
    });
    await record(
      req,
      'create',
      `Added ${packSentence(created.name, created.quantityInBase, item.unit.abbreviation, item.name)}`,
      { itemId: item.id, packId: created.id },
      'pack',
    );
    res.status(201).json(presentPack(created));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      fail(res, 409, 'A pack with this name or barcode already exists.', 'name');
      return;
    }
    console.error('POST /api/items/:id/packs error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.put('/:id/packs/:packId', requirePermission('manage_catalog'), async (req: Request, res: Response): Promise<void> => {
  const item = await loadPackItem(routeId(req.params.id));
  if (!item) {
    fail(res, 404, 'Item not found.');
    return;
  }
  if (!item.isActive) {
    fail(res, 409, `Activate ${quote(item.name)} before changing its pack sizes.`);
    return;
  }
  const existing = await prisma.itemPack.findFirst({ where: { id: routeId(req.params.packId), itemId: item.id } });
  if (!existing) {
    fail(res, 404, 'Pack not found.');
    return;
  }
  const nameResult = parsePackName(req.body?.name === undefined ? existing.name : req.body.name);
  if (!nameResult.ok) {
    fail(res, 400, nameResult.error, 'name');
    return;
  }
  const quantity = parsePackQuantity(req.body?.quantityInBase === undefined ? existing.quantityInBase : req.body.quantityInBase);
  if (!quantity.ok) {
    fail(res, 400, quantity.error, 'quantityInBase');
    return;
  }
  const barcode = parseBarcode(req.body?.barcode === undefined ? existing.barcode : req.body.barcode);
  if (!barcode.ok) {
    fail(res, 400, barcode.error, 'barcode');
    return;
  }
  const taken = await prisma.itemPack.findUnique({
    where: { itemId_nameKey: { itemId: item.id, nameKey: nameResult.nameKey } },
  });
  if (taken && taken.id !== existing.id) {
    fail(res, 409, `A pack named ${quote(taken.name)} already exists on this item.`, 'name');
    return;
  }
  if (barcode.value) {
    const barcodeError = await barcodeConflict(barcode.value, { packId: existing.id });
    if (barcodeError) {
      fail(res, 409, barcodeError, 'barcode');
      return;
    }
  }
  try {
    const updated = await prisma.itemPack.update({
      where: { id: existing.id },
      data: {
        name: nameResult.name,
        nameKey: nameResult.nameKey,
        quantityInBase: quantity.value,
        barcode: barcode.value,
      },
    });
    const changes: string[] = [];
    if (updated.name !== existing.name) {
      changes.push(`Renamed pack ${quote(existing.name)} to ${quote(updated.name)} on ${quote(item.name)}`);
    }
    if (!updated.quantityInBase.equals(existing.quantityInBase)) {
      changes.push(
        `Changed pack ${quote(updated.name)} on ${quote(item.name)} from ${quantityLabel(existing.quantityInBase)} ${item.unit.abbreviation} to ${quantityLabel(updated.quantityInBase)} ${item.unit.abbreviation}`,
      );
    }
    if ((updated.barcode ?? null) !== (existing.barcode ?? null)) {
      changes.push(`Changed the barcode of pack ${quote(updated.name)} on ${quote(item.name)}`);
    }
    await record(
      req,
      'update',
      changes.length > 0 ? changes.join('. ') : `Updated pack ${quote(updated.name)} on ${quote(item.name)}`,
      { itemId: item.id, packId: updated.id },
      'pack',
    );
    res.json(presentPack(updated));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      fail(res, 409, 'A pack with this name or barcode already exists.', 'name');
      return;
    }
    console.error('PUT /api/items/:id/packs/:packId error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.patch('/:id/packs/:packId/status', requirePermission('manage_catalog'), async (req: Request, res: Response): Promise<void> => {
  if (typeof req.body?.isActive !== 'boolean') {
    fail(res, 400, 'isActive must be true or false.', 'isActive');
    return;
  }
  const item = await loadPackItem(routeId(req.params.id));
  if (!item) {
    fail(res, 404, 'Item not found.');
    return;
  }
  if (!item.isActive) {
    fail(res, 409, `Activate ${quote(item.name)} before changing its pack sizes.`);
    return;
  }
  const existing = await prisma.itemPack.findFirst({ where: { id: routeId(req.params.packId), itemId: item.id } });
  if (!existing) {
    fail(res, 404, 'Pack not found.');
    return;
  }
  if (existing.isActive === req.body.isActive) {
    res.json(presentPack(existing));
    return;
  }
  if (req.body.isActive) {
    const room = await prisma.itemPack.count({ where: { itemId: item.id, isActive: true, id: { not: existing.id } } });
    if (room >= 5) {
      fail(res, 409, 'An item can have at most 5 active packs.', 'isActive');
      return;
    }
  }
  const updated = await prisma.itemPack.update({ where: { id: existing.id }, data: { isActive: req.body.isActive } });
  await record(
    req,
    'status',
    updated.isActive
      ? `Activated pack ${quote(updated.name)} on ${quote(item.name)}`
      : `Deactivated pack ${quote(updated.name)} on ${quote(item.name)}`,
    { itemId: item.id, packId: updated.id, isActive: updated.isActive },
    'pack',
  );
  res.json(presentPack(updated));
});

export default router;
