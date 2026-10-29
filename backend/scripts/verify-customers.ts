import '../loadEnv';
import { execFile } from 'child_process';
import path from 'path';
import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';
import { signToken } from '@/middlewares/auth';

const PREFIX = '__test_';
const API = process.env.VERIFY_API_URL || 'http://127.0.0.1:5000';
const stamp = Date.now().toString(36);
const PHONE_TYPED = '0712 345 678';
const PHONE_INTL = '+254712345678';
const PHONE_SHORT = '712345678';
const PHONE_KEY = '254712345678';
const ROLES = ['Admin', 'Manager', 'Stock keeper', 'Cashier', 'Accountant'] as const;

type Result = { status: number; json: any };
type Check = { name: string; pass: boolean; detail: string };

const checks: Check[] = [];

function record(name: string, pass: boolean, detail = '') {
  checks.push({ name, pass, detail });
}

async function call(method: string, urlPath: string, token?: string, body?: unknown): Promise<Result> {
  const response = await fetch(`${API}${urlPath}`, {
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

function runWalkin(): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'npm',
      ['run', 'db:create-walkin'],
      { cwd: path.resolve(__dirname, '..') },
      (error, stdout, stderr) => {
        const output = `${stdout || ''}\n${stderr || ''}`;
        if (!error) {
          resolve({ code: 0, output });
          return;
        }
        const code = typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
          ? ((error as NodeJS.ErrnoException & { code: number }).code)
          : 1;
        if (code === 1 || typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === 'number') {
          resolve({ code, output });
          return;
        }
        reject(error);
      },
    );
  });
}

function customerCode(customerNo: number): string {
  return `CUS-${String(customerNo).padStart(5, '0')}`;
}

