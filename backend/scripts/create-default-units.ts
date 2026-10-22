import '../loadEnv';
import prisma from '@/services/prisma';

const DEFAULT_UNITS: readonly (readonly [string, string])[] = [
  ['Kilogram', 'kg'],
  ['Gram', 'g'],
  ['Litre', 'l'],
  ['Millilitre', 'ml'],
  ['Piece', 'pc'],
  ['Packet', 'pkt'],
  ['Bag', 'bag'],
  ['Bottle', 'btl'],
  ['Sachet', 'sch'],
];

function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function main() {
  for (const [name, abbreviation] of DEFAULT_UNITS) {
    const key = nameKey(name);
    const byName = await prisma.unit.findUnique({ where: { nameKey: key } });
    if (byName) {
      console.log(`Already present: ${byName.name} (${byName.abbreviation})`);
      continue;
    }
    const byAbbreviation = await prisma.unit.findFirst({
      where: { abbreviation: { equals: abbreviation, mode: 'insensitive' } },
    });
    if (byAbbreviation) {
      console.log(`Already present: ${byAbbreviation.name} (${byAbbreviation.abbreviation})`);
      continue;
    }
    const created = await prisma.unit.create({
      data: { name, abbreviation, nameKey: key, isActive: true },
    });
    console.log(`Created: ${created.name} (${created.abbreviation})`);
  }
  console.log('Default units are ready.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
