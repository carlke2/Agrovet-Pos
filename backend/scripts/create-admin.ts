import '../loadEnv';
import readline from 'readline';
import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const name = (process.env.ADMIN_NAME || '').trim() || (await ask(rl, 'Admin name: '));
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase() || (await ask(rl, 'Admin email: ')).toLowerCase();
    const password = process.env.ADMIN_PASSWORD || (await ask(rl, 'Admin password: '));

    if (!name || !email || !password) {
      throw new Error('Admin name, email, and password are required. Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD, or enter them when prompted.');
    }

    const adminRole = await prisma.role.findUnique({ where: { name: 'Admin' }, select: { id: true } });
    if (!adminRole) {
      throw new Error('The Admin role does not exist yet. Run npm run db:sync-roles first.');
    }

    const existingAdmin = await prisma.user.findFirst({
      where: { roleId: adminRole.id, status: 'active' },
      select: { email: true },
    });
    if (existingAdmin) {
      throw new Error(`An active Admin already exists (${existingAdmin.email}). Refusing to create another.`);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.user.create({
      data: {
        name,
        email,
        password: passwordHash,
        roleId: adminRole.id,
        status: 'active',
      },
      select: { id: true, email: true },
    });
    console.log(`Admin created in Supabase: ${admin.email}`);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
