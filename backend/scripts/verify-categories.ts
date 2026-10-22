import '../loadEnv';
import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';
import { signToken } from '@/middlewares/auth';

const PREFIX = '__test_';
const API = process.env.VERIFY_API_URL || 'http://127.0.0.1:5000';
const stamp = Date.now().toString(36);
const ROLES = ['Admin', 'Manager', 'Stock keeper', 'Cashier', 'Accountant'] as const;
const WRITERS = ['Admin', 'Manager', 'Stock keeper'] as const;

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
    description: 'Temporary catalog check',
    defaultMarkupPercent: 25,
    tracksExpiryByDefault: false,
    icon: 'leaf',
    sortOrder: 0,
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

  const noToken = await call('GET', '/api/categories');
  record('no token is 401', noToken.status === 401, `status ${noToken.status}`);

  const createdIds: string[] = [];
  for (const roleName of WRITERS) {
    const token = tokens.get(roleName)!;
    const name = `${PREFIX}${roleName} crop ${stamp}`;
    const created = await call('POST', '/api/categories', token, categoryBody(name));
    record(`${roleName} create`, created.status === 201 && created.json?.name === name, `status ${created.status}`);
    const id = created.json?.id as string | undefined;
    if (!id) continue;
    createdIds.push(id);

    const list = await call('GET', '/api/categories?search=' + encodeURIComponent(name), token);
    const listed = Array.isArray(list.json) && list.json.some((row) => row.id === id);
    record(`${roleName} list`, list.status === 200 && listed, `status ${list.status}`);

    const read = await call('GET', `/api/categories/${id}`, token);
    record(`${roleName} read`, read.status === 200 && read.json?.id === id, `status ${read.status}`);

    const updated = await call('PUT', `/api/categories/${id}`, token, categoryBody(name, { defaultMarkupPercent: 30 }));
    record(
      `${roleName} update`,
      updated.status === 200 && updated.json?.defaultMarkupPercent === 30,
      `status ${updated.status}`,
    );

    const deactivated = await call('PATCH', `/api/categories/${id}/status`, token, { isActive: false });
    record(`${roleName} deactivate`, deactivated.status === 200 && deactivated.json?.isActive === false, `status ${deactivated.status}`);

    const reactivated = await call('PATCH', `/api/categories/${id}/status`, token, { isActive: true });
    record(`${roleName} reactivate`, reactivated.status === 200 && reactivated.json?.isActive === true, `status ${reactivated.status}`);
  }

  const sampleId = createdIds[0];
  for (const roleName of ['Cashier', 'Accountant'] as const) {
    const token = tokens.get(roleName)!;
    const list = await call('GET', '/api/categories', token);
    const read = sampleId ? await call('GET', `/api/categories/${sampleId}`, token) : { status: 0, json: null };
    record(`${roleName} list`, list.status === 200 && Array.isArray(list.json), `status ${list.status}`);
    record(`${roleName} read`, read.status === 200, `status ${read.status}`);
    const posted = await call('POST', '/api/categories', token, categoryBody(`${PREFIX}${roleName} denied ${stamp}`));
    const put = await call('PUT', `/api/categories/${sampleId || 'missing'}`, token, categoryBody(`${PREFIX}${roleName} denied ${stamp}`));
    const patched = await call('PATCH', `/api/categories/${sampleId || 'missing'}/status`, token, { isActive: false });
    record(`${roleName} cannot create`, posted.status === 403, `status ${posted.status}`);
    record(`${roleName} cannot update`, put.status === 403, `status ${put.status}`);
    record(`${roleName} cannot change status`, patched.status === 403, `status ${patched.status}`);
  }

  const admin = tokens.get('Admin')!;
  const duplicateName = `${PREFIX}Duplicate feed ${stamp}`;
  const first = await call('POST', '/api/categories', admin, categoryBody(duplicateName));
  const second = await call('POST', '/api/categories', admin, categoryBody(duplicateName.toUpperCase()));
  record('duplicate name is 409', first.status === 201 && second.status === 409, `statuses ${first.status}/${second.status}`);
  record(
    'duplicate message names the category',
    typeof second.json?.error === 'string' && second.json.error.includes(duplicateName),
    second.json?.error || '',
  );

  const badMarkup = [
    ['negative markup', -1],
    ['markup above 1000', 1001],
    ['markup with 3 decimals', 1.234],
  ] as const;
  for (const [label, value] of badMarkup) {
    const response = await call('POST', '/api/categories', admin, categoryBody(`${PREFIX}${label} ${stamp}`, { defaultMarkupPercent: value }));
    record(`${label} is 400`, response.status === 400, `status ${response.status} ${response.json?.error || ''}`);
  }

  const badIcon = await call('POST', '/api/categories', admin, categoryBody(`${PREFIX}bad icon ${stamp}`, { icon: 'not-a-real-icon' }));
  record('bad icon is 400', badIcon.status === 400, `status ${badIcon.status}`);
  const shortName = await call('POST', '/api/categories', admin, categoryBody('A'));
  record('short name is 400', shortName.status === 400, `status ${shortName.status}`);

  const parent = await call('POST', '/api/categories', admin, categoryBody(`${PREFIX}Parent ${stamp}`, { icon: 'wheat' }));
  const child = await call(
    'POST',
    '/api/categories',
    admin,
    categoryBody(`${PREFIX}Child ${stamp}`, { parentId: parent.json?.id, icon: 'sprout' }),
  );
  const grandchild = await call(
    'POST',
    '/api/categories',
    admin,
    categoryBody(`${PREFIX}Grandchild ${stamp}`, { parentId: child.json?.id }),
  );
  record('sub-category of a sub-category is refused', grandchild.status === 400, `status ${grandchild.status} ${grandchild.json?.error || ''}`);

  const blocked = await call('PATCH', `/api/categories/${parent.json?.id}/status`, admin, { isActive: false });
  record(
    'deactivate parent with active child is refused',
    blocked.status === 400,
    `status ${blocked.status} ${blocked.json?.error || ''}`,
  );

  const holding = await call('POST', '/api/categories', admin, categoryBody(`${PREFIX}Holding ${stamp}`, { icon: 'package' }));
  const holdingId = holding.json?.id as string | undefined;
  if (holdingId) {
    const unit = await prisma.unit.create({
      data: {
        name: `${PREFIX}Measure ${stamp}`,
        abbreviation: 'tu',
        nameKey: `${PREFIX}measure ${stamp}`.toLowerCase(),
      },
    });
    await prisma.item.create({
      data: {
        name: `${PREFIX}Blocking item ${stamp}`,
        nameKey: `${PREFIX}blocking item ${stamp}`.toLowerCase(),
        categoryId: holdingId,
        unitId: unit.id,
      },
    });
  }
  const blockedByItem = holdingId
    ? await call('PATCH', `/api/categories/${holdingId}/status`, admin, { isActive: false })
    : { status: 0, json: null };
  record(
    'deactivate category with active item is refused',
    blockedByItem.status === 400 &&
      typeof blockedByItem.json?.error === 'string' &&
      blockedByItem.json.error.toLowerCase().includes('item'),
    `status ${blockedByItem.status} ${blockedByItem.json?.error || ''}`,
  );

  const events = await prisma.auditEvent.findMany({
    where: { userId: { in: userIds }, eventType: 'category' },
    select: { description: true, action: true },
  });
  const descriptions = events.map((event) => event.description || '');
  record('audit events were written', events.length > 0, `${events.length} events`);
  record(
    'audit describes create, markup and status',
    descriptions.some((line) => line.startsWith('Created category ')) &&
      descriptions.some((line) => line.includes('Changed default markup of ')) &&
      descriptions.some((line) => line.startsWith('Deactivated category ')) &&
      descriptions.some((line) => line.startsWith('Activated category ')),
    descriptions.slice(0, 4).join(' | '),
  );

  const failed = checks.filter((item) => !item.pass);
  console.log('\nScreen action check | Result | Detail');
  console.log('---|---|---');
  for (const item of checks) {
    console.log(`${item.name} | ${item.pass ? 'PASS' : 'FAIL'} | ${item.detail}`);
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.item.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { name: { startsWith: PREFIX }, parentId: { not: null } } });
    await prisma.category.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.unit.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.auditEvent.deleteMany({ where: { userName: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({
      where: { OR: [{ name: { startsWith: PREFIX } }, { email: { startsWith: PREFIX } }] },
    });
    await prisma.$disconnect();
  });
