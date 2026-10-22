import '../loadEnv';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '@/services/prisma';
import { signToken } from '@/middlewares/auth';

const PREFIX = '__test_';
const API = process.env.VERIFY_API_URL || 'http://127.0.0.1:5000';
const stamp = Date.now().toString(36);
const ROLES = ['Admin', 'Manager', 'Stock keeper', 'Cashier', 'Accountant'] as const;

type Result = { status: number; json: any };
type Check = { name: string; pass: boolean; detail: string };

const checks: Check[] = [];

function record(name: string, pass: boolean, detail = '') {
  checks.push({ name, pass, detail });
}

function nairobiShift(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function same(value: unknown, expected: string): boolean {
  try {
    return new Prisma.Decimal(String(value)).equals(new Prisma.Decimal(expected));
  } catch {
    return false;
  }
}

async function call(method: string, path: string, token?: string, body?: unknown): Promise<Result> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }
  return { status: response.status, json };
}

function categoryBody(name: string) {
  return { name, description: 'Temporary receiving check', defaultMarkupPercent: null, tracksExpiryByDefault: false, icon: 'leaf', sortOrder: 0 };
}

function itemBody(name: string, categoryId: string, unitId: string, extra: Record<string, unknown> = {}) {
  return { name, categoryId, unitId, reorderLevel: '0', tracksExpiry: false, taxType: 'NONE', ...extra };
}

