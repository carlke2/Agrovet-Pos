import { Prisma } from '@prisma/client';

type OrderLine = { menuItemId: string; quantity: number; price?: number };

type DeductOptions = {
  userId: string;
  receiptNo: string;
};

function aggregateQuantities(lines: OrderLine[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.menuItemId, (totals.get(line.menuItemId) || 0) + line.quantity);
  }
  return totals;
}

/** A counter sale deducts the sold item's own stock immediately. */
export async function deductStockForOrder(
  tx: Prisma.TransactionClient,
  orderLines: OrderLine[],
  _opts: DeductOptions,
): Promise<void> {
  if (orderLines.length === 0) return;

  const menuQtyById = aggregateQuantities(orderLines);
  const menuItemIds = [...menuQtyById.keys()];

  const menuItems = await tx.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    select: { id: true, name: true, stockLevel: true },
  });
  const menuById = new Map(menuItems.map((m) => [m.id, m]));

  const unavailableMenuIds: string[] = [];
  for (const [menuItemId, qty] of menuQtyById) {
    const menuItem = menuById.get(menuItemId);
    if (!menuItem || menuItem.stockLevel === null) continue;
    if (menuItem.stockLevel < qty) {
      throw new Error(`INSUFFICIENT_STOCK:${menuItem.name}`);
    }
    if (menuItem.stockLevel - qty <= 0) {
      unavailableMenuIds.push(menuItemId);
    }
  }

  await Promise.all(
    [...menuQtyById.entries()]
      .filter(([menuItemId]) => menuById.get(menuItemId)?.stockLevel !== null && menuById.get(menuItemId)?.stockLevel !== undefined)
      .map(([menuItemId, qty]) =>
        tx.menuItem.update({
          where: { id: menuItemId },
          data: { stockLevel: { decrement: qty } },
        }),
      ),
  );

  if (unavailableMenuIds.length > 0) {
    await tx.menuItem.updateMany({
      where: { id: { in: unavailableMenuIds } },
      data: { isAvailable: false },
    });
  }
}
