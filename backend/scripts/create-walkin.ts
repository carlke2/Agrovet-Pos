import '../loadEnv';
import prisma from '@/services/prisma';

const WALK_IN_NAME = 'Walk-in customer';
const WALK_IN_KEY = 'WALK_IN';

function customerCode(customerNo: number): string {
  return `CUS-${String(customerNo).padStart(5, '0')}`;
}

async function main() {
  const existing = await prisma.customer.findUnique({ where: { systemKey: WALK_IN_KEY } });
  if (existing) {
    console.log(`Walk-in customer already exists (${customerCode(existing.customerNo)}).`);
    return;
  }

  try {
    const created = await prisma.customer.create({
      data: {
        name: WALK_IN_NAME,
        systemKey: WALK_IN_KEY,
        isSystem: true,
        creditLimit: 0,
        isActive: true,
      },
    });
    console.log(`Created Walk-in customer (${customerCode(created.customerNo)}).`);
  } catch (error) {
    const again = await prisma.customer.findUnique({ where: { systemKey: WALK_IN_KEY } });
    if (again) {
      console.log(`Walk-in customer already exists (${customerCode(again.customerNo)}).`);
      return;
    }
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