async function main() {
  const today = nairobiShift(0);
  const tomorrow = nairobiShift(1);
  const later = nairobiShift(40);
  const yesterday = nairobiShift(-1);

  const password = await bcrypt.hash(`${PREFIX}password`, 10);
  const tokens = new Map<string, string>();
  for (const roleName of ROLES) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new Error(`Role ${roleName} is missing. Run npm run db:sync-roles first.`);
    const slug = roleName.toLowerCase().replace(/\s+/g, '_');
    const user = await prisma.user.create({
      data: {
        name: `${PREFIX}${roleName} ${stamp}`,
        email: `${PREFIX}${slug}_${stamp}@example.com`,
        password,
        status: 'active',
        roleId: role.id,
      },
    });
    tokens.set(roleName, signToken(user.id));
  }

  const admin = tokens.get('Admin')!;
  const manager = tokens.get('Manager')!;
  const stock = tokens.get('Stock keeper')!;
  const cashier = tokens.get('Cashier')!;
  const accountant = tokens.get('Accountant')!;

  const category = await call('POST', '/api/categories', admin, categoryBody(`${PREFIX}Feeds ${stamp}`));
  const unit = await call('POST', '/api/units', admin, { name: `${PREFIX}Bottle ${stamp}`, abbreviation: 'bt' });
  const vendor = await call('POST', '/api/suppliers', admin, { name: `${PREFIX}Kenya Agri Supplies ${stamp}`, phone: '0712345678' });
  const closedVendor = await call('POST', '/api/suppliers', admin, { name: `${PREFIX}Closed mill ${stamp}`, phone: '0798765432' });
  const categoryId = category.json?.id as string;
  const unitId = unit.json?.id as string;
  const vendorId = vendor.json?.id as string;
  const priced = await call('POST', '/api/items', admin, itemBody(`${PREFIX}Dewormer ${stamp}`, categoryId, unitId, { costPrice: '80.00', sellingPrice: '120.00' }));
  const triple = await call('POST', '/api/items', admin, itemBody(`${PREFIX}Mineral ${stamp}`, categoryId, unitId, { costPrice: '30.00', sellingPrice: '50.00' }));
  const expiryItem = await call('POST', '/api/items', admin, itemBody(`${PREFIX}Oxytet ${stamp}`, categoryId, unitId, { tracksExpiry: true, costPrice: '10.00', sellingPrice: '20.00' }));
  const other = await call('POST', '/api/items', admin, itemBody(`${PREFIX}Other ${stamp}`, categoryId, unitId));
  const sleepy = await call('POST', '/api/items', admin, itemBody(`${PREFIX}Sleepy ${stamp}`, categoryId, unitId));
  const roleItem = await call('POST', '/api/items', admin, itemBody(`${PREFIX}Role item ${stamp}`, categoryId, unitId));
  const carton = await call('POST', `/api/items/${priced.json?.id}/packs`, admin, { name: `${PREFIX}Carton ${stamp}`, quantityInBase: 12 });
  const tray = await call('POST', `/api/items/${triple.json?.id}/packs`, admin, { name: `${PREFIX}Tray ${stamp}`, quantityInBase: 3 });
  const foreignPack = await call('POST', `/api/items/${other.json?.id}/packs`, admin, { name: `${PREFIX}Foreign ${stamp}`, quantityInBase: 6 });
  const deadPack = await call('POST', `/api/items/${priced.json?.id}/packs`, admin, { name: `${PREFIX}Dead pack ${stamp}`, quantityInBase: 2 });
  record(
    'fixtures created',
    [category, unit, vendor, closedVendor, priced, triple, expiryItem, other, sleepy, roleItem, carton, tray, foreignPack, deadPack].every((row) => row.status === 201),
    [category, unit, vendor, priced, carton, tray].map((row) => row.status).join('/'),
  );

  const pricedId = priced.json?.id as string;
  const tripleId = triple.json?.id as string;
  const expiryId = expiryItem.json?.id as string;
  const sleepyId = sleepy.json?.id as string;
  const roleItemId = roleItem.json?.id as string;
  const cartonId = carton.json?.id as string;
  const trayId = tray.json?.id as string;
  const foreignId = foreignPack.json?.id as string;
  const deadPackId = deadPack.json?.id as string;
  const closedVendorId = closedVendor.json?.id as string;
  const priceBefore = { cost: priced.json?.costPrice, selling: priced.json?.sellingPrice };

  const noTokenList = await call('GET', '/api/receipts');
  const noTokenCreate = await call('POST', '/api/receipts', undefined, {});
  const noTokenBatches = await call('GET', '/api/stock/batches');
  record('no token is 401', noTokenList.status === 401 && noTokenCreate.status === 401 && noTokenBatches.status === 401, `${noTokenList.status}/${noTokenCreate.status}/${noTokenBatches.status}`);

  function receiptBody(lines: unknown[], extra: Record<string, unknown> = {}) {
    return {
      type: 'DELIVERY',
      vendorId,
      supplierInvoiceNo: `${PREFIX}INV ${stamp}`,
      receivedDate: today,
      notes: 'draft',
      lines,
      ...extra,
    };
  }

  const baseLine = { itemId: roleItemId, quantity: 1, cost: 10 };
  for (const [name, token] of [['Admin', admin], ['Manager', manager], ['Stock keeper', stock]] as const) {
    const created = await call('POST', '/api/receipts', token, receiptBody([baseLine], { notes: `${name} draft` }));
    const edited = await call('PUT', `/api/receipts/${created.json?.id}`, token, receiptBody([{ ...baseLine, quantity: 2 }], { notes: `${name} edited` }));
    const cancelled = await call('POST', `/api/receipts/${created.json?.id}/cancel`, token);
    const confirmedDraft = await call('POST', '/api/receipts', token, receiptBody([baseLine], { notes: `${name} confirm` }));
    const confirmed = await call('POST', `/api/receipts/${confirmedDraft.json?.id}/confirm`, token);
    record(
      `${name} can create, edit, confirm and cancel`,
      created.status === 201 && edited.status === 200 && edited.json?.notes === `${name} edited` && cancelled.status === 200 && cancelled.json?.status === 'CANCELLED' && confirmed.status === 200 && confirmed.json?.status === 'CONFIRMED',
      `${created.status}/${edited.status}/${cancelled.status}/${confirmed.status}`,
    );
  }

  const accountantList = await call('GET', '/api/receipts', accountant);
  const accountantRead = await call('GET', `/api/receipts/${accountantList.json?.receipts?.[0]?.id || 'missing'}`, accountant);
  const accountantWrite = await Promise.all([
    call('POST', '/api/receipts', accountant, receiptBody([baseLine])),
    call('PUT', `/api/receipts/${accountantRead.json?.id || 'missing'}`, accountant, receiptBody([baseLine])),
    call('POST', `/api/receipts/${accountantRead.json?.id || 'missing'}/cancel`, accountant),
    call('POST', `/api/receipts/${accountantRead.json?.id || 'missing'}/confirm`, accountant),
    call('POST', '/api/receipts/lines/preview', accountant, { itemId: pricedId, quantity: 1, cost: 10 }),
  ]);
  record('accountant can read receipts', accountantList.status === 200 && accountantRead.status === 200, `${accountantList.status}/${accountantRead.status}`);
  record('accountant cannot write receipts', accountantWrite.every((row) => row.status === 403), accountantWrite.map((row) => row.status).join('/'));

  const cashierRoutes = await Promise.all([
    call('GET', '/api/receipts', cashier),
    call('GET', `/api/receipts/${accountantRead.json?.id || 'missing'}`, cashier),
    call('POST', '/api/receipts', cashier, receiptBody([baseLine])),
    call('PUT', `/api/receipts/${accountantRead.json?.id || 'missing'}`, cashier, receiptBody([baseLine])),
    call('POST', `/api/receipts/${accountantRead.json?.id || 'missing'}/cancel`, cashier),
    call('POST', `/api/receipts/${accountantRead.json?.id || 'missing'}/confirm`, cashier),
    call('POST', '/api/receipts/lines/preview', cashier, { itemId: pricedId, quantity: 1, cost: 10 }),
  ]);
  const cashierBatches = await call('GET', `/api/stock/batches?itemId=${encodeURIComponent(roleItemId)}`, cashier);
  record('cashier gets 403 on every receipt route', cashierRoutes.every((row) => row.status === 403), cashierRoutes.map((row) => row.status).join('/'));
  record('cashier can read stock batches', cashierBatches.status === 200, `${cashierBatches.status}`);

  const five = await call('POST', '/api/receipts/lines/preview', admin, { itemId: pricedId, packId: cartonId, quantity: 5, cost: 4800 });
  const third = await call('POST', '/api/receipts/lines/preview', admin, { itemId: tripleId, packId: trayId, quantity: 3, cost: 100 });
  record(
    '5 cartons of 12 at 4800 are 60 base units at unit cost 400',
    five.status === 200 && same(five.json?.quantityInBase, '60') && same(five.json?.unitCostBase, '400') && five.json?.baseUnit === 'bt',
    `${five.status} ${five.json?.quantityInBase} ${five.json?.unitCostBase}`,
  );
  record(
    '3 cartons at cost 100 give unit cost 33.3333',
    third.status === 200 && same(third.json?.unitCostBase, '33.3333'),
    `${third.status} ${third.json?.unitCostBase}`,
  );

  const math = await call('POST', '/api/receipts', admin, receiptBody([
    { itemId: pricedId, packId: cartonId, quantity: 5, cost: 4800 },
    { itemId: tripleId, packId: trayId, quantity: 3, cost: 100 },
  ], { supplierInvoiceNo: `${PREFIX}MATH ${stamp}` }));
  const mathConfirmed = await call('POST', `/api/receipts/${math.json?.id}/confirm`, admin);
  const mathLines = await prisma.goodsReceiptLine.findMany({
    where: { receiptId: math.json?.id },
    include: { batch: { include: { ledgerEntries: true } } },
  });
  const receiptEntries = mathLines.flatMap((line) => line.batch?.ledgerEntries || []);
  record(
    'confirm creates one batch and one RECEIPT ledger entry per line',
    mathConfirmed.status === 200 && mathLines.length === 2 && mathLines.every((line) => line.batch && line.batch.ledgerEntries.length === 1 && line.batch.ledgerEntries[0].entryType === 'RECEIPT' && line.batch.ledgerEntries[0].refType === 'GoodsReceipt' && line.batch.ledgerEntries[0].refId === math.json?.id),
    `${mathConfirmed.status} lines ${mathLines.length} entries ${receiptEntries.length}`,
  );
  const pricedSum = receiptEntries.filter((entry) => entry.itemId === pricedId).reduce((sum, entry) => sum.plus(entry.quantity), new Prisma.Decimal(0));
  const tripleSum = receiptEntries.filter((entry) => entry.itemId === tripleId).reduce((sum, entry) => sum.plus(entry.quantity), new Prisma.Decimal(0));
  record('ledger sum equals the base quantity received', pricedSum.equals(60) && tripleSum.equals(9), `${pricedSum.toString()} / ${tripleSum.toString()}`);
  const pricedAfter = await call('GET', `/api/items/${pricedId}`, admin);
  record(
    'item cost and selling price are unchanged',
    same(pricedAfter.json?.costPrice, String(priceBefore.cost)) && same(pricedAfter.json?.sellingPrice, String(priceBefore.selling)),
    `cost ${pricedAfter.json?.costPrice} selling ${pricedAfter.json?.sellingPrice}`,
  );
  const plainBatch = mathLines.find((line) => line.itemId === pricedId)?.batch;
  record('a non-expiry item gets a batch with null expiry', plainBatch?.expiryDate == null, plainBatch?.expiryDate ? plainBatch.expiryDate.toISOString() : 'null');

  const opening = await call('POST', '/api/receipts', admin, {
    type: 'OPENING',
    receivedDate: today,
    notes: 'opening',
    lines: [{ itemId: roleItemId, quantity: 4, cost: 5 }],
  });
  const openingConfirmed = await call('POST', `/api/receipts/${opening.json?.id}/confirm`, admin);
  const openingEntries = await prisma.itemLedgerEntry.findMany({ where: { refType: 'GoodsReceipt', refId: opening.json?.id } });
  record(
    'opening receipt without a vendor writes OPENING entries',
    opening.status === 201 && opening.json?.vendorId == null && openingConfirmed.status === 200 && openingEntries.length === 1 && openingEntries[0].entryType === 'OPENING' && openingEntries[0].quantity.equals(4),
    `${opening.status}/${openingConfirmed.status} ${openingEntries[0]?.entryType || ''}`,
  );

  const missingBatch = await call('POST', '/api/receipts', admin, receiptBody([{ itemId: expiryId, quantity: 1, cost: 10, expiryDate: tomorrow }]));
  const missingExpiry = await call('POST', '/api/receipts', admin, receiptBody([{ itemId: expiryId, quantity: 1, cost: 10, batchNo: `${PREFIX}LOT ${stamp}` }]));
  const expiryToday = await call('POST', '/api/receipts', admin, receiptBody([{ itemId: expiryId, quantity: 1, cost: 10, batchNo: `${PREFIX}TODAY ${stamp}`, expiryDate: today }]));
  const expiryPast = await call('POST', '/api/receipts', admin, receiptBody([{ itemId: expiryId, quantity: 1, cost: 10, batchNo: `${PREFIX}PAST ${stamp}`, expiryDate: yesterday }]));
  record('tracksExpiry item without batch number or expiry is refused', missingBatch.status === 400 && missingExpiry.status === 400, `${missingBatch.status} ${missingBatch.json?.error} / ${missingExpiry.status} ${missingExpiry.json?.error}`);
  record('expiry today or in the past is refused', expiryToday.status === 400 && expiryPast.status === 400, `${expiryToday.status}/${expiryPast.status} ${expiryToday.json?.error || ''}`);

  const lot = `${PREFIX}LOT-A ${stamp}`;
  const firstLot = await call('POST', '/api/receipts', admin, receiptBody([{ itemId: expiryId, quantity: 1, cost: 10, batchNo: lot, expiryDate: tomorrow }]));
  const firstLotConfirmed = await call('POST', `/api/receipts/${firstLot.json?.id}/confirm`, admin);
  const clash = await call('POST', '/api/receipts', admin, receiptBody([{ itemId: expiryId, quantity: 1, cost: 10, batchNo: lot, expiryDate: later }]));
  const inside = await call('POST', '/api/receipts', admin, receiptBody([
    { itemId: expiryId, quantity: 1, cost: 10, batchNo: `${PREFIX}SPLIT ${stamp}`, expiryDate: tomorrow },
    { itemId: expiryId, quantity: 1, cost: 10, batchNo: `${PREFIX}SPLIT ${stamp}`, expiryDate: later },
  ]));
  record(
    'the same item and batch number with a different expiry is 409',
    firstLotConfirmed.status === 200 && clash.status === 409 && String(clash.json?.error || '').includes(lot) && inside.status === 409 && String(inside.json?.error || '').includes(`${PREFIX}SPLIT ${stamp}`),
    `${clash.status} ${clash.json?.error || ''} / ${inside.status} ${inside.json?.error || ''}`,
  );

  const beforeRepeat = await prisma.itemLedgerEntry.count({ where: { refId: math.json?.id } });
  const repeat = await call('POST', `/api/receipts/${math.json?.id}/confirm`, admin);
  const afterRepeat = await prisma.itemLedgerEntry.count({ where: { refId: math.json?.id } });
  record('confirming twice is 409 and adds nothing', repeat.status === 409 && beforeRepeat === afterRepeat && beforeRepeat === 2, `${repeat.status} entries ${beforeRepeat}/${afterRepeat}`);

  const invalidDraft = await call('POST', '/api/receipts', admin, receiptBody([
    { itemId: sleepyId, quantity: 1, cost: 8 },
    { itemId: roleItemId, quantity: 1, cost: 8 },
  ]));
  const deactivated = await call('PATCH', `/api/items/${sleepyId}/status`, admin, { isActive: false });
  const batchesBefore = await prisma.stockBatch.count({ where: { receiptLine: { receiptId: invalidDraft.json?.id } } });
  const invalidConfirm = await call('POST', `/api/receipts/${invalidDraft.json?.id}/confirm`, admin);
  const batchesAfter = await prisma.stockBatch.count({ where: { receiptLine: { receiptId: invalidDraft.json?.id } } });
  const invalidAfter = await call('GET', `/api/receipts/${invalidDraft.json?.id}`, admin);
  record(
    'a confirm with an invalid line changes nothing',
    deactivated.status === 200 && invalidConfirm.status === 400 && invalidAfter.json?.status === 'DRAFT' && batchesBefore === 0 && batchesAfter === 0,
    `${invalidConfirm.status} ${invalidConfirm.json?.error || ''} status ${invalidAfter.json?.status}`,
  );

  const editConfirmed = await call('PUT', `/api/receipts/${math.json?.id}`, admin, receiptBody([{ itemId: pricedId, quantity: 1, cost: 1 }]));
  const cancelConfirmed = await call('POST', `/api/receipts/${math.json?.id}/cancel`, admin);
  record('editing or cancelling a confirmed receipt is 409', editConfirmed.status === 409 && cancelConfirmed.status === 409, `${editConfirmed.status}/${cancelConfirmed.status}`);

  const noVendor = await call('POST', '/api/receipts', admin, { type: 'DELIVERY', receivedDate: today, lines: [{ itemId: roleItemId, quantity: 1, cost: 1 }] });
  record('a delivery without a vendor is 400', noVendor.status === 400, `${noVendor.status} ${noVendor.json?.error || ''}`);

  const vendorOff = await call('PATCH', `/api/suppliers/${closedVendorId}/status`, admin, { isActive: false });
  const inactiveVendor = await call('POST', '/api/receipts', admin, receiptBody([{ itemId: roleItemId, quantity: 1, cost: 1 }], { vendorId: closedVendorId }));
  const inactiveItem = await call('POST', '/api/receipts', admin, receiptBody([{ itemId: sleepyId, quantity: 1, cost: 1 }]));
  const packOff = await call('PATCH', `/api/items/${pricedId}/packs/${deadPackId}/status`, admin, { isActive: false });
  const inactivePack = await call('POST', '/api/receipts', admin, receiptBody([{ itemId: pricedId, packId: deadPackId, quantity: 1, cost: 1 }]));
  const wrongPack = await call('POST', '/api/receipts', admin, receiptBody([{ itemId: pricedId, packId: foreignId, quantity: 1, cost: 1 }]));
  record(
    'inactive vendor, item or pack, and a pack from another item, are refused',
    vendorOff.status === 200 && inactiveVendor.status === 400 && inactiveItem.status === 400 && packOff.status === 200 && inactivePack.status === 400 && wrongPack.status === 400,
    `${inactiveVendor.status}/${inactiveItem.status}/${inactivePack.status}/${wrongPack.status}`,
  );

  const withCost = await call('GET', `/api/receipts/${math.json?.id}`, accountant);
  const costLine = withCost.json?.lines?.[0] || {};
  record(
    'receipt cost fields are present for a role with view_cost',
    withCost.status === 200 && 'costEntered' in costLine && 'unitCostBase' in costLine && 'totalCost' in (withCost.json || {}),
    `keys ${Object.keys(costLine).filter((key) => key.toLowerCase().includes('cost')).join(',')}`,
  );
  const keeperBatches = await call('GET', `/api/stock/batches?itemId=${encodeURIComponent(pricedId)}`, stock);
  const keeperBatch = keeperBatches.json?.batches?.[0] || {};
  const cashierBatch = cashierBatches.json?.batches?.[0];
  record(
    'batch unit cost is present with view_cost and absent without it',
    keeperBatches.status === 200 && 'unitCost' in keeperBatch && same(keeperBatch.unitCost, '400') && cashierBatch !== undefined && !('unitCost' in (cashierBatches.json?.batches?.[0] || { unitCost: true })),
    `keeper ${keeperBatch.unitCost} cashier keys ${cashierBatch ? Object.keys(cashierBatch).join(',') : 'none'}`,
  );
  const remainingOk = await Promise.all((keeperBatches.json?.batches || []).map(async (batch: { id: string; remaining: string }) => {
    const entries = await prisma.itemLedgerEntry.findMany({ where: { batchId: batch.id } });
    const sum = entries.reduce((total, entry) => total.plus(entry.quantity), new Prisma.Decimal(0));
    return same(batch.remaining, sum.toFixed(3));
  }));
  record('remaining per batch equals the ledger sum', remainingOk.length > 0 && remainingOk.every(Boolean), remainingOk.join('/'));

  const audits = await prisma.auditEvent.findMany({
    where: { userName: { startsWith: PREFIX }, description: { contains: 'Confirmed receipt' } },
    select: { description: true },
  });
  record(
    'confirming a receipt writes an audit event',
    audits.some((event) => event.description?.includes('Confirmed receipt GR-') && event.description.includes(`${PREFIX}Kenya Agri Supplies ${stamp}`)),
    audits[0]?.description || 'none',
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const failed = checks.filter((item) => !item.pass);
    console.log('\nCheck | Result | Detail');
    console.log('---|---|---');
    for (const item of checks) console.log(`${item.name} | ${item.pass ? 'PASS' : 'FAIL'} | ${item.detail}`);
    console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
    if (failed.length > 0) process.exitCode = 1;
    await prisma.itemLedgerEntry.deleteMany({ where: { item: { name: { startsWith: PREFIX } } } });
    await prisma.stockBatch.deleteMany({ where: { item: { name: { startsWith: PREFIX } } } });
    await prisma.goodsReceiptLine.deleteMany({ where: { item: { name: { startsWith: PREFIX } } } });
    await prisma.goodsReceipt.deleteMany({ where: { createdBy: { name: { startsWith: PREFIX } } } });
    await prisma.itemPack.deleteMany({ where: { item: { name: { startsWith: PREFIX } } } });
    await prisma.item.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { name: { startsWith: PREFIX }, parentId: { not: null } } });
    await prisma.category.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.unit.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.vendor.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.auditEvent.deleteMany({ where: { userName: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { OR: [{ name: { startsWith: PREFIX } }, { email: { startsWith: PREFIX } }] } });
    await prisma.$disconnect();
  });
