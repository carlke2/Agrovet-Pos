import '../loadEnv';
import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';
import { signToken } from '@/middlewares/auth';

const PREFIX = '__test_';
const API = process.env.VERIFY_API_URL || 'http://127.0.0.1:5000';
const stamp = Date.now().toString(36);
const phone = `0712${String(Date.now()).slice(-7)}`;
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

function supplierBody(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    taxPin: '',
    paymentTerms: '',
    notes: '',
    ...extra,
  };
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

  const noToken = await call('GET', '/api/suppliers');
  const noTokenPost = await call('POST', '/api/suppliers', undefined, {});
  record('no token on the list is 401', noToken.status === 401, `status ${noToken.status}`);
  record('no token on create is 401', noTokenPost.status === 401, `status ${noTokenPost.status}`);

  const adminName = `${PREFIX}Kenya Agri Supplies ${stamp}`;
  const created = await call(
    'POST',
    '/api/suppliers',
    admin,
    supplierBody(adminName, {
      contactPerson: `${PREFIX}Amina ${stamp}`,
      phone,
      email: `${PREFIX}amina_${stamp}@example.com`,
      address: 'Industrial Area',
      taxPin: 'A123456789B',
      paymentTerms: '30 days',
      notes: 'Delivers on Tuesdays',
    }),
  );
  record(
    'admin can create a supplier',
    created.status === 201 && created.json?.name === adminName && created.json?.phone === phone && created.json?.isActive === true,
    `status ${created.status} ${created.json?.error || ''}`,
  );
  const supplierId = created.json?.id as string;

  const blanks = await call('POST', '/api/suppliers', admin, supplierBody(`${PREFIX}Blank fields ${stamp}`));
  record(
    'empty strings are saved as null',
    blanks.status === 201 &&
      blanks.json?.contactPerson === null &&
      blanks.json?.phone === null &&
      blanks.json?.email === null &&
      blanks.json?.taxPin === null &&
      blanks.json?.paymentTerms === null &&
      blanks.json?.notes === null,
    `status ${blanks.status} phone ${blanks.json?.phone} email ${blanks.json?.email}`,
  );

  const managerCreated = await call(
    'POST',
    '/api/suppliers',
    manager,
    supplierBody(`${PREFIX}Manager mill ${stamp}`, { contactPerson: `${PREFIX}Otieno ${stamp}`, phone: '0722000111' }),
  );
  record('manager can create a supplier', managerCreated.status === 201, `status ${managerCreated.status} ${managerCreated.json?.error || ''}`);

  const stockCreated = await call(
    'POST',
    '/api/suppliers',
    stock,
    supplierBody(`${PREFIX}Stock feeds ${stamp}`, { contactPerson: `${PREFIX}Wanjiku ${stamp}`, phone: '0733000222' }),
  );
  record('stock keeper can create a supplier', stockCreated.status === 201, `status ${stockCreated.status} ${stockCreated.json?.error || ''}`);

  const readOne = await call('GET', `/api/suppliers/${supplierId}`, admin);
  record('admin can read one supplier', readOne.status === 200 && readOne.json?.id === supplierId, `status ${readOne.status}`);

  const managerRead = await call('GET', `/api/suppliers/${managerCreated.json?.id}`, manager);
  record('manager can read one supplier', managerRead.status === 200 && managerRead.json?.id === managerCreated.json?.id, `status ${managerRead.status}`);

  const stockRead = await call('GET', `/api/suppliers/${stockCreated.json?.id}`, stock);
  record(
    'stock keeper can read one supplier',
    stockRead.status === 200 && stockRead.json?.id === stockCreated.json?.id,
    `status ${stockRead.status}`,
  );

  const editedPhone = '0744111222';
  const edited = await call('PUT', `/api/suppliers/${supplierId}`, admin, { phone: editedPhone });
  record(
    'admin can edit a supplier',
    edited.status === 200 && edited.json?.phone === editedPhone && edited.json?.name === adminName,
    `status ${edited.status} phone ${edited.json?.phone} ${edited.json?.error || ''}`,
  );

  const managerEdit = await call('PUT', `/api/suppliers/${managerCreated.json?.id}`, manager, { paymentTerms: 'Pay on delivery' });
  record(
    'manager can edit a supplier',
    managerEdit.status === 200 && managerEdit.json?.paymentTerms === 'Pay on delivery',
    `status ${managerEdit.status} ${managerEdit.json?.error || ''}`,
  );

  const stockEdit = await call('PUT', `/api/suppliers/${stockCreated.json?.id}`, stock, { contactPerson: `${PREFIX}Kamau ${stamp}` });
  record(
    'stock keeper can edit a supplier',
    stockEdit.status === 200 && stockEdit.json?.contactPerson === `${PREFIX}Kamau ${stamp}`,
    `status ${stockEdit.status} ${stockEdit.json?.error || ''}`,
  );

  const deactivated = await call('PATCH', `/api/suppliers/${supplierId}/status`, admin, { isActive: false });
  record(
    'admin can deactivate a supplier',
    deactivated.status === 200 && deactivated.json?.isActive === false,
    `status ${deactivated.status} active ${deactivated.json?.isActive}`,
  );
  const managerOff = await call('PATCH', `/api/suppliers/${managerCreated.json?.id}/status`, manager, { isActive: false });
  record('manager can deactivate a supplier', managerOff.status === 200 && managerOff.json?.isActive === false, `status ${managerOff.status}`);
  const stockOff = await call('PATCH', `/api/suppliers/${stockCreated.json?.id}/status`, stock, { isActive: false });
  record(
    'stock keeper can deactivate a supplier',
    stockOff.status === 200 && stockOff.json?.isActive === false,
    `status ${stockOff.status}`,
  );

  const accountantList = await call('GET', `/api/suppliers?search=${encodeURIComponent(stamp)}&status=all`, accountant);
  const accountantRead = await call('GET', `/api/suppliers/${supplierId}`, accountant);
  const accountantPost = await call('POST', '/api/suppliers', accountant, supplierBody(`${PREFIX}Accountant blocked ${stamp}`));
  const accountantPut = await call('PUT', `/api/suppliers/${supplierId}`, accountant, { notes: 'no' });
  const accountantPatch = await call('PATCH', `/api/suppliers/${supplierId}/status`, accountant, { isActive: true });
  record(
    'accountant can list suppliers',
    accountantList.status === 200 && Array.isArray(accountantList.json?.suppliers),
    `status ${accountantList.status}`,
  );
  record('accountant can read one supplier', accountantRead.status === 200 && accountantRead.json?.id === supplierId, `status ${accountantRead.status}`);
  record('accountant create is 403', accountantPost.status === 403, `status ${accountantPost.status}`);
  record('accountant edit is 403', accountantPut.status === 403, `status ${accountantPut.status}`);
  record('accountant status change is 403', accountantPatch.status === 403, `status ${accountantPatch.status}`);

  const cashierList = await call('GET', '/api/suppliers', cashier);
  const cashierRead = await call('GET', `/api/suppliers/${supplierId}`, cashier);
  const cashierPost = await call('POST', '/api/suppliers', cashier, supplierBody(`${PREFIX}Cashier blocked ${stamp}`));
  const cashierPut = await call('PUT', `/api/suppliers/${supplierId}`, cashier, { notes: 'no' });
  const cashierPatch = await call('PATCH', `/api/suppliers/${supplierId}/status`, cashier, { isActive: true });
  record('cashier list is 403', cashierList.status === 403, `status ${cashierList.status}`);
  record('cashier read is 403', cashierRead.status === 403, `status ${cashierRead.status}`);
  record('cashier create is 403', cashierPost.status === 403, `status ${cashierPost.status}`);
  record('cashier edit is 403', cashierPut.status === 403, `status ${cashierPut.status}`);
  record('cashier status change is 403', cashierPatch.status === 403, `status ${cashierPatch.status}`);

  const duplicate = await call('POST', '/api/suppliers', admin, supplierBody(adminName.toLowerCase()));
  record(
    'duplicate name in another case is 409 and names the existing supplier',
    duplicate.status === 409 && typeof duplicate.json?.error === 'string' && duplicate.json.error.includes(adminName),
    `status ${duplicate.status} ${duplicate.json?.error || ''}`,
  );

  const badPhone = await call('POST', '/api/suppliers', admin, supplierBody(`${PREFIX}Bad phone ${stamp}`, { phone: '12-call' }));
  const badEmail = await call('POST', '/api/suppliers', admin, supplierBody(`${PREFIX}Bad email ${stamp}`, { email: 'not-an-email' }));
  const shortName = await call('POST', '/api/suppliers', admin, supplierBody('A'));
  record('invalid phone is 400', badPhone.status === 400 && badPhone.json?.field === 'phone', `status ${badPhone.status} ${badPhone.json?.error || ''}`);
  record('invalid email is 400', badEmail.status === 400 && badEmail.json?.field === 'email', `status ${badEmail.status} ${badEmail.json?.error || ''}`);
  record('short name is 400', shortName.status === 400 && shortName.json?.field === 'name', `status ${shortName.status} ${shortName.json?.error || ''}`);

  const byName = await call('GET', `/api/suppliers?search=${encodeURIComponent(adminName)}&status=all`, admin);
  const byContact = await call('GET', `/api/suppliers?search=${encodeURIComponent(`${PREFIX}Amina ${stamp}`)}&status=all`, admin);
  const byPhone = await call('GET', `/api/suppliers?search=${encodeURIComponent(editedPhone)}&status=all`, admin);
  const nameHit = byName.json?.suppliers?.some((row: { id: string }) => row.id === supplierId);
  const contactHit = byContact.json?.suppliers?.some((row: { id: string }) => row.id === supplierId);
  const phoneHit = byPhone.json?.suppliers?.some((row: { id: string }) => row.id === supplierId);
  record('search by name finds the supplier', byName.status === 200 && nameHit === true, `status ${byName.status} total ${byName.json?.total}`);
  record('search by contact person finds the supplier', byContact.status === 200 && contactHit === true, `status ${byContact.status} total ${byContact.json?.total}`);
  record('search by phone finds the supplier', byPhone.status === 200 && phoneHit === true, `status ${byPhone.status} total ${byPhone.json?.total}`);

  const activeList = await call('GET', `/api/suppliers?search=${encodeURIComponent(stamp)}&status=active`, admin);
  const inactiveList = await call('GET', `/api/suppliers?search=${encodeURIComponent(stamp)}&status=inactive`, admin);
  const activeIds = (activeList.json?.suppliers || []).map((row: { id: string }) => row.id);
  const inactiveIds = (inactiveList.json?.suppliers || []).map((row: { id: string }) => row.id);
  record(
    'status filter separates active and inactive suppliers',
    activeList.status === 200 &&
      inactiveList.status === 200 &&
      !activeIds.includes(supplierId) &&
      inactiveIds.includes(supplierId) &&
      activeIds.includes(blanks.json?.id),
    `active ${activeIds.length} inactive ${inactiveIds.length}`,
  );

  const pageOne = await call('GET', `/api/suppliers?search=${encodeURIComponent(stamp)}&status=all&page=1&pageSize=1`, admin);
  const pageTwo = await call('GET', `/api/suppliers?search=${encodeURIComponent(stamp)}&status=all&page=2&pageSize=1`, admin);
  const firstId = pageOne.json?.suppliers?.[0]?.id;
  const secondId = pageTwo.json?.suppliers?.[0]?.id;
  record(
    'pagination returns one row per page and a page count',
    pageOne.status === 200 &&
      pageOne.json?.pageSize === 1 &&
      pageOne.json?.suppliers?.length === 1 &&
      pageOne.json?.pageCount >= 2 &&
      pageTwo.json?.suppliers?.length === 1 &&
      firstId !== secondId,
    `pageCount ${pageOne.json?.pageCount} total ${pageOne.json?.total}`,
  );

  const events = await prisma.auditEvent.findMany({
    where: { userId: { in: userIds }, eventType: 'supplier' },
    select: { description: true },
  });
  const descriptions = events.map((event) => event.description || '');
  record(
    'creating a supplier writes an audit event',
    descriptions.some((line) => line === `Created supplier "${adminName}"`),
    descriptions.filter((line) => line.startsWith('Created')).slice(0, 2).join(' | '),
  );
  record(
    'editing a phone writes an audit event',
    descriptions.some((line) => line.includes(`Changed phone of "${adminName}"`) && line.includes(phone) && line.includes(editedPhone)),
    descriptions.filter((line) => line.includes('Changed phone')).slice(0, 1).join(' | '),
  );
  record(
    'deactivating a supplier writes an audit event',
    descriptions.some((line) => line === `Deactivated supplier "${adminName}"`),
    descriptions.filter((line) => line.startsWith('Deactivated')).slice(0, 2).join(' | '),
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
    await prisma.vendor.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.auditEvent.deleteMany({ where: { userName: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({
      where: { OR: [{ name: { startsWith: PREFIX } }, { email: { startsWith: PREFIX } }] },
    });
    await prisma.$disconnect();
  });
