import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { hasPermission, requirePermission } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';
import { toBaseQuantity } from '@/lib/packs';

const router = Router();
const transactionOptions = { maxWait: 10000, timeout: 20000 };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
const MAX_LINES = 200;

type Tx = Prisma.TransactionClient;

class ReceiptError extends Error {
  status: number;
  field?: string;
  lineNo?: number;

  constructor(status: number, message: string, field?: string, lineNo?: number) {
    super(message);
    this.status = status;
    this.field = field;
    this.lineNo = lineNo;
  }
}

type PreparedLine = {
  itemId: string;
  itemName: string;
  packId: string | null;
  packName: string | null;
  quantityEntered: Prisma.Decimal;
  quantityInBase: Prisma.Decimal;
  costEntered: Prisma.Decimal;
  unitCostBase: Prisma.Decimal;
  batchNo: string | null;
  manufactureDate: Date | null;
  expiryDate: Date | null;
  unitAbbreviation: string;
};

type PreparedHeader = {
  type: 'DELIVERY' | 'OPENING';
  vendorId: string | null;
  vendorName: string | null;
  supplierInvoiceNo: string | null;
  receivedDate: Date;
  notes: string | null;
  lines: PreparedLine[];
};

const receiptInclude = {
  vendor: { select: { id: true, name: true } },
  lines: {
    orderBy: [{ lineNo: 'asc' as const }, { id: 'asc' as const }],
    include: {
      item: { select: { id: true, name: true, sku: true, barcode: true, tracksExpiry: true, unit: { select: { id: true, name: true, abbreviation: true } } } },
      pack: { select: { id: true, name: true, quantityInBase: true } },
    },
  },
  _count: { select: { lines: true } },
} satisfies Prisma.GoodsReceiptInclude;

type ReceiptRow = Prisma.GoodsReceiptGetPayload<{ include: typeof receiptInclude }>;

function routeId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function queryText(value: unknown): string {
  if (Array.isArray(value)) return queryText(value[0]);
  return typeof value === 'string' ? value.trim() : '';
}

function quote(name: string): string {
  return `"${name}"`;
}

function fail(res: Response, status: number, error: string, field?: string, lineNo?: number) {
  const body: { error: string; field?: string; lineNo?: number } = { error };
  if (field) body.field = field;
  if (lineNo) body.lineNo = lineNo;
  return res.status(status).json(body);
}

function sendError(res: Response, error: unknown) {
  if (error instanceof ReceiptError) {
    fail(res, error.status, error.message, error.field, error.lineNo);
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028') {
    res.status(503).json({ error: 'The database was too slow, nothing was saved. Please try again.' });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Something went wrong' });
}

function nairobiToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function dateIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function asDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function receiptLabel(receiptNo: number): string {
  return `GR-${String(receiptNo).padStart(5, '0')}`;
}

function decimalText(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value.toString();
  }
  if (typeof value === 'string') {
    const text = value.trim();
    return text || null;
  }
  return null;
}

function fixed(value: Prisma.Decimal | null | undefined, places: number): string | null {
  if (value == null) return null;
  return value.toFixed(places);
}

function quantityLabel(value: Prisma.Decimal): string {
  return value.toFixed(3).replace(/\.?0+$/, '');
}

function showCost(req: Request): boolean {
  return hasPermission(req.user, 'view_cost');
}

function presentLine(line: ReceiptRow['lines'][number], withCost: boolean) {
  return {
    id: line.id,
    lineNo: line.lineNo,
    itemId: line.itemId,
    item: line.item,
    packId: line.packId,
    pack: line.pack
      ? { id: line.pack.id, name: line.pack.name, quantityInBase: fixed(line.pack.quantityInBase, 3) }
      : null,
    quantityEntered: fixed(line.quantityEntered, 3),
    quantityInBase: fixed(line.quantityInBase, 3),
    batchNo: line.batchNo,
    manufactureDate: dateIso(line.manufactureDate),
    expiryDate: dateIso(line.expiryDate),
    ...(withCost
      ? {
          costEntered: fixed(line.costEntered, 2),
          unitCostBase: fixed(line.unitCostBase, 4),
        }
      : {}),
  };
}