async function main() {
  const beforeRows = await prisma.customer.findMany({
    where: { OR: [{ systemKey: 'WALK_IN' }, { isSystem: true }] },
    select: { id: true, name: true, systemKey: true, isSystem: true, isActive: true },
  });
  const firstRun = await runWalkin();
  const secondRun = await runWalkin();
  const afterRows = await prisma.customer.findMany({
    where: { OR: [{ systemKey: 'WALK_IN' }, { isSystem: true }] },
    select: { id: true, name: true, systemKey: true, isSystem: true, isActive: true, customerNo: true },
  });
  const walkInRow = afterRows[0];
  record(
    'walk-in exists exactly once',
    beforeRows.length === 1 &&
      afterRows.length === 1 &&
      walkInRow?.systemKey === 'WALK_IN' &&
      walkInRow.isSystem === true &&
      walkInRow.name === 'Walk-in customer' &&
      walkInRow.isActive === true,
    `before ${beforeRows.length} after ${afterRows.length}`,
  );
  record(
    'db:create-walkin run twice creates no duplicate',
    firstRun.code === 0 &&
      secondRun.code === 0 &&
      afterRows.length === 1 &&
      /already exists/i.test(secondRun.output),
    secondRun.output.trim().split('\n').filter((line) => line.trim()).slice(-2).join(' | '),
  );

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

  const noTokenList = await call('GET', '/api/customers');
  const noTokenWalk = await call('GET', '/api/customers/walk-in');
  const noTokenPost = await call('POST', '/api/customers', undefined, {});
  record('no token on the list is 401', noTokenList.status === 401, `status ${noTokenList.status}`);
  record('no token on walk-in is 401', noTokenWalk.status === 401, `status ${noTokenWalk.status}`);
  record('no token on create is 401', noTokenPost.status === 401, `status ${noTokenPost.status}`);

  const walkIn = await call('GET', '/api/customers/walk-in', admin);
  record(
    'GET /walk-in returns the system customer',
    walkIn.status === 200 &&
      walkIn.json?.id === walkInRow?.id &&
      walkIn.json?.isSystem === true &&
      walkIn.json?.name === 'Walk-in customer',
    `status ${walkIn.status} ${walkIn.json?.error || walkIn.json?.message || ''}`,
  );

  const phoneName = `${PREFIX}Amina ${stamp}`;
  const created = await call('POST', '/api/customers', admin, {
    name: phoneName,
    phone: PHONE_TYPED,
    email: `${PREFIX}amina_${stamp}@example.com`,
    notes: 'Buys on Saturdays',
  });
  record(
    'admin can create a customer',
    created.status === 201 &&
      created.json?.name === phoneName &&
      created.json?.phone === PHONE_TYPED &&
      created.json?.phoneKey === PHONE_KEY &&
      created.json?.isSystem === false &&
      created.json?.isActive === true,
    `status ${created.status} phoneKey ${created.json?.phoneKey || ''} ${created.json?.error || ''}`,
  );
  const customerId = created.json?.id as string;
  const createdNo = Number(created.json?.customerNo);

  const intl = await call('POST', '/api/customers', admin, {
    name: `${PREFIX}Intl ${stamp}`,
    phone: PHONE_INTL,
  });
  record(
    'the same phone in international form is 409 and names the existing customer',
    intl.status === 409 && typeof intl.json?.error === 'string' && intl.json.error.includes(phoneName),
    `status ${intl.status} ${intl.json?.error || ''}`,
  );
  const shortForm = await call('POST', '/api/customers', admin, {
    name: `${PREFIX}Short phone ${stamp}`,
    phone: PHONE_SHORT,
  });
  record(
    'a 9-digit number starting with 7 is the same phoneKey and is 409',
    shortForm.status === 409 && typeof shortForm.json?.error === 'string' && shortForm.json.error.includes(phoneName),
    `status ${shortForm.status} ${shortForm.json?.error || ''}`,
  );

  const managerName = `${PREFIX}Manager farm ${stamp}`;
  const managerCreated = await call('POST', '/api/customers', manager, {
    name: managerName,
    phone: '0722000111',
    notes: 'Manager note',
  });
  record(
    'manager can create a customer',
    managerCreated.status === 201 && managerCreated.json?.phoneKey === '254722000111',
    `status ${managerCreated.status} ${managerCreated.json?.error || ''}`,
  );

  const cashierName = `${PREFIX}Cashier kiosk ${stamp}`;
  const cashierCreated = await call('POST', '/api/customers', cashier, {
    name: cashierName,
    phone: '0733000222',
  });
  record(
    'cashier can create a customer',
    cashierCreated.status === 201 && cashierCreated.json?.name === cashierName,
    `status ${cashierCreated.status} ${cashierCreated.json?.error || ''}`,
  );

  const readOne = await call('GET', `/api/customers/${customerId}`, admin);
  record('admin can read one customer', readOne.status === 200 && readOne.json?.id === customerId, `status ${readOne.status}`);

  const editedPhone = '0744111222';
  const edited = await call('PUT', `/api/customers/${customerId}`, admin, { phone: editedPhone, notes: 'Updated note' });
  record(
    'admin can edit a customer',
    edited.status === 200 &&
      edited.json?.phone === editedPhone &&
      edited.json?.phoneKey === '254744111222' &&
      edited.json?.name === phoneName &&
      edited.json?.notes === 'Updated note',
    `status ${edited.status} phone ${edited.json?.phone} ${edited.json?.error || ''}`,
  );

  const managerEdit = await call('PUT', `/api/customers/${managerCreated.json?.id}`, manager, { email: `${PREFIX}manager_${stamp}@example.com` });
  record(
    'manager can edit a customer',
    managerEdit.status === 200 && managerEdit.json?.email === `${PREFIX}manager_${stamp}@example.com`,
    `status ${managerEdit.status} ${managerEdit.json?.error || ''}`,
  );

  const cashierEdit = await call('PUT', `/api/customers/${cashierCreated.json?.id}`, cashier, { notes: 'Cashier note' });
  record(
    'cashier can edit a customer',
    cashierEdit.status === 200 && cashierEdit.json?.notes === 'Cashier note',
    `status ${cashierEdit.status} ${cashierEdit.json?.error || ''}`,
  );

  const lockedEdit = await call('PUT', `/api/customers/${walkIn.json?.id}`, admin, { phone: '0711000000', name: 'Renamed walk-in' });
  const lockedCredit = await call('PUT', `/api/customers/${walkIn.json?.id}`, admin, { creditLimit: 10 });
  const lockedStatus = await call('PATCH', `/api/customers/${walkIn.json?.id}/status`, admin, { isActive: false });
  record(
    'editing the system customer is 403 SYSTEM_CUSTOMER_LOCKED',
    lockedEdit.status === 403 && lockedEdit.json?.code === 'SYSTEM_CUSTOMER_LOCKED',
    `status ${lockedEdit.status} ${lockedEdit.json?.code || ''} ${lockedEdit.json?.error || ''}`,
  );
  record(
    'changing credit on the system customer is 403 SYSTEM_CUSTOMER_LOCKED',
    lockedCredit.status === 403 && lockedCredit.json?.code === 'SYSTEM_CUSTOMER_LOCKED',
    `status ${lockedCredit.status} ${lockedCredit.json?.code || ''}`,
  );
  record(
    'deactivating the system customer is 403 SYSTEM_CUSTOMER_LOCKED',
    lockedStatus.status === 403 && lockedStatus.json?.code === 'SYSTEM_CUSTOMER_LOCKED',
    `status ${lockedStatus.status} ${lockedStatus.json?.code || ''}`,
  );
  const walkInStill = await prisma.customer.findUnique({ where: { systemKey: 'WALK_IN' } });
  record(
    'the system customer is unchanged after locked edits',
    walkInStill?.name === 'Walk-in customer' && walkInStill.isActive === true && walkInStill.phone == null,
    `name ${walkInStill?.name} active ${walkInStill?.isActive} phone ${walkInStill?.phone}`,
  );

  const credit = await call('POST', '/api/customers', admin, {
    name: `${PREFIX}Credit ${stamp}`,
    phone: '0755000333',
    creditLimit: 500,
  });
  record(
    'sending creditLimit is 400',
    credit.status === 400 && credit.json?.error === 'Credit is enabled in a later step',
    `status ${credit.status} ${credit.json?.error || ''}`,
  );

  const badEmail = await call('POST', '/api/customers', admin, { name: `${PREFIX}Bad email ${stamp}`, email: 'not-an-email' });
  const shortName = await call('POST', '/api/customers', admin, { name: 'A', phone: '0766000444' });
  const badPhone = await call('POST', '/api/customers', admin, { name: `${PREFIX}Bad phone ${stamp}`, phone: '12-call' });
  record('invalid email is 400', badEmail.status === 400 && badEmail.json?.field === 'email', `status ${badEmail.status} ${badEmail.json?.error || ''}`);
  record('short name is 400', shortName.status === 400 && shortName.json?.field === 'name', `status ${shortName.status} ${shortName.json?.error || ''}`);
  record('bad phone is 400', badPhone.status === 400 && badPhone.json?.field === 'phone', `status ${badPhone.status} ${badPhone.json?.error || ''}`);

  const byName = await call('GET', `/api/customers?search=${encodeURIComponent(phoneName)}&status=all`, admin);
  const byPhone = await call('GET', `/api/customers?search=${encodeURIComponent(editedPhone)}&status=all`, admin);
  const code = customerCode(createdNo);
  const byNo = await call('GET', `/api/customers?search=${encodeURIComponent(code)}&status=all`, admin);
  const nameHit = byName.json?.customers?.some((row: { id: string }) => row.id === customerId);
  const phoneHit = byPhone.json?.customers?.some((row: { id: string }) => row.id === customerId);
  const noHit = byNo.json?.customers?.some((row: { id: string }) => row.id === customerId);
  record('search by name finds the customer', byName.status === 200 && nameHit === true, `status ${byName.status} total ${byName.json?.total}`);
  record('search by phone finds the customer', byPhone.status === 200 && phoneHit === true, `status ${byPhone.status} total ${byPhone.json?.total}`);
  record('search by customer no finds the customer', byNo.status === 200 && noHit === true && byNo.json?.total === 1, `status ${byNo.status} total ${byNo.json?.total}`);

  const listed = await call('GET', '/api/customers?status=all&page=1&pageSize=25', admin);
  const pageOne = await call('GET', '/api/customers?status=all&page=1&pageSize=1', admin);
  const pageTwo = await call('GET', '/api/customers?status=all&page=2&pageSize=1', admin);
  record(
    'walk-in is listed first',
    listed.status === 200 &&
      listed.json?.customers?.[0]?.id === walkInRow?.id &&
      listed.json?.customers?.[0]?.isSystem === true &&
      pageOne.json?.customers?.[0]?.isSystem === true &&
      pageOne.json?.customers?.length === 1 &&
      pageTwo.status === 200 &&
      pageTwo.json?.customers?.[0]?.isSystem !== true,
    `first ${listed.json?.customers?.[0]?.name || ''} page2 ${pageTwo.json?.customers?.[0]?.name || ''}`,
  );

  const accountantList = await call('GET', `/api/customers?search=${encodeURIComponent(stamp)}&status=all`, accountant);
  const accountantWalk = await call('GET', '/api/customers/walk-in', accountant);
  const accountantRead = await call('GET', `/api/customers/${customerId}`, accountant);
  const accountantPost = await call('POST', '/api/customers', accountant, { name: `${PREFIX}Accountant blocked ${stamp}` });
  const accountantPut = await call('PUT', `/api/customers/${customerId}`, accountant, { notes: 'no' });
  const accountantPatch = await call('PATCH', `/api/customers/${customerId}/status`, accountant, { isActive: false });
  record(
    'accountant can list customers',
    accountantList.status === 200 && Array.isArray(accountantList.json?.customers),
    `status ${accountantList.status}`,
  );
  record('accountant can read walk-in', accountantWalk.status === 200 && accountantWalk.json?.isSystem === true, `status ${accountantWalk.status}`);
  record('accountant can read one customer', accountantRead.status === 200 && accountantRead.json?.id === customerId, `status ${accountantRead.status}`);
  record('accountant create is 403', accountantPost.status === 403, `status ${accountantPost.status}`);
  record('accountant edit is 403', accountantPut.status === 403, `status ${accountantPut.status}`);
  record('accountant status change is 403', accountantPatch.status === 403, `status ${accountantPatch.status}`);

  const stockList = await call('GET', '/api/customers', stock);
  const stockWalk = await call('GET', '/api/customers/walk-in', stock);
  const stockRead = await call('GET', `/api/customers/${customerId}`, stock);
  const stockPost = await call('POST', '/api/customers', stock, { name: `${PREFIX}Stock blocked ${stamp}` });
  const stockPut = await call('PUT', `/api/customers/${customerId}`, stock, { notes: 'no' });
  const stockPatch = await call('PATCH', `/api/customers/${customerId}/status`, stock, { isActive: false });
  record('stock keeper list is 403', stockList.status === 403, `status ${stockList.status}`);
  record('stock keeper walk-in is 403', stockWalk.status === 403, `status ${stockWalk.status}`);
  record('stock keeper read is 403', stockRead.status === 403, `status ${stockRead.status}`);
  record('stock keeper create is 403', stockPost.status === 403, `status ${stockPost.status}`);
  record('stock keeper edit is 403', stockPut.status === 403, `status ${stockPut.status}`);
  record('stock keeper status change is 403', stockPatch.status === 403, `status ${stockPatch.status}`);

  const deactivated = await call('PATCH', `/api/customers/${customerId}/status`, admin, { isActive: false });
  record(
    'admin can deactivate a customer',
    deactivated.status === 200 && deactivated.json?.isActive === false,
    `status ${deactivated.status} active ${deactivated.json?.isActive}`,
  );

  const removed = await call('DELETE', `/api/customers/${customerId}`, admin);
  record('there is no delete endpoint', removed.status === 404, `status ${removed.status}`);

  const events = await prisma.auditEvent.findMany({
    where: { userId: { in: userIds }, eventType: 'customer' },
    select: { description: true },
  });
  const descriptions = events.map((event) => event.description || '');
  record(
    'creating a customer writes an audit event',
    descriptions.some((line) => line === `Created customer "${phoneName}"`),
    descriptions.filter((line) => line.startsWith('Created')).slice(0, 2).join(' | '),
  );
  record(
    'editing a phone writes an audit event',
    descriptions.some((line) => line.includes(`Changed phone of "${phoneName}"`) && line.includes(PHONE_TYPED) && line.includes(editedPhone)),
    descriptions.filter((line) => line.includes('Changed phone')).slice(0, 1).join(' | '),
  );
  record(
    'deactivating a customer writes an audit event',
    descriptions.some((line) => line === `Deactivated customer "${phoneName}"`),
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
    await prisma.customer.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.auditEvent.deleteMany({ where: { userName: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({
      where: { OR: [{ name: { startsWith: PREFIX } }, { email: { startsWith: PREFIX } }] },
    });
    await prisma.$disconnect();
  });
