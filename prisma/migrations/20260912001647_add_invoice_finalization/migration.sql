-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'FINALIZED';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "finalizedAt" TIMESTAMP(3),
ADD COLUMN     "finalizedById" TEXT;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