function present(row: ReceiptRow, withCost: boolean, detail: boolean) {
  return {
    id: row.id,
    receiptNo: receiptLabel(row.receiptNo),
    type: row.type,
    status: row.status,
    vendorId: row.vendorId,
    vendor: row.vendor,
    supplierInvoiceNo: row.supplierInvoiceNo,
    receivedDate: dateIso(row.receivedDate),
    notes: row.notes,
    lineCount: row._count.lines,
    createdById: row.createdById,
    confirmedById: row.confirmedById,
    confirmedAt: row.confirmedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(withCost ? { totalCost: fixed(row.totalCost, 2) } : {}),
    ...(detail ? { lines: row.lines.map((line) => presentLine(line, withCost)) } : {}),
  };
}

async function record(req: Request, action: string, description: string, metadata: Record<string, unknown>) {
  const user = req.user!;
  await logAuditEvent({
    eventType: 'receipt',
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

function parseOptionalText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ReceiptError(400, `${label} must be text.`, label === 'Invoice number' ? 'supplierInvoiceNo' : 'notes');
  const text = value.trim();
  if (!text) return null;
  if (text.length > max) throw new ReceiptError(400, `${label} must be ${max} characters or fewer.`, label === 'Invoice number' ? 'supplierInvoiceNo' : 'notes');
  return text;
}

function parseQuantity(value: unknown, lineNo: number): Prisma.Decimal {
  const text = decimalText(value);
  if (!text || !DECIMAL_PATTERN.test(text)) {
    throw new ReceiptError(400, 'Quantity must be greater than 0, with at most 3 decimal places.', 'quantity', lineNo);
  }
  const quantity = new Prisma.Decimal(text);
  if (!quantity.isFinite() || quantity.lte(0) || quantity.decimalPlaces() > 3 || quantity.gt('999999999.999')) {
    throw new ReceiptError(400, 'Quantity must be greater than 0, with at most 3 decimal places.', 'quantity', lineNo);
  }
  return quantity;
}

function parseCost(value: unknown, lineNo: number): Prisma.Decimal {
  const text = decimalText(value);
  if (!text || !DECIMAL_PATTERN.test(text)) {
    throw new ReceiptError(400, 'Cost must be 0 or more, with at most 2 decimal places.', 'cost', lineNo);
  }
  const cost = new Prisma.Decimal(text);
  if (!cost.isFinite() || cost.lt(0) || cost.decimalPlaces() > 2 || cost.gt('9999999999.99')) {
    throw new ReceiptError(400, 'Cost must be 0 or more, with at most 2 decimal places.', 'cost', lineNo);
  }
  return cost;
}

function parseCalendarDate(value: unknown, label: string, field: string, required: boolean, lineNo?: number): Date | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ReceiptError(400, `${label} is required.`, field, lineNo);
    return null;
  }
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new ReceiptError(400, `${label} must be a date.`, field, lineNo);
  }
  const date = asDate(value);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ReceiptError(400, `${label} must be a date.`, field, lineNo);
  }
  return date;
}

function unitCostPerBase(costEntered: Prisma.Decimal, perEnteredUnit: Prisma.Decimal): Prisma.Decimal {
  const cost = costEntered.div(perEnteredUnit).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  if (cost.gt('9999999999.9999')) {
    throw new ReceiptError(400, 'Cost per base unit is too large.', 'cost');
  }
  return cost;
}

