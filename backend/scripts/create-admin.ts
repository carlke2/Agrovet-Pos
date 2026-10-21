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
    const name = (process.env.ADMIN_NAME || '').trim() || (await ask(rl, 'Owner name: '));
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase() || (await ask(rl, 'Owner email: ')).toLowerCase();
    const password = process.env.ADMIN_PASSWORD || (await ask(rl, 'Owner password: '));

    if (!name || !email || !password) {
      throw new Error('Owner name, email, and password are required. Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD, or enter them when prompted.');
    }

    const existingOwner = await prisma.user.findFirst({ where: { role: 'owner' }, select: { email: true } });
    if (existingOwner) {
      throw new Error(`An owner already exists (${existingOwner.email}). Refusing to create another.`);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const owner = await prisma.user.create({
      data: {
        name,
        email,
        password: passwordHash,
        role: 'owner',
        status: 'active',
      },
      select: { id: true, email: true },
    });
    console.log(`Owner created in Supabase: ${owner.email}`);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
