import { Prisma } from '@prisma/client';

export type PackSize = {
  quantityInBase: Prisma.Decimal;
};

function asDecimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(value);
}

function assertQuantity(value: Prisma.Decimal, label: string): void {
  if (!value.isFinite() || value.lte(0)) {
    throw new Error(`${label} must be greater than 0.`);
  }
  if (value.decimalPlaces() > 3) {
    throw new Error(`${label} must have at most 3 decimal places.`);
  }
}

/** Base units represented by a number of packs. quantity and pack size must be greater than 0, with at most 3 decimal places. */
export function toBaseQuantity(quantity: Prisma.Decimal | string | number, pack: PackSize): Prisma.Decimal {
  const amount = asDecimal(quantity);
  const size = asDecimal(pack.quantityInBase);
  assertQuantity(amount, 'Quantity');
  assertQuantity(size, 'Pack size');
  return amount.mul(size);
}

/** How many whole packs fit in a base quantity, and the leftover base units. */
export function fromBaseQuantity(
  baseQuantity: Prisma.Decimal | string | number,
  pack: PackSize,
): { packs: Prisma.Decimal; remainderBase: Prisma.Decimal } {
  const base = asDecimal(baseQuantity);
  const size = asDecimal(pack.quantityInBase);
  if (!base.isFinite() || base.lt(0)) {
    throw new Error('Base quantity cannot be negative.');
  }
  if (base.decimalPlaces() > 3) {
    throw new Error('Base quantity must have at most 3 decimal places.');
  }
  assertQuantity(size, 'Pack size');
  const packs = base.div(size).toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN);
  const remainderBase = base.minus(packs.mul(size));
  return { packs, remainderBase };
}
