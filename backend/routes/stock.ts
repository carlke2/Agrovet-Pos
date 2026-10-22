import { Prisma } from '@prisma/client';
import { Router, Request, Response } from 'express';
import prisma from '@/services/prisma';
import { hasPermission, requirePermission } from '@/middlewares/auth';

const router = Router();

function queryText(value: unknown): string {
  if (Array.isArray(value)) return queryText(value[0]);
  return typeof value === 'string' ? value.trim() : '';
}

function fixed(value: Prisma.Decimal | null | undefined, places: number): string | null {
  if (value == null) return null;
  return value.toFixed(places);
}

function dateIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

router.get('/batches', requirePermission('view_stock'), async (req: Request, res: Response): Promise<void> => {
  const itemId = queryText(req.query.itemId);
  const includeEmpty = queryText(req.query.includeEmpty) || 'false';
  if (includeEmpty !== 'true' && includeEmpty !== 'false') {
    res.status(400).json({ error: 'includeEmpty must be true or false.', field: 'includeEmpty' });
    return;
  }
  const where: Prisma.StockBatchWhereInput = {};
  if (itemId) where.itemId = itemId;
  const rows = await prisma.stockBatch.findMany({
    where,
    include: {
      item: { select: { id: true, name: true, unit: { select: { abbreviation: true } } } },
      ledgerEntries: { select: { quantity: true } },
    },
    orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
  });
  const withCost = hasPermission(req.user, 'view_cost');
  const batches = rows.flatMap((row) => {
    const remaining = row.ledgerEntries.reduce((sum, entry) => sum.plus(entry.quantity), new Prisma.Decimal(0));
    if (includeEmpty !== 'true' && remaining.equals(0)) return [];
    return [{
      id: row.id,
      itemId: row.itemId,
      itemName: row.item.name,
      baseUnit: row.item.unit.abbreviation,
      batchNo: row.batchNo,
      expiryDate: dateIso(row.expiryDate),
      manufactureDate: dateIso(row.manufactureDate),
      receivedDate: dateIso(row.receivedDate),
      quantityReceived: fixed(row.quantityReceived, 3),
      remaining: fixed(remaining, 3),
      ...(withCost ? { unitCost: fixed(row.unitCost, 4) } : {}),
    }];
  });
  res.json({ batches });
});

export default router;
