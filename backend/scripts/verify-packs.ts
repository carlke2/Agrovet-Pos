import '../loadEnv';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '@/services/prisma';
import { signToken } from '@/middlewares/auth';
import { fromBaseQuantity, toBaseQuantity } from '@/lib/packs';

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

function categoryBody(name: string) {
  return { name, description: 'Temporary pack check', defaultMarkupPercent: null, tracksExpiryByDefault: false, icon: 'leaf', sortOrder: 0 };
}

function itemBody(name: string, categoryId: string, unitId: string, extra: Record<string, unknown> = {}) {
  return { name, categoryId, unitId, reorderLevel: '0', tracksExpiry: false, taxType: 'NONE', ...extra };
}

async function main() {
  const five = toBaseQuantity(5, { quantityInBase: new Prisma.Decimal(12) });
  const twoAndHalf = toBaseQuantity(new Prisma.Decimal('2.5'), { quantityInBase: new Prisma.Decimal(12) });
  const split = fromBaseQuantity(new Prisma.Decimal(30), { quantityInBase: new Prisma.Decimal(12) });
  const precise = toBaseQuantity(new Prisma.Decimal('0.1'), { quantityInBase: new Prisma.Decimal(3) });
  record('5 cartons of 12 equal 60 base units', five.equals(60), five.toString());
  record('2.5 cartons of 12 equal 30 base units', twoAndHalf.equals(30), twoAndHalf.toString());
  record(
    '30 base units of a 12 carton are 2 packs and 6 base',
    split.packs.equals(2) && split.remainderBase.equals(6),
    `${split.packs.toString()} / ${split.remainderBase.toString()}`,
  );
  record('0.1 times 3 stays exact', precise.equals(new Prisma.Decimal('0.3')), precise.toString());

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

  const feeds = await call('POST', '/api/categories', admin, categoryBody(`${PREFIX}Animal Feeds ${stamp}`));
  const dairy = await call('POST', '/api/categories', admin, categoryBody(`${PREFIX}Dairy meal ${stamp}`));
  const seeds = await call('POST', '/api/categories', admin, categoryBody(`${PREFIX}Seeds ${stamp}`));
  const closed = await call('POST', '/api/categories', admin, categoryBody(`${PREFIX}Closed ${stamp}`));
  const bottle = await call('POST', '/api/units', admin, { name: `${PREFIX}Bottle ${stamp}`, abbreviation: 'bt' });
  const bag = await call('POST', '/api/units', admin, { name: `${PREFIX}Bag ${stamp}`, abbreviation: 'bg' });
  record(
    'fixtures created',
    [feeds, dairy, seeds, closed, bottle, bag].every((row) => row.status === 201),
    [feeds, dairy, seeds, closed, bottle, bag].map((row) => row.status).join('/'),
  );
  const feedsId = feeds.json?.id as string;
  const dairyId = dairy.json?.id as string;
  const seedsId = seeds.json?.id as string;
  const bottleId = bottle.json?.id as string;
  const bagId = bag.json?.id as string;

  const dewormerName = `${PREFIX}Dewormer 500ml ${stamp}`;
  const dewormer = await call(
    'POST',
    '/api/items',
    admin,
    itemBody(dewormerName, feedsId, bottleId, { activeIngredient: `${PREFIX}Oxy ${stamp}`, strength: '500ml', isRegulated: true }),
  );
  const plain = await call('POST', '/api/items', admin, itemBody(`${PREFIX}Plain salt ${stamp}`, feedsId, bottleId, { isRegulated: false }));
  const managerItem = await call('POST', '/api/items', manager, itemBody(`${PREFIX}Manager item ${stamp}`, dairyId, bottleId));
  const stockItem = await call('POST', '/api/items', stock, itemBody(`${PREFIX}Stock item ${stamp}`, seedsId, bottleId));
  record('regulated item created', dewormer.status === 201 && dewormer.json?.isRegulated === true && dewormer.json?.imageUrl == null, `status ${dewormer.status}`);
  const itemId = dewormer.json?.id as string;

  const noToken = await call('GET', `/api/items/${itemId}/packs`);
  const noTokenPost = await call('POST', `/api/items/${itemId}/packs`, undefined, {});
  record('no token on pack list is 401', noToken.status === 401, `status ${noToken.status}`);
  record('no token on pack create is 401', noTokenPost.status === 401, `status ${noTokenPost.status}`);

  const accepted: Result[] = [];
  for (const quantity of ['12', '0.5', '12.5']) {
    accepted.push(await call('POST', `/api/items/${itemId}/packs`, admin, { name: `${PREFIX}Size ${quantity} ${stamp}`, quantityInBase: quantity }));
  }
  record(
    'pack quantities 12, 0.5 and 12.5 are accepted',
    accepted.every((row) => row.status === 201),
    accepted.map((row) => `${row.status}:${row.json?.quantityInBase}`).join(' '),
  );
  const refused: Result[] = [];
  for (const quantity of ['0', '-1', '1.2345', '100001']) {
    refused.push(await call('POST', `/api/items/${itemId}/packs`, admin, { name: `${PREFIX}Bad ${quantity} ${stamp}`, quantityInBase: quantity }));
  }
  record(
    'pack quantities 0, -1, 1.2345 and 100001 are 400',
    refused.every((row) => row.status === 400),
    refused.map((row) => row.status).join('/'),
  );

  const carton = await call('POST', `/api/items/${itemId}/packs`, admin, { name: `Carton ${stamp}`, quantityInBase: '12' });
  const duplicate = await call('POST', `/api/items/${itemId}/packs`, admin, { name: `CARTON ${stamp}`, quantityInBase: '6' });
  const otherCarton = await call('POST', `/api/items/${plain.json?.id}/packs`, admin, { name: `Carton ${stamp}`, quantityInBase: '6' });
  record('admin can add a pack', carton.status === 201, `status ${carton.status} ${carton.json?.error || ''}`);
  record(
    'duplicate pack name in another case is 409 and names the pack',
    duplicate.status === 409 && String(duplicate.json?.error || '').includes(`Carton ${stamp}`),
    `status ${duplicate.status} ${duplicate.json?.error || ''}`,
  );
  record('the same pack name is allowed on another item', otherCarton.status === 201, `status ${otherCarton.status} ${otherCarton.json?.error || ''}`);

  const extraPacks = [await call('POST', `/api/items/${itemId}/packs`, admin, { name: `Tray ${stamp}`, quantityInBase: '2' })];
  const sixth = await call('POST', `/api/items/${itemId}/packs`, admin, { name: `Sixth ${stamp}`, quantityInBase: '2' });
  record(
    'a sixth active pack is refused',
    extraPacks.every((row) => row.status === 201) && sixth.status === 409 && String(sixth.json?.error || '').includes('5 active packs'),
    `extras ${extraPacks.map((row) => row.status).join('/')} sixth ${sixth.status} ${sixth.json?.error || ''}`,
  );

  const edited = await call('PUT', `/api/items/${itemId}/packs/${carton.json?.id}`, admin, { quantityInBase: '24' });
  const deactivated = await call('PATCH', `/api/items/${itemId}/packs/${carton.json?.id}/status`, admin, { isActive: false });
  record('admin can edit a pack', edited.status === 200 && edited.json?.quantityInBase === 24, `status ${edited.status} qty ${edited.json?.quantityInBase}`);
  record('admin can deactivate a pack', deactivated.status === 200 && deactivated.json?.isActive === false, `status ${deactivated.status}`);

  const managerPack = await call('POST', `/api/items/${managerItem.json?.id}/packs`, manager, { name: `Box ${stamp}`, quantityInBase: '4' });
  const managerEdit = await call('PUT', `/api/items/${managerItem.json?.id}/packs/${managerPack.json?.id}`, manager, { name: `Case ${stamp}` });
  const managerOff = await call('PATCH', `/api/items/${managerItem.json?.id}/packs/${managerPack.json?.id}/status`, manager, { isActive: false });
  record('manager can add, edit and deactivate a pack', managerPack.status === 201 && managerEdit.status === 200 && managerOff.status === 200, `${managerPack.status}/${managerEdit.status}/${managerOff.status}`);

  const stockPack = await call('POST', `/api/items/${stockItem.json?.id}/packs`, stock, { name: `Sack ${stamp}`, quantityInBase: '8' });
  const stockEdit = await call('PUT', `/api/items/${stockItem.json?.id}/packs/${stockPack.json?.id}`, stock, { quantityInBase: '9' });
  const stockOff = await call('PATCH', `/api/items/${stockItem.json?.id}/packs/${stockPack.json?.id}/status`, stock, { isActive: false });
  record('stock keeper can add, edit and deactivate a pack', stockPack.status === 201 && stockEdit.status === 200 && stockOff.status === 200, `${stockPack.status}/${stockEdit.status}/${stockOff.status}`);

  const cashierRead = await call('GET', `/api/items/${itemId}/packs?includeInactive=true`, cashier);
  const cashierDetail = await call('GET', `/api/items/${itemId}`, cashier);
  const cashierPost = await call('POST', `/api/items/${itemId}/packs`, cashier, { name: `Nope ${stamp}`, quantityInBase: '2' });
  const cashierPut = await call('PUT', `/api/items/${itemId}/packs/${carton.json?.id}`, cashier, { name: `Nope ${stamp}` });
  const cashierPatch = await call('PATCH', `/api/items/${itemId}/packs/${carton.json?.id}/status`, cashier, { isActive: true });
  const accountantRead = await call('GET', `/api/items/${itemId}/packs?includeInactive=true`, accountant);
  const accountantPost = await call('POST', `/api/items/${itemId}/packs`, accountant, { name: `Nope ${stamp}`, quantityInBase: '2' });
  const accountantPut = await call('PUT', `/api/items/${itemId}/packs/${carton.json?.id}`, accountant, { name: `Nope ${stamp}` });
  const accountantPatch = await call('PATCH', `/api/items/${itemId}/packs/${carton.json?.id}/status`, accountant, { isActive: true });
  record('cashier can read packs', cashierRead.status === 200 && Array.isArray(cashierRead.json) && cashierDetail.json?.packs?.length > 0, `list ${cashierRead.status} detail packs ${cashierDetail.json?.packs?.length}`);
  record('cashier pack writes are 403', cashierPost.status === 403 && cashierPut.status === 403 && cashierPatch.status === 403, `${cashierPost.status}/${cashierPut.status}/${cashierPatch.status}`);
  record('accountant can read packs but writes are 403', accountantRead.status === 200 && accountantPost.status === 403 && accountantPut.status === 403 && accountantPatch.status === 403, `${accountantRead.status}/${accountantPost.status}/${accountantPut.status}/${accountantPatch.status}`);

  const codeItem = `${stamp}ITEM`.slice(0, 12);
  const codePack = `${stamp}PACK`.slice(0, 12);
  const firstCode = await call('POST', '/api/items', admin, itemBody(`${PREFIX}Coded ${stamp}`, feedsId, bottleId, { barcode: codeItem }));
  const itemToItem = await call('POST', '/api/items', admin, itemBody(`${PREFIX}Coded again ${stamp}`, dairyId, bottleId, { barcode: codeItem }));
  const itemToPack = await call('POST', `/api/items/${plain.json?.id}/packs`, admin, { name: `Coded pack ${stamp}`, quantityInBase: '2', barcode: codeItem });
  const packCode = await call('POST', `/api/items/${plain.json?.id}/packs`, admin, { name: `Own code ${stamp}`, quantityInBase: '2', barcode: codePack });
  const packToItem = await call('POST', '/api/items', admin, itemBody(`${PREFIX}Pack code ${stamp}`, seedsId, bottleId, { barcode: codePack }));
  const packToPack = await call('POST', `/api/items/${itemId}/packs`, admin, { name: `Copy code ${stamp}`, quantityInBase: '2', barcode: codePack });
  record('item barcode colliding with an item is 409 and names it', itemToItem.status === 409 && String(itemToItem.json?.error || '').includes(`${PREFIX}Coded ${stamp}`), `${itemToItem.status} ${itemToItem.json?.error || ''}`);
  record('pack barcode colliding with an item is 409 and names the item', itemToPack.status === 409 && String(itemToPack.json?.error || '').includes(`${PREFIX}Coded ${stamp}`) && !String(itemToPack.json?.error || '').includes('pack '), `${itemToPack.status} ${itemToPack.json?.error || ''}`);
  record('item barcode colliding with a pack is 409 and names the pack', packToItem.status === 409 && String(packToItem.json?.error || '').includes(`Own code ${stamp}`), `${packToItem.status} ${packToItem.json?.error || ''}`);
  record('pack barcode colliding with a pack is 409 and names the pack', packToPack.status === 409 && String(packToPack.json?.error || '').includes(`Own code ${stamp}`), `${packToPack.status} ${packToPack.json?.error || ''}`);
  record('barcode fixtures were created', firstCode.status === 201 && packCode.status === 201, `${firstCode.status}/${packCode.status}`);

  const unitChange = await call('PUT', `/api/items/${itemId}`, admin, { unitId: bagId });
  record('changing the unit of an item with packs is 409', unitChange.status === 409 && String(unitChange.json?.error || '').toLowerCase().includes('unit'), `${unitChange.status} ${unitChange.json?.error || ''}`);

  const regulatedList = await call('GET', `/api/items?search=${encodeURIComponent(stamp)}&status=all&regulated=true`, admin);
  const ingredientList = await call('GET', `/api/items?search=${encodeURIComponent(`${PREFIX}Oxy ${stamp}`)}&status=all`, admin);
  const regulatedHit = regulatedList.json?.items?.some((row: { id: string }) => row.id === itemId);
  const plainHit = regulatedList.json?.items?.some((row: { id: string }) => row.id === plain.json?.id);
  const ingredientHit = ingredientList.json?.items?.some((row: { id: string }) => row.id === itemId);
  record('regulated filter returns only regulated items', regulatedList.status === 200 && regulatedHit === true && plainHit === false, `status ${regulatedList.status}`);
  record('search matches the active ingredient', ingredientList.status === 200 && ingredientHit === true, `status ${ingredientList.status} total ${ingredientList.json?.total}`);
  record('item list includes packCount', typeof dewormer.json?.packCount === 'number' || regulatedList.json?.items?.[0]?.packCount != null, `packCount ${regulatedList.json?.items?.find((row: { id: string }) => row.id === itemId)?.packCount}`);

  const moveName = `${PREFIX}Shared maize ${stamp}`;
  const stay = await call('POST', '/api/items', admin, itemBody(moveName, dairyId, bottleId));
  const mover = await call('POST', '/api/items', admin, itemBody(moveName, feedsId, bottleId));
  const beforeCategory = mover.json?.categoryId;
  const collision = await call('POST', '/api/items/bulk-category', admin, { itemIds: [mover.json?.id], categoryId: dairyId });
  const after = await call('GET', `/api/items/${mover.json?.id}`, admin);
  record(
    'a name collision refuses the whole bulk move and changes nothing',
    collision.status === 409 && String(collision.json?.error || '').includes(moveName) && after.json?.categoryId === beforeCategory,
    `${collision.status} ${collision.json?.error || ''} category ${after.json?.categoryId}`,
  );

  const closedOff = await call('PATCH', `/api/categories/${closed.json?.id}/status`, admin, { isActive: false });
  const inactiveTarget = await call('POST', '/api/items/bulk-category', admin, { itemIds: [plain.json?.id], categoryId: closed.json?.id });
  record('an inactive target category is refused', closedOff.status === 200 && inactiveTarget.status === 400, `${closedOff.status}/${inactiveTarget.status} ${inactiveTarget.json?.error || ''}`);

  const cashierBulk = await call('POST', '/api/items/bulk-category', cashier, { itemIds: [plain.json?.id], categoryId: dairyId });
  const accountantBulk = await call('POST', '/api/items/bulk-category', accountant, { itemIds: [plain.json?.id], categoryId: dairyId });
  record('cashier and accountant bulk category change is 403', cashierBulk.status === 403 && accountantBulk.status === 403, `${cashierBulk.status}/${accountantBulk.status}`);

  const adminMove = await call('POST', '/api/items/bulk-category', admin, { itemIds: [plain.json?.id], categoryId: seedsId });
  const managerMove = await call('POST', '/api/items/bulk-category', manager, { itemIds: [managerItem.json?.id], categoryId: feedsId });
  const stockMove = await call('POST', '/api/items/bulk-category', stock, { itemIds: [stockItem.json?.id], categoryId: dairyId });
  const movedEvents = await prisma.auditEvent.findMany({
    where: { userId: { in: userIds }, description: { startsWith: 'Moved ' } },
    select: { description: true },
  });
  record(
    'admin, manager and stock keeper can move items',
    adminMove.status === 200 && managerMove.status === 200 && stockMove.status === 200,
    `${adminMove.status}/${managerMove.status}/${stockMove.status} ${adminMove.json?.error || ''}`,
  );
  record(
    'each successful bulk move writes one audit event',
    movedEvents.length === 3 && movedEvents.some((event) => event.description?.includes(`from "${PREFIX}Animal Feeds ${stamp}"`) && event.description?.includes(`to "${PREFIX}Seeds ${stamp}"`)),
    movedEvents.map((event) => event.description).join(' | '),
  );

  const events = await prisma.auditEvent.findMany({
    where: { userId: { in: userIds }, eventType: { in: ['pack', 'item'] } },
    select: { description: true, eventType: true },
  });
  const descriptions = events.map((event) => event.description || '');
  record(
    'adding a pack writes an audit event',
    descriptions.some((line) => line.startsWith('Added pack ') && line.includes(`Carton ${stamp}`) && line.includes(dewormerName)),
    descriptions.filter((line) => line.startsWith('Added pack')).slice(0, 1).join(''),
  );
  record(
    'marking an item regulated writes an audit event',
    descriptions.some((line) => line.includes(`Marked "${dewormerName}" as regulated`)),
    descriptions.filter((line) => line.includes('regulated')).slice(0, 1).join(''),
  );
  record('pack and item audits were written', events.length > 0, `${events.length} events`);

  const failed = checks.filter((item) => !item.pass);
  console.log('\nCheck | Result | Detail');
  console.log('---|---|---');
  for (const item of checks) console.log(`${item.name} | ${item.pass ? 'PASS' : 'FAIL'} | ${item.detail}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.itemPack.deleteMany({ where: { item: { name: { startsWith: PREFIX } } } });
    await prisma.item.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { name: { startsWith: PREFIX }, parentId: { not: null } } });
    await prisma.category.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.unit.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.auditEvent.deleteMany({ where: { userName: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { OR: [{ name: { startsWith: PREFIX } }, { email: { startsWith: PREFIX } }] } });
    await prisma.$disconnect();
  });
