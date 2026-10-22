import '../loadEnv';
import bcrypt from 'bcrypt';
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

function categoryBody(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    description: 'Temporary item check',
    defaultMarkupPercent: null,
    tracksExpiryByDefault: false,
    icon: 'leaf',
    sortOrder: 0,
    ...extra,
  };
}

function lacksCost(row: any): boolean {
  return !!row && !Object.prototype.hasOwnProperty.call(row, 'costPrice') && !Object.prototype.hasOwnProperty.call(row, 'markupPercent');
}

function hasCost(row: any): boolean {
  return !!row && Object.prototype.hasOwnProperty.call(row, 'costPrice') && Object.prototype.hasOwnProperty.call(row, 'markupPercent');
}

async function main() {
  const password = await bcrypt.hash(`${PREFIX}password`, 10);
  const tokens = new Map<string, string>();
  const userIds: string[] = [];

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
    userIds.push(user.id);
    tokens.set(roleName, signToken(user.id));
  }

  const admin = tokens.get('Admin')!;
  const manager = tokens.get('Manager')!;
  const stock = tokens.get('Stock keeper')!;
  const cashier = tokens.get('Cashier')!;
  const accountant = tokens.get('Accountant')!;

  const noToken = await call('GET', '/api/items');
  const noTokenPost = await call('POST', '/api/items', undefined, {});
  const noTokenUnits = await call('GET', '/api/units');
  record('no token on items list is 401', noToken.status === 401, `status ${noToken.status}`);
  record('no token on items create is 401', noTokenPost.status === 401, `status ${noTokenPost.status}`);
  record('no token on units is 401', noTokenUnits.status === 401, `status ${noTokenUnits.status}`);

  const unit = await call('POST', '/api/units', admin, { name: `${PREFIX}Kilogram ${stamp}`, abbreviation: 'tk' });
  record('admin creates a unit', unit.status === 201, `status ${unit.status} ${unit.json?.error || ''}`);
  const unitId = unit.json?.id as string;

  const parent = await call(
    'POST',
    '/api/categories',
    admin,
    categoryBody(`${PREFIX}Parent feed ${stamp}`, { defaultMarkupPercent: 20, tracksExpiryByDefault: true, icon: 'wheat' }),
  );
  const child = await call(
    'POST',
    '/api/categories',
    admin,
    categoryBody(`${PREFIX}Child seed ${stamp}`, { parentId: parent.json?.id, defaultMarkupPercent: null, icon: 'sprout' }),
  );
  const plain = await call('POST', '/api/categories', admin, categoryBody(`${PREFIX}Plain ${stamp}`, { defaultMarkupPercent: null }));
  const marked = await call(
    'POST',
    '/api/categories',
    admin,
    categoryBody(`${PREFIX}Marked ${stamp}`, { defaultMarkupPercent: 20, tracksExpiryByDefault: true }),
  );
  const other = await call('POST', '/api/categories', admin, categoryBody(`${PREFIX}Other ${stamp}`));
  record(
    'fixture categories created',
    parent.status === 201 && child.status === 201 && plain.status === 201 && marked.status === 201 && other.status === 201,
    [parent, child, plain, marked, other].map((row) => row.status).join('/'),
  );

  const base = { categoryId: marked.json?.id, unitId, reorderLevel: '0' };

  const inherited = await call('POST', '/api/items', admin, {
    ...base,
    name: `${PREFIX}Inherited maize ${stamp}`,
    costPrice: '400',
  });
  record(
    'category markup of 20% on cost 400 gives 480',
    inherited.status === 201 && inherited.json?.sellingPrice === 480 && inherited.json?.priceOverridden === false,
    `status ${inherited.status} price ${inherited.json?.sellingPrice} overridden ${inherited.json?.priceOverridden} ${inherited.json?.error || ''}`,
  );
  record(
    'omitted expiry tracking follows the category',
    inherited.status === 201 && inherited.json?.tracksExpiry === true,
    `tracksExpiry ${inherited.json?.tracksExpiry}`,
  );

  const fromParent = await call('POST', '/api/items', admin, {
    name: `${PREFIX}Parent priced ${stamp}`,
    categoryId: child.json?.id,
    unitId,
    costPrice: '400',
  });
  record(
    'markup inherited from the parent category gives 480',
    fromParent.status === 201 && fromParent.json?.sellingPrice === 480 && fromParent.json?.priceOverridden === false,
    `status ${fromParent.status} price ${fromParent.json?.sellingPrice}`,
  );

  const itemMarkup = await call('POST', '/api/items', admin, {
    ...base,
    name: `${PREFIX}Item markup ${stamp}`,
    costPrice: '400',
    markupPercent: '10',
  });
  record(
    'item markup overrides category markup',
    itemMarkup.status === 201 && itemMarkup.json?.sellingPrice === 440 && itemMarkup.json?.markupPercent === 10,
    `status ${itemMarkup.status} price ${itemMarkup.json?.sellingPrice} markup ${itemMarkup.json?.markupPercent}`,
  );

  const rounded = await call('POST', '/api/items', admin, {
    name: `${PREFIX}Rounded ${stamp}`,
    categoryId: plain.json?.id,
    unitId,
    costPrice: '333',
    markupPercent: '15',
  });
  record(
    'cost 333 with 15% markup rounds to 383',
    rounded.status === 201 && rounded.json?.sellingPrice === 383,
    `status ${rounded.status} price ${rounded.json?.sellingPrice} ${rounded.json?.error || ''}`,
  );

  const explicit = await call('POST', '/api/items', manager, {
    ...base,
    name: `${PREFIX}Explicit price ${stamp}`,
    costPrice: '400',
    sellingPrice: '500',
  });
  record(
    'manager can price an item and an explicit price is an override',
    explicit.status === 201 && explicit.json?.sellingPrice === 500 && explicit.json?.priceOverridden === true,
    `status ${explicit.status} price ${explicit.json?.sellingPrice} overridden ${explicit.json?.priceOverridden}`,
  );

  const keptCost = await call('PUT', `/api/items/${inherited.json?.id}`, admin, { costPrice: '450' });
  record(
    'editing cost does not change the selling price',
    keptCost.status === 200 && keptCost.json?.sellingPrice === 480 && keptCost.json?.costPrice === 450,
    `status ${keptCost.status} price ${keptCost.json?.sellingPrice} cost ${keptCost.json?.costPrice} ${keptCost.json?.error || ''}`,
  );
  const keptMarkup = await call('PUT', `/api/items/${inherited.json?.id}`, admin, { markupPercent: '10' });
  record(
    'editing markup does not change the selling price',
    keptMarkup.status === 200 && keptMarkup.json?.sellingPrice === 480 && keptMarkup.json?.markupPercent === 10,
    `status ${keptMarkup.status} price ${keptMarkup.json?.sellingPrice} markup ${keptMarkup.json?.markupPercent}`,
  );

  const below = await call('PUT', `/api/items/${inherited.json?.id}`, admin, { sellingPrice: '100' });
  record(
    'selling price below cost is 422 BELOW_COST',
    below.status === 422 && below.json?.code === 'BELOW_COST',
    `status ${below.status} code ${below.json?.code} ${below.json?.error || ''}`,
  );
  const allowed = await call('PUT', `/api/items/${inherited.json?.id}`, admin, {
    sellingPrice: '100',
    allowBelowCost: true,
  });
  record(
    'allowBelowCost saves a price below cost',
    allowed.status === 200 && allowed.json?.sellingPrice === 100 && allowed.json?.priceOverridden === true,
    `status ${allowed.status} price ${allowed.json?.sellingPrice}`,
  );

  const duplicateName = `${PREFIX}Same name ${stamp}`;
  const firstName = await call('POST', '/api/items', admin, { ...base, name: duplicateName, costPrice: '10' });
  const secondName = await call('POST', '/api/items', admin, { ...base, name: duplicateName.toUpperCase(), costPrice: '10' });
  const otherCategory = await call('POST', '/api/items', admin, {
    name: duplicateName,
    categoryId: other.json?.id,
    unitId,
    costPrice: '10',
  });
  record(
    'duplicate name in the same category is 409 and names the item',
    firstName.status === 201 &&
      secondName.status === 409 &&
      typeof secondName.json?.error === 'string' &&
      secondName.json.error.includes(duplicateName),
    `statuses ${firstName.status}/${secondName.status} ${secondName.json?.error || ''}`,
  );
  record(
    'the same name is allowed in another category',
    otherCategory.status === 201,
    `status ${otherCategory.status} ${otherCategory.json?.error || ''}`,
  );

  const barcode = `ZX9Q${stamp}`.slice(0, 32);
  const sku = `${PREFIX}SKU-${stamp}`;
  const coded = await call('POST', '/api/items', admin, {
    ...base,
    name: `${PREFIX}Coded ${stamp}`,
    brand: `${PREFIX}brand ${stamp}`,
    sku,
    barcode,
    costPrice: '20',
  });
  const duplicateBarcode = await call('POST', '/api/items', admin, {
    ...base,
    name: `${PREFIX}Other barcode ${stamp}`,
    barcode,
    costPrice: '20',
  });
  record(
    'duplicate barcode is 409 and names the item',
    coded.status === 201 &&
      duplicateBarcode.status === 409 &&
      typeof duplicateBarcode.json?.error === 'string' &&
      duplicateBarcode.json.error.includes(`${PREFIX}Coded ${stamp}`),
    `statuses ${coded.status}/${duplicateBarcode.status} ${duplicateBarcode.json?.error || ''}`,
  );

  const unpriced = await call('POST', '/api/items', stock, {
    name: `${PREFIX}Unpriced ${stamp}`,
    categoryId: plain.json?.id,
    unitId,
  });
  record(
    'stock keeper can create an item without prices',
    unpriced.status === 201 && unpriced.json?.sellingPrice === null && unpriced.json?.needsPrice === true && hasCost(unpriced.json),
    `status ${unpriced.status} price ${unpriced.json?.sellingPrice} ${unpriced.json?.error || ''}`,
  );
  const stockPriced = await call('POST', '/api/items', stock, {
    name: `${PREFIX}Stock priced ${stamp}`,
    categoryId: plain.json?.id,
    unitId,
    costPrice: '10',
  });
  record(
    'stock keeper sending a price is 403',
    stockPriced.status === 403 && typeof stockPriced.json?.error === 'string' && /price/i.test(stockPriced.json.error),
    `status ${stockPriced.status} ${stockPriced.json?.error || ''}`,
  );

  for (const [roleName, token] of [
    ['Cashier', cashier],
    ['Accountant', accountant],
  ] as const) {
    const posted = await call('POST', '/api/items', token, {
      name: `${PREFIX}${roleName} denied ${stamp}`,
      categoryId: plain.json?.id,
      unitId,
    });
    const put = await call('PUT', `/api/items/${coded.json?.id || 'missing'}`, token, { name: `${PREFIX}${roleName} denied ${stamp}` });
    const patched = await call('PATCH', `/api/items/${coded.json?.id || 'missing'}/status`, token, { isActive: false });
    const unitPost = await call('POST', '/api/units', token, { name: `${PREFIX}${roleName} unit ${stamp}`, abbreviation: 'zz' });
    const preview = await call('POST', '/api/items/price-preview', token, {
      categoryId: marked.json?.id,
      costPrice: '400',
    });
    record(`${roleName} cannot create`, posted.status === 403, `status ${posted.status}`);
    record(`${roleName} cannot update`, put.status === 403, `status ${put.status}`);
    record(`${roleName} cannot change status`, patched.status === 403, `status ${patched.status}`);
    record(`${roleName} cannot create a unit`, unitPost.status === 403, `status ${unitPost.status}`);
    record(`${roleName} cannot preview a price`, preview.status === 403, `status ${preview.status}`);
  }

  const searchName = encodeURIComponent(`${PREFIX}Coded ${stamp}`);
  for (const [roleName, token, visible] of [
    ['Admin', admin, true],
    ['Manager', manager, true],
    ['Stock keeper', stock, true],
    ['Accountant', accountant, true],
    ['Cashier', cashier, false],
  ] as const) {
    const list = await call('GET', `/api/items?search=${searchName}&status=all`, token);
    const row = Array.isArray(list.json?.items) ? list.json.items.find((item: any) => item.id === coded.json?.id) : null;
    const detail = await call('GET', `/api/items/${coded.json?.id}`, token);
    const listOk = visible ? hasCost(row) : lacksCost(row);
    const detailOk = visible ? hasCost(detail.json) : lacksCost(detail.json);
    record(
      `${roleName} cost fields on list and detail`,
      list.status === 200 && detail.status === 200 && listOk && detailOk,
      `list ${list.status} detail ${detail.status} listKeys ${row ? Object.keys(row).filter((key) => key.toLowerCase().includes('cost') || key.toLowerCase().includes('markup')).join(',') || 'none' : 'missing'}`,
    );
  }

  const byName = await call('GET', `/api/items?search=${searchName}&status=all`, admin);
  const bySku = await call('GET', `/api/items?search=${encodeURIComponent(sku)}&status=all`, admin);
  const byBarcode = await call('GET', `/api/items?search=${encodeURIComponent(barcode)}&status=all`, admin);
  const barcodePrefix = barcode.slice(0, barcode.length - 1);
  const byPrefix = await call('GET', `/api/items?search=${encodeURIComponent(barcodePrefix)}&status=all`, admin);
  const contains = (result: Result) =>
    Array.isArray(result.json?.items) && result.json.items.some((item: any) => item.id === coded.json?.id);
  record('search by name finds the item', byName.status === 200 && contains(byName), `status ${byName.status}`);
  record('search by SKU finds the item', bySku.status === 200 && contains(bySku), `status ${bySku.status}`);
  record('search by exact barcode finds the item', byBarcode.status === 200 && contains(byBarcode), `status ${byBarcode.status}`);
  record(
    'a barcode prefix does not match',
    byPrefix.status === 200 && !contains(byPrefix),
    `status ${byPrefix.status}`,
  );

  const expectedSku = `ITM-${String(unpriced.json?.itemNo ?? '').padStart(5, '0')}`;
  record(
    'a blank SKU is shown as ITM- plus the item number padded to 5 digits',
    unpriced.status === 201 && unpriced.json?.sku == null && unpriced.json?.effectiveSku === expectedSku,
    `sku ${unpriced.json?.sku} effective ${unpriced.json?.effectiveSku} expected ${expectedSku}`,
  );
  const byGenerated = await call('GET', `/api/items?search=${encodeURIComponent(unpriced.json?.effectiveSku || '')}&status=all`, admin);
  record(
    'search by generated SKU finds the unpriced item',
    byGenerated.status === 200 &&
      Array.isArray(byGenerated.json?.items) &&
      byGenerated.json.items.some((item: any) => item.id === unpriced.json?.id),
    `status ${byGenerated.status} sku ${unpriced.json?.effectiveSku}`,
  );

  const inChild = await call('POST', '/api/items', admin, {
    name: `${PREFIX}Nested ${stamp}`,
    categoryId: child.json?.id,
    unitId,
    costPrice: '10',
  });
  const byParent = await call('GET', `/api/items?categoryId=${parent.json?.id}&status=all&search=${encodeURIComponent(PREFIX)}`, admin);
  const byPlain = await call('GET', `/api/items?categoryId=${plain.json?.id}&status=all&search=${encodeURIComponent(`${PREFIX}Nested ${stamp}`)}`, admin);
  record(
    'category filter includes items in sub-categories',
    inChild.status === 201 &&
      Array.isArray(byParent.json?.items) &&
      byParent.json.items.some((item: any) => item.id === inChild.json?.id) &&
      Array.isArray(byPlain.json?.items) &&
      !byPlain.json.items.some((item: any) => item.id === inChild.json?.id),
    `create ${inChild.status} parent ${byParent.status} plain ${byPlain.status}`,
  );

  const needs = await call(
    'GET',
    `/api/items?needsPrice=true&status=all&search=${encodeURIComponent(`${PREFIX}Unpriced ${stamp}`)}`,
    admin,
  );
  const needsPriced = await call(
    'GET',
    `/api/items?needsPrice=true&status=all&search=${encodeURIComponent(`${PREFIX}Coded ${stamp}`)}`,
    admin,
  );
  record(
    'needsPrice returns only unpriced items',
    Array.isArray(needs.json?.items) &&
      needs.json.items.length === 1 &&
      needs.json.items[0]?.id === unpriced.json?.id &&
      Array.isArray(needsPriced.json?.items) &&
      needsPriced.json.items.length === 0,
    `unpriced ${needs.json?.total} priced ${needsPriced.json?.total}`,
  );

  const pageBrand = `${PREFIX}page ${stamp}`;
  const pageA = await call('POST', '/api/items', admin, {
    name: `${PREFIX}Page A ${stamp}`,
    brand: pageBrand,
    categoryId: plain.json?.id,
    unitId,
  });
  const pageB = await call('POST', '/api/items', admin, {
    name: `${PREFIX}Page B ${stamp}`,
    brand: pageBrand,
    categoryId: plain.json?.id,
    unitId,
  });
  const page1 = await call('GET', `/api/items?search=${encodeURIComponent(pageBrand)}&status=all&page=1&pageSize=1`, admin);
  const page2 = await call('GET', `/api/items?search=${encodeURIComponent(pageBrand)}&status=all&page=2&pageSize=1`, admin);
  record(
    'pagination splits the matching items',
    pageA.status === 201 &&
      pageB.status === 201 &&
      page1.json?.total === 2 &&
      page1.json?.pageSize === 1 &&
      page1.json?.items?.length === 1 &&
      page2.json?.items?.length === 1 &&
      page1.json.items[0]?.id !== page2.json.items[0]?.id,
    `total ${page1.json?.total} ids ${page1.json?.items?.[0]?.id || ''}/${page2.json?.items?.[0]?.id || ''}`,
  );

  const inactiveCategory = await call('POST', '/api/categories', admin, categoryBody(`${PREFIX}Inactive cat ${stamp}`));
  await call('PATCH', `/api/categories/${inactiveCategory.json?.id}/status`, admin, { isActive: false });
  const onInactiveCategory = await call('POST', '/api/items', admin, {
    name: `${PREFIX}On inactive category ${stamp}`,
    categoryId: inactiveCategory.json?.id,
    unitId,
  });
  record(
    'an inactive category cannot be assigned',
    onInactiveCategory.status === 400,
    `status ${onInactiveCategory.status} ${onInactiveCategory.json?.error || ''}`,
  );

  const inactiveUnit = await call('POST', '/api/units', admin, { name: `${PREFIX}Dormant ${stamp}`, abbreviation: 'td' });
  await call('PATCH', `/api/units/${inactiveUnit.json?.id}/status`, admin, { isActive: false });
  const onInactiveUnit = await call('POST', '/api/items', admin, {
    name: `${PREFIX}On inactive unit ${stamp}`,
    categoryId: plain.json?.id,
    unitId: inactiveUnit.json?.id,
  });
  record(
    'an inactive unit cannot be assigned',
    onInactiveUnit.status === 400,
    `status ${onInactiveUnit.status} ${onInactiveUnit.json?.error || ''}`,
  );

  const guarded = await call('POST', '/api/categories', admin, categoryBody(`${PREFIX}Guarded ${stamp}`));
  const guardItem = await call('POST', '/api/items', admin, {
    name: `${PREFIX}Guarding ${stamp}`,
    categoryId: guarded.json?.id,
    unitId,
  });
  const blockedCategory = await call('PATCH', `/api/categories/${guarded.json?.id}/status`, admin, { isActive: false });
  record(
    'a category with an active item cannot be deactivated',
    guardItem.status === 201 &&
      blockedCategory.status === 400 &&
      typeof blockedCategory.json?.error === 'string' &&
      blockedCategory.json.error.toLowerCase().includes('item'),
    `item ${guardItem.status} category ${blockedCategory.status} ${blockedCategory.json?.error || ''}`,
  );

  const previewCategory = await call('POST', '/api/items/price-preview', admin, {
    categoryId: marked.json?.id,
    costPrice: '400',
  });
  const previewParent = await call('POST', '/api/items/price-preview', admin, {
    categoryId: child.json?.id,
    costPrice: '400',
  });
  const previewItem = await call('POST', '/api/items/price-preview', admin, {
    categoryId: marked.json?.id,
    costPrice: '400',
    markupPercent: '10',
  });
  const previewNone = await call('POST', '/api/items/price-preview', admin, {
    categoryId: plain.json?.id,
    costPrice: '400',
  });
  const previewCashier = await call('POST', '/api/items/price-preview', cashier, {
    categoryId: marked.json?.id,
    costPrice: '400',
  });
  record(
    'price preview source is category',
    previewCategory.status === 200 && previewCategory.json?.markupSource === 'category' && previewCategory.json?.suggestedSellingPrice === 480,
    `${previewCategory.status} ${previewCategory.json?.markupSource} ${previewCategory.json?.suggestedSellingPrice}`,
  );
  record(
    'price preview source is parent category',
    previewParent.status === 200 && previewParent.json?.markupSource === 'parent category' && previewParent.json?.suggestedSellingPrice === 480,
    `${previewParent.status} ${previewParent.json?.markupSource} ${previewParent.json?.suggestedSellingPrice}`,
  );
  record(
    'price preview source is item',
    previewItem.status === 200 && previewItem.json?.markupSource === 'item' && previewItem.json?.suggestedSellingPrice === 440,
    `${previewItem.status} ${previewItem.json?.markupSource} ${previewItem.json?.suggestedSellingPrice}`,
  );
  record(
    'price preview source is none',
    previewNone.status === 200 && previewNone.json?.markupSource === 'none' && previewNone.json?.suggestedSellingPrice === null,
    `${previewNone.status} ${previewNone.json?.markupSource} ${previewNone.json?.suggestedSellingPrice}`,
  );
  record('cashier price preview is 403', previewCashier.status === 403, `status ${previewCashier.status}`);

  const pricedAgain = await call('PUT', `/api/items/${explicit.json?.id}`, admin, { sellingPrice: '510' });
  const events = await prisma.auditEvent.findMany({
    where: { userId: { in: userIds }, eventType: 'item' },
    select: { description: true, action: true },
  });
  const descriptions = events.map((event) => event.description || '');
  record('audit events were written', events.length > 0, `${events.length} events`);
  record(
    'audit describes the selling price change',
    pricedAgain.status === 200 &&
      descriptions.some((line) => line.includes('Changed selling price of') && line.includes('KES 500') && line.includes('KES 510')),
    descriptions.filter((line) => line.includes('selling price')).slice(0, 2).join(' | '),
  );
  record(
    'audit describes cost and markup changes',
    descriptions.some((line) => line.includes('Changed cost of') && line.includes('KES ')) &&
      descriptions.some((line) => line.includes('Changed markup of')),
    descriptions.filter((line) => line.includes('Changed cost') || line.includes('Changed markup')).slice(0, 2).join(' | '),
  );

  const failed = checks.filter((item) => !item.pass);
  console.log('\nCheck | Result | Detail');
  console.log('---|---|---');
  for (const item of checks) {
    console.log(`${item.name} | ${item.pass ? 'PASS' : 'FAIL'} | ${item.detail}`);
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.itemPack.deleteMany({
      where: {
        item: {
          OR: [
            { name: { startsWith: PREFIX } },
            { sku: { startsWith: PREFIX } },
            { barcode: { startsWith: PREFIX } },
            { brand: { startsWith: PREFIX } },
          ],
        },
      },
    });
    await prisma.item.deleteMany({
      where: {
        OR: [
          { name: { startsWith: PREFIX } },
          { sku: { startsWith: PREFIX } },
          { barcode: { startsWith: PREFIX } },
          { brand: { startsWith: PREFIX } },
        ],
      },
    });
    await prisma.category.deleteMany({ where: { name: { startsWith: PREFIX }, parentId: { not: null } } });
    await prisma.category.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.unit.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.auditEvent.deleteMany({ where: { userName: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({
      where: { OR: [{ name: { startsWith: PREFIX } }, { email: { startsWith: PREFIX } }] },
    });
    await prisma.$disconnect();
  });
