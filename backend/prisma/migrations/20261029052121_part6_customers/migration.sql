-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "customerNo" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "phoneKey" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "creditLimit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "systemKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_customerNo_key" ON "customers"("customerNo");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phoneKey_key" ON "customers"("phoneKey");

-- CreateIndex
CREATE UNIQUE INDEX "customers_systemKey_key" ON "customers"("systemKey");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");