function lineTotal(line: PreparedLine): Prisma.Decimal {
  return line.costEntered.mul(line.quantityEntered).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function batchConflictMessage(itemName: string, batchNo: string, expiry: string | null): string {
  const when = expiry ? `expiry ${expiry}` : 'no expiry date';
  return `Batch ${quote(batchNo)} on ${quote(itemName)} already exists with ${when}.`;
}

async function prepare(body: Record<string, unknown>, tx: Tx): Promise<PreparedHeader> {
  const type = body.type;
  if (type !== 'DELIVERY' && type !== 'OPENING') {
    throw new ReceiptError(400, 'Type must be delivery or opening stock.', 'type');
  }
  const vendorId = typeof body.vendorId === 'string' && body.vendorId.trim() ? body.vendorId.trim() : null;
  let vendorName: string | null = null;
  if (type === 'DELIVERY' && !vendorId) {
    throw new ReceiptError(400, 'A delivery needs a supplier.', 'vendorId');
  }
  if (vendorId) {
    const vendor = await tx.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor || !vendor.isActive) throw new ReceiptError(400, 'Choose an active supplier.', 'vendorId');
    vendorName = vendor.name;
  }
  const receivedDate = parseCalendarDate(body.receivedDate, 'Date received', 'receivedDate', true);
  if (!receivedDate) throw new ReceiptError(400, 'Date received is required.', 'receivedDate');
  const receivedIso = dateIso(receivedDate)!;
  if (receivedIso > nairobiToday()) {
    throw new ReceiptError(400, 'Date received cannot be in the future.', 'receivedDate');
  }
  if (!Array.isArray(body.lines) || body.lines.length < 1) {
    throw new ReceiptError(400, 'Add at least 1 line.', 'lines');
  }
  if (body.lines.length > MAX_LINES) {
    throw new ReceiptError(400, 'A receipt can have at most 200 lines.', 'lines');
  }

  const sources: Record<string, unknown>[] = [];
  for (let index = 0; index < body.lines.length; index += 1) {
    const raw = body.lines[index];
    if (!raw || typeof raw !== 'object') throw new ReceiptError(400, 'Each line must be an item.', 'lines', index + 1);
    sources.push(raw as Record<string, unknown>);
  }
  const itemIds = [...new Set(sources.flatMap((source) => (typeof source.itemId === 'string' && source.itemId.trim() ? [source.itemId.trim()] : [])))];
  const packIds = [...new Set(sources.flatMap((source) => (typeof source.packId === 'string' && source.packId.trim() ? [source.packId.trim()] : [])))];
  const batchFilters = new Map<string, { itemId: string; batchNo: string }>();
  for (const source of sources) {
    const itemId = typeof source.itemId === 'string' ? source.itemId.trim() : '';
    const batchNo = typeof source.batchNo === 'string' ? source.batchNo.trim() : '';
    if (itemId && batchNo) batchFilters.set(`${itemId}::${batchNo}`, { itemId, batchNo });
  }
  const [items, packs, existingBatches] = await Promise.all([
    itemIds.length
      ? tx.item.findMany({
          where: { id: { in: itemIds } },
          include: { unit: { select: { abbreviation: true } } },
        })
      : Promise.resolve([]),
    packIds.length ? tx.itemPack.findMany({ where: { id: { in: packIds } } }) : Promise.resolve([]),
    batchFilters.size
      ? tx.stockBatch.findMany({
          where: { OR: [...batchFilters.values()] },
          select: { itemId: true, batchNo: true, expiryDate: true, item: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const packsById = new Map(packs.map((pack) => [pack.id, pack]));
  const existingByKey = new Map<string, { itemName: string; expiry: string | null }[]>();
  for (const batch of existingBatches) {
    if (!batch.batchNo) continue;
    const key = `${batch.itemId}::${batch.batchNo}`;
    const rows = existingByKey.get(key) || [];
    rows.push({ itemName: batch.item.name, expiry: dateIso(batch.expiryDate) });
    existingByKey.set(key, rows);
  }

  const lines: PreparedLine[] = [];
  const seen = new Map<string, { expiry: string | null; itemName: string; batchNo: string }>();
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const lineNo = index + 1;
    if (typeof source.itemId !== 'string' || !source.itemId.trim()) {
      throw new ReceiptError(400, 'Choose an item.', 'itemId', lineNo);
    }
    const item = itemsById.get(source.itemId.trim());
    if (!item || !item.isActive) throw new ReceiptError(400, 'Choose an active item.', 'itemId', lineNo);
    const packId = typeof source.packId === 'string' && source.packId.trim() ? source.packId.trim() : null;
    let packName: string | null = null;
    let perEntered = new Prisma.Decimal(1);
    if (packId) {
      const pack = packsById.get(packId);
      if (!pack || pack.itemId !== item.id) {
        throw new ReceiptError(400, 'That pack does not belong to this item.', 'packId', lineNo);
      }
      if (!pack.isActive) throw new ReceiptError(400, 'Choose an active pack.', 'packId', lineNo);
      packName = pack.name;
      perEntered = pack.quantityInBase;
    }
    const quantityEntered = parseQuantity(source.quantity, lineNo);
    const costEntered = parseCost(source.cost, lineNo);
    const quantityInBase = packId ? toBaseQuantity(quantityEntered, { quantityInBase: perEntered }) : quantityEntered;
    let unitCostBase: Prisma.Decimal;
    try {
      unitCostBase = unitCostPerBase(costEntered, perEntered);
    } catch (error) {
      if (error instanceof ReceiptError) throw new ReceiptError(error.status, error.message, 'cost', lineNo);
      throw error;
    }
    const batchText = typeof source.batchNo === 'string' ? source.batchNo.trim() : source.batchNo == null ? '' : null;
    if (batchText == null) throw new ReceiptError(400, 'Batch number must be text.', 'batchNo', lineNo);
    if (batchText.length > 40) throw new ReceiptError(400, 'Batch number must be 40 characters or fewer.', 'batchNo', lineNo);
    const batchNo = batchText || null;
    const expiryDate = parseCalendarDate(source.expiryDate, 'Expiry date', 'expiryDate', false, lineNo);
    const manufactureDate = parseCalendarDate(source.manufactureDate, 'Manufacture date', 'manufactureDate', false, lineNo);
    if (item.tracksExpiry && !batchNo) {
      throw new ReceiptError(400, 'Batch number is required for items that track expiry.', 'batchNo', lineNo);
    }
    if (item.tracksExpiry && !expiryDate) {
      throw new ReceiptError(400, 'Expiry date is required for items that track expiry.', 'expiryDate', lineNo);
    }
    const expiryIso = dateIso(expiryDate);
    if (expiryIso && expiryIso <= nairobiToday()) {
      throw new ReceiptError(400, 'Expiry date must be after today.', 'expiryDate', lineNo);
    }
    if (manufactureDate && dateIso(manufactureDate)! > receivedIso) {
      throw new ReceiptError(400, 'Manufacture date cannot be after the date received.', 'manufactureDate', lineNo);
    }
    if (batchNo) {
      const key = `${item.id}::${batchNo}`;
      const previous = seen.get(key);
      if (previous && previous.expiry !== expiryIso) {
        throw new ReceiptError(409, batchConflictMessage(previous.itemName, batchNo, previous.expiry), 'expiryDate', lineNo);
      }
      if (!previous) seen.set(key, { expiry: expiryIso, itemName: item.name, batchNo });
      const conflict = (existingByKey.get(key) || []).find((row) => row.expiry !== expiryIso);
      if (conflict) {
        throw new ReceiptError(409, batchConflictMessage(conflict.itemName, batchNo, conflict.expiry), 'expiryDate', lineNo);
      }
    }
    lines.push({
      itemId: item.id,
      itemName: item.name,
      packId,
      packName,
      quantityEntered,
      quantityInBase,
      costEntered,
      unitCostBase,
      batchNo,
      manufactureDate,
      expiryDate,
      unitAbbreviation: item.unit.abbreviation,
    });
  }

  return {
    type,
    vendorId,
    vendorName,
    supplierInvoiceNo: parseOptionalText(body.supplierInvoiceNo, 'Invoice number', 60),
    receivedDate,
    notes: parseOptionalText(body.notes, 'Notes', 500),
    lines,
  };
}

function lineData(receiptId: string, line: PreparedLine, lineNo: number): Prisma.GoodsReceiptLineCreateManyInput {
  return {
    receiptId,
    itemId: line.itemId,
    packId: line.packId,
    quantityEntered: line.quantityEntered,
    quantityInBase: line.quantityInBase,
    costEntered: line.costEntered,
    unitCostBase: line.unitCostBase,
    batchNo: line.batchNo,
    manufactureDate: line.manufactureDate,
    expiryDate: line.expiryDate,
    lineNo,
  };
}

async function loadReceipt(id: string): Promise<ReceiptRow | null> {
  return prisma.goodsReceipt.findUnique({ where: { id }, include: receiptInclude });
}

function confirmDescription(label: string, header: PreparedHeader): string {
  const units = header.lines.reduce((sum, line) => sum.plus(line.quantityInBase), new Prisma.Decimal(0));
  const itemWord = header.lines.length === 1 ? 'item' : 'items';
  const unitWord = units.equals(1) ? 'unit' : 'units';
  const from = header.vendorName ? ` from ${quote(header.vendorName)}` : '';
  return `Confirmed receipt ${label}${from}: ${header.lines.length} ${itemWord}, ${quantityLabel(units)} ${unitWord} added`;
}

async function previewLine(body: Record<string, unknown>, tx: Tx) {
  if (typeof body.itemId !== 'string' || !body.itemId.trim()) {
    throw new ReceiptError(400, 'Choose an item.', 'itemId', 1);
  }
  const item = await tx.item.findUnique({
    where: { id: body.itemId.trim() },
    include: { unit: { select: { abbreviation: true } } },
  });
  if (!item || !item.isActive) throw new ReceiptError(400, 'Choose an active item.', 'itemId', 1);
  const packId = typeof body.packId === 'string' && body.packId.trim() ? body.packId.trim() : null;
  let perEntered = new Prisma.Decimal(1);
  if (packId) {
    const pack = await tx.itemPack.findUnique({ where: { id: packId } });
    if (!pack || pack.itemId !== item.id) {
      throw new ReceiptError(400, 'That pack does not belong to this item.', 'packId', 1);
    }
    if (!pack.isActive) throw new ReceiptError(400, 'Choose an active pack.', 'packId', 1);
    perEntered = pack.quantityInBase;
  }
  const quantityEntered = parseQuantity(body.quantity, 1);
  const quantityInBase = packId ? toBaseQuantity(quantityEntered, { quantityInBase: perEntered }) : quantityEntered;
  const costProvided = body.cost !== undefined && body.cost !== null && body.cost !== '';
  const unitCostBase = costProvided ? unitCostPerBase(parseCost(body.cost, 1), perEntered) : null;
  return { quantityInBase, baseUnit: item.unit.abbreviation, unitCostBase };
}

router.post('/lines/preview', requirePermission('manage_receiving'), async (req: Request, res: Response): Promise<void> => {
  try {
    const line = await prisma.$transaction((tx) => previewLine((req.body || {}) as Record<string, unknown>, tx), transactionOptions);
    res.json({
      quantityInBase: fixed(line.quantityInBase, 3),
      baseUnit: line.baseUnit,
      unitCostBase: fixed(line.unitCostBase, 4),
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/', requirePermission('view_receipts'), async (req: Request, res: Response): Promise<void> => {
  const status = queryText(req.query.status);
  const vendorId = queryText(req.query.vendorId);
  const dateFrom = queryText(req.query.dateFrom);
  const dateTo = queryText(req.query.dateTo);
  const search = queryText(req.query.search);
  if (status && !['DRAFT', 'CONFIRMED', 'CANCELLED'].includes(status)) {
    fail(res, 400, 'Status must be draft, confirmed, or cancelled.', 'status');
    return;
  }
  if (dateFrom && !DATE_PATTERN.test(dateFrom)) {
    fail(res, 400, 'dateFrom must be a date.', 'dateFrom');
    return;
  }
  if (dateTo && !DATE_PATTERN.test(dateTo)) {
    fail(res, 400, 'dateTo must be a date.', 'dateTo');
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

  const where: Prisma.GoodsReceiptWhereInput = {};
  if (status) where.status = status as 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  if (vendorId) where.vendorId = vendorId;
  if (dateFrom || dateTo) {
    where.receivedDate = {};
    if (dateFrom) where.receivedDate.gte = asDate(dateFrom);
    if (dateTo) where.receivedDate.lte = asDate(dateTo);
  }
  if (search) {
    const or: Prisma.GoodsReceiptWhereInput[] = [{ supplierInvoiceNo: { contains: search, mode: 'insensitive' } }];
    const digits = search.toUpperCase().replace(/^GR-/, '');
    if (/^\d+$/.test(digits)) {
      const receiptNo = Number(digits);
      if (Number.isSafeInteger(receiptNo)) or.push({ receiptNo });
    }
    where.OR = or;
  }

  try {
    const [total, rows] = await Promise.all([
      prisma.goodsReceipt.count({ where }),
      prisma.goodsReceipt.findMany({
        where,
        include: receiptInclude,
        orderBy: [{ receivedDate: 'desc' }, { receiptNo: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const withCost = showCost(req);
    res.json({
      receipts: rows.map((row) => present(row, withCost, false)),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/', requirePermission('manage_receiving'), async (req: Request, res: Response): Promise<void> => {
  try {
    const created = await prisma.$transaction(async (tx) => {
      const header = await prepare((req.body || {}) as Record<string, unknown>, tx);
      const receipt = await tx.goodsReceipt.create({
        data: {
          type: header.type,
          vendorId: header.vendorId,
          supplierInvoiceNo: header.supplierInvoiceNo,
          receivedDate: header.receivedDate,
          notes: header.notes,
          createdById: req.user!.id,
        },
      });
      await tx.goodsReceiptLine.createMany({
        data: header.lines.map((line, index) => lineData(receipt.id, line, index + 1)),
      });
      return { id: receipt.id, header, receiptNo: receipt.receiptNo };
    }, transactionOptions);
    const row = await loadReceipt(created.id);
    const label = receiptLabel(created.receiptNo);
    const from = created.header.vendorName ? ` from ${quote(created.header.vendorName)}` : '';
    await record(req, 'create', `Created draft receipt ${label}${from} with ${created.header.lines.length} lines`, { receiptId: created.id });
    res.status(201).json(present(row!, showCost(req), true));
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:id', requirePermission('view_receipts'), async (req: Request, res: Response): Promise<void> => {
  const row = await loadReceipt(routeId(req.params.id));
  if (!row) {
    fail(res, 404, 'Receipt not found.');
    return;
  }
  res.json(present(row, showCost(req), true));
});

router.put('/:id', requirePermission('manage_receiving'), async (req: Request, res: Response): Promise<void> => {
  const id = routeId(req.params.id);
  try {
    const saved = await prisma.$transaction(async (tx) => {
      const locked = await tx.goodsReceipt.updateMany({ where: { id, status: 'DRAFT' }, data: { updatedAt: new Date() } });
      if (locked.count !== 1) {
        const existing = await tx.goodsReceipt.findUnique({ where: { id } });
        if (!existing) throw new ReceiptError(404, 'Receipt not found.');
        throw new ReceiptError(409, 'Only a draft receipt can be changed.');
      }
      const header = await prepare((req.body || {}) as Record<string, unknown>, tx);
      await tx.goodsReceiptLine.deleteMany({ where: { receiptId: id } });
      await tx.goodsReceipt.update({
        where: { id },
        data: {
          type: header.type,
          vendorId: header.vendorId,
          supplierInvoiceNo: header.supplierInvoiceNo,
          receivedDate: header.receivedDate,
          notes: header.notes,
        },
      });
      await tx.goodsReceiptLine.createMany({ data: header.lines.map((line, index) => lineData(id, line, index + 1)) });
      const current = await tx.goodsReceipt.findUnique({ where: { id }, select: { receiptNo: true } });
      return { header, receiptNo: current!.receiptNo };
    }, transactionOptions);
    const row = await loadReceipt(id);
    await record(req, 'update', `Updated draft receipt ${receiptLabel(saved.receiptNo)}`, { receiptId: id });
    res.json(present(row!, showCost(req), true));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/cancel', requirePermission('manage_receiving'), async (req: Request, res: Response): Promise<void> => {
  const id = routeId(req.params.id);
  try {
    const cancelled = await prisma.$transaction(async (tx) => {
      const updated = await tx.goodsReceipt.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'CANCELLED' } });
      if (updated.count !== 1) {
        const existing = await tx.goodsReceipt.findUnique({ where: { id } });
        if (!existing) throw new ReceiptError(404, 'Receipt not found.');
        throw new ReceiptError(409, 'Only a draft receipt can be cancelled.');
      }
      return tx.goodsReceipt.findUnique({ where: { id }, select: { receiptNo: true } });
    }, transactionOptions);
    const row = await loadReceipt(id);
    await record(req, 'cancel', `Cancelled draft receipt ${receiptLabel(cancelled!.receiptNo)}`, { receiptId: id });
    res.json(present(row!, showCost(req), true));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/confirm', requirePermission('manage_receiving'), async (req: Request, res: Response): Promise<void> => {
  const id = routeId(req.params.id);
  try {
    const confirmed = await prisma.$transaction(async (tx) => {
      const existing = await tx.goodsReceipt.findUnique({ where: { id }, include: receiptInclude });
      if (!existing) throw new ReceiptError(404, 'Receipt not found.');
      if (existing.status !== 'DRAFT') {
        throw new ReceiptError(409, `Receipt ${receiptLabel(existing.receiptNo)} is already confirmed.`);
      }
      const header = await prepare({
        type: existing.type,
        vendorId: existing.vendorId,
        supplierInvoiceNo: existing.supplierInvoiceNo,
        receivedDate: dateIso(existing.receivedDate),
        notes: existing.notes,
        lines: existing.lines.map((line) => ({
          itemId: line.itemId,
          packId: line.packId,
          quantity: line.quantityEntered.toFixed(3),
          cost: line.costEntered.toFixed(2),
          batchNo: line.batchNo,
          manufactureDate: dateIso(line.manufactureDate),
          expiryDate: dateIso(line.expiryDate),
        })),
      }, tx);
      const total = header.lines.reduce((sum, line) => sum.plus(lineTotal(line)), new Prisma.Decimal(0));
      if (total.gt('999999999999.99')) throw new ReceiptError(400, 'Receipt total is too large.', 'lines');
      const updated = await tx.goodsReceipt.updateMany({
        where: { id, status: 'DRAFT' },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          confirmedById: req.user!.id,
          totalCost: total,
        },
      });
      if (updated.count !== 1) {
        throw new ReceiptError(409, `Receipt ${receiptLabel(existing.receiptNo)} is already confirmed.`);
      }
      await tx.goodsReceiptLine.deleteMany({ where: { receiptId: id } });
      const posted = header.lines.map((line, index) => {
        if (line.quantityInBase.lte(0)) throw new ReceiptError(400, 'Quantity must be greater than 0.', 'quantity', index + 1);
        return { line, lineNo: index + 1, lineId: randomUUID(), batchId: randomUUID() };
      });
      await tx.goodsReceiptLine.createMany({
        data: posted.map(({ line, lineNo, lineId }) => ({ id: lineId, ...lineData(id, line, lineNo) })),
      });
      await tx.stockBatch.createMany({
        data: posted.map(({ line, lineId, batchId }) => ({
          id: batchId,
          itemId: line.itemId,
          vendorId: header.vendorId,
          receiptLineId: lineId,
          batchNo: line.batchNo,
          manufactureDate: line.manufactureDate,
          expiryDate: line.expiryDate,
          receivedDate: header.receivedDate,
          quantityReceived: line.quantityInBase,
          unitCost: line.unitCostBase,
        })),
      });
      await tx.itemLedgerEntry.createMany({
        data: posted.map(({ line, batchId }) => ({
          itemId: line.itemId,
          batchId,
          entryType: header.type === 'OPENING' ? 'OPENING' as const : 'RECEIPT' as const,
          quantity: line.quantityInBase,
          unitCost: line.unitCostBase,
          refType: 'GoodsReceipt',
          refId: id,
          userId: req.user!.id,
        })),
      });
      return { header, receiptNo: existing.receiptNo };
    }, transactionOptions);
    const row = await loadReceipt(id);
    await record(req, 'confirm', confirmDescription(receiptLabel(confirmed.receiptNo), confirmed.header), { receiptId: id });
    res.json(present(row!, showCost(req), true));
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
