-- CreateEnum
CREATE TYPE "CatalogItemStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "CatalogItemType" AS ENUM ('MEDICATION', 'VACCINE', 'DIAGNOSTIC', 'SERVICE', 'SUPPLY', 'RETAIL', 'FOOD', 'OTHER');

-- CreateEnum
CREATE TYPE "InventoryLotStatus" AS ENUM ('AVAILABLE', 'QUARANTINED', 'EXPIRED', 'RECALLED', 'DEPLETED');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('OPENING_BALANCE', 'MANUAL_ADJUSTMENT', 'INVENTORY_COUNT_ADJUSTMENT', 'EXPIRED', 'DAMAGED', 'RETURNED', 'TRANSFER_IN', 'TRANSFER_OUT', 'QUARANTINED', 'RELEASED_FROM_QUARANTINE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "ItemDocumentType" AS ENUM ('SDS', 'MANUFACTURER', 'INSTRUCTIONS', 'GENERAL');

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "primaryType" "CatalogItemType" NOT NULL,
    "route" TEXT,
    "therapeuticClass" TEXT,
    "species" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "brand" TEXT,
    "manufacturer" TEXT,
    "sku" TEXT,
    "status" "CatalogItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "imageUrl" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "inventoryTracked" BOOLEAN NOT NULL DEFAULT false,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "retailPrice" DECIMAL(19,4),
    "internalNotes" TEXT,
    "lotTracking" BOOLEAN NOT NULL DEFAULT false,
    "expirationTracking" BOOLEAN NOT NULL DEFAULT false,
    "controlledSubstance" BOOLEAN NOT NULL DEFAULT false,
    "deaSchedule" TEXT,
    "minimumStock" DECIMAL(20,6),
    "maximumStock" DECIMAL(20,6),
    "reorderPoint" DECIMAL(20,6),
    "reorderQuantity" DECIMAL(20,6),
    "sourceSystem" TEXT,
    "sourceId" TEXT,
    "sourceConfidence" DOUBLE PRECISION,
    "importedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemBarcode" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "barcodeType" TEXT NOT NULL,
    "unit" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemUnitConversion" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "purchaseUnit" TEXT NOT NULL,
    "stockUnit" TEXT NOT NULL,
    "dispenseUnit" TEXT,
    "billingUnit" TEXT,
    "purchaseToStock" DECIMAL(20,8) NOT NULL,
    "stockToDispense" DECIMAL(20,8),
    "stockToBilling" DECIMAL(20,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemUnitConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLocation" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLot" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemId" UUID NOT NULL,
    "stockLocationId" UUID NOT NULL,
    "lotNumber" TEXT,
    "expirationDate" DATE,
    "receivedDate" DATE,
    "receivedUnitCost" DECIMAL(19,4),
    "status" "InventoryLotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "quantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemId" UUID NOT NULL,
    "stockLocationId" UUID NOT NULL,
    "lotId" UUID,
    "onHand" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "quarantined" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "expired" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "itemId" UUID NOT NULL,
    "lotId" UUID,
    "stockLocationId" UUID NOT NULL,
    "transactionGroupId" UUID NOT NULL,
    "transactionType" "InventoryTransactionType" NOT NULL,
    "quantityDelta" DECIMAL(20,6) NOT NULL,
    "previousBalance" DECIMAL(20,6) NOT NULL,
    "resultingBalance" DECIMAL(20,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "patientId" TEXT,
    "visitId" TEXT,
    "invoiceId" TEXT,
    "purchaseOrderId" TEXT,
    "otherReference" TEXT,
    "notes" TEXT,
    "reversesTransactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDocument" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "type" "ItemDocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogItem_organizationId_locationId_status_idx" ON "CatalogItem"("organizationId", "locationId", "status");

-- CreateIndex
CREATE INDEX "CatalogItem_organizationId_name_idx" ON "CatalogItem"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_organizationId_sku_key" ON "CatalogItem"("organizationId", "sku");

-- CreateIndex
CREATE INDEX "ItemBarcode_itemId_idx" ON "ItemBarcode"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemBarcode_organizationId_value_key" ON "ItemBarcode"("organizationId", "value");

-- CreateIndex
CREATE INDEX "StockLocation_organizationId_clinicLocationId_idx" ON "StockLocation"("organizationId", "clinicLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_clinicLocationId_parentId_name_key" ON "StockLocation"("clinicLocationId", "parentId", "name");

-- CreateIndex
CREATE INDEX "InventoryLot_organizationId_expirationDate_status_idx" ON "InventoryLot"("organizationId", "expirationDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLot_itemId_stockLocationId_lotNumber_key" ON "InventoryLot"("itemId", "stockLocationId", "lotNumber");

-- CreateIndex
CREATE INDEX "StockBalance_organizationId_itemId_idx" ON "StockBalance"("organizationId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_itemId_stockLocationId_lotId_key" ON "StockBalance"("itemId", "stockLocationId", "lotId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransaction_reversesTransactionId_key" ON "InventoryTransaction"("reversesTransactionId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_organizationId_clinicLocationId_create_idx" ON "InventoryTransaction"("organizationId", "clinicLocationId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_itemId_createdAt_idx" ON "InventoryTransaction"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "ItemDocument_itemId_idx" ON "ItemDocument"("itemId");

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemBarcode" ADD CONSTRAINT "ItemBarcode_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemUnitConversion" ADD CONSTRAINT "ItemUnitConversion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_clinicLocationId_fkey" FOREIGN KEY ("clinicLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_clinicLocationId_fkey" FOREIGN KEY ("clinicLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_reversesTransactionId_fkey" FOREIGN KEY ("reversesTransactionId") REFERENCES "InventoryTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDocument" ADD CONSTRAINT "ItemDocument_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
