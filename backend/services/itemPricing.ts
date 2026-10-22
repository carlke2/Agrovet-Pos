import { Prisma } from '@prisma/client';
import { PRICE_ROUNDING_STEP } from '@/config/pricing';

export type MarkupSource = 'item' | 'category' | 'parent category' | 'none';

export type ResolvedPrice = {
  resolvedMarkupPercent: Prisma.Decimal | null;
  markupSource: MarkupSource;
  suggestedSellingPrice: Prisma.Decimal | null;
};

/**
 * Markup comes from the item, then its category, then that category's parent.
 * Suggested price is cost × (1 + markup / 100), rounded to PRICE_ROUNDING_STEP.
 */
export function resolveItemPrice(input: {
  costPrice: Prisma.Decimal | null;
  itemMarkup: Prisma.Decimal | null;
  categoryMarkup: Prisma.Decimal | null;
  parentMarkup: Prisma.Decimal | null;
}): ResolvedPrice {
  let resolvedMarkupPercent: Prisma.Decimal | null = null;
  let markupSource: MarkupSource = 'none';

  if (input.itemMarkup != null) {
    resolvedMarkupPercent = input.itemMarkup;
    markupSource = 'item';
  } else if (input.categoryMarkup != null) {
    resolvedMarkupPercent = input.categoryMarkup;
    markupSource = 'category';
  } else if (input.parentMarkup != null) {
    resolvedMarkupPercent = input.parentMarkup;
    markupSource = 'parent category';
  }

  return {
    resolvedMarkupPercent,
    markupSource,
    suggestedSellingPrice: suggestSellingPrice(input.costPrice, resolvedMarkupPercent),
  };
}

export function suggestSellingPrice(
  costPrice: Prisma.Decimal | null,
  markupPercent: Prisma.Decimal | null,
): Prisma.Decimal | null {
  if (costPrice == null || markupPercent == null) return null;
  const hundred = new Prisma.Decimal(100);
  const multiplier = new Prisma.Decimal(1).plus(markupPercent.div(hundred));
  return roundToStep(costPrice.mul(multiplier), PRICE_ROUNDING_STEP);
}

function roundToStep(amount: Prisma.Decimal, step: number): Prisma.Decimal {
  const stepDecimal = new Prisma.Decimal(step);
  return amount.div(stepDecimal).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).mul(stepDecimal);
}
