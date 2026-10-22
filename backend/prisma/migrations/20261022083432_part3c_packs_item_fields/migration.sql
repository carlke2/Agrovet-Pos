-- AlterTable
ALTER TABLE "items" ADD COLUMN     "activeIngredient" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "isRegulated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "strength" TEXT;

-- CreateTable
CREATE TABLE "item_packs" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "quantityInBase" DECIMAL(12,3) NOT NULL,
    "barcode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_packs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "item_packs_barcode_key" ON "item_packs"("barcode");

-- CreateIndex
CREATE INDEX "item_packs_itemId_idx" ON "item_packs"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "item_packs_itemId_nameKey_key" ON "item_packs"("itemId", "nameKey");

-- AddForeignKey
ALTER TABLE "item_packs" ADD CONSTRAINT "item_packs_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
