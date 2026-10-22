-- CreateEnum
CREATE TYPE "ReceiptType" AS ENUM ('DELIVERY', 'OPENING');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('RECEIPT', 'OPENING', 'SALE', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN', 'DAMAGED', 'EXPIRED', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "receiptNo" SERIAL NOT NULL,
    "type" "ReceiptType" NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "vendorId" TEXT,
    "supplierInvoiceNo" TEXT,
    "receivedDate" DATE NOT NULL,
    "notes" TEXT,
    "totalCost" DECIMAL(14,2),
    "createdById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "packId" TEXT,
    "quantityEntered" DECIMAL(12,3) NOT NULL,
    "quantityInBase" DECIMAL(12,3) NOT NULL,
    "costEntered" DECIMAL(12,2) NOT NULL,
    "unitCostBase" DECIMAL(14,4) NOT NULL,
    "batchNo" TEXT,
    "manufactureDate" DATE,
    "expiryDate" DATE,
    "lineNo" INTEGER NOT NULL,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_batches" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "vendorId" TEXT,
    "receiptLineId" TEXT NOT NULL,
    "batchNo" TEXT,
    "manufactureDate" DATE,
    "expiryDate" DATE,
    "receivedDate" DATE NOT NULL,
    "quantityReceived" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_ledger_entries" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchId" TEXT,
    "entryType" "LedgerEntryType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(14,4),
    "refType" TEXT,
    "refId" TEXT,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_receiptNo_key" ON "goods_receipts"("receiptNo");

-- CreateIndex
CREATE INDEX "goods_receipts_status_idx" ON "goods_receipts"("status");

-- CreateIndex
CREATE INDEX "goods_receipts_vendorId_idx" ON "goods_receipts"("vendorId");

-- CreateIndex
CREATE INDEX "goods_receipts_receivedDate_idx" ON "goods_receipts"("receivedDate");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_receiptId_idx" ON "goods_receipt_lines"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batches_receiptLineId_key" ON "stock_batches"("receiptLineId");

-- CreateIndex
CREATE INDEX "stock_batches_itemId_expiryDate_idx" ON "stock_batches"("itemId", "expiryDate");

-- CreateIndex
CREATE INDEX "stock_batches_itemId_batchNo_idx" ON "stock_batches"("itemId", "batchNo");

-- CreateIndex
CREATE INDEX "item_ledger_entries_itemId_idx" ON "item_ledger_entries"("itemId");

-- CreateIndex
CREATE INDEX "item_ledger_entries_batchId_idx" ON "item_ledger_entries"("batchId");

-- CreateIndex
CREATE INDEX "item_ledger_entries_refType_refId_idx" ON "item_ledger_entries"("refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "item_ledger_entries_refType_refId_batchId_entryType_key" ON "item_ledger_entries"("refType", "refId", "batchId", "entryType");

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_packId_fkey" FOREIGN KEY ("packId") REFERENCES "item_packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "goods_receipt_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_ledger_entries" ADD CONSTRAINT "item_ledger_entries_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_ledger_entries" ADD CONSTRAINT "item_ledger_entries_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
