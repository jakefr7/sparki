CREATE TYPE "VisitBalanceStatus" AS ENUM ('Unknown', 'Paid', 'Outstanding');

CREATE TABLE "VisitDischarge" (
  "id" TEXT NOT NULL,
  "visitId" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "medicationInstructions" TEXT,
  "warningSigns" TEXT,
  "followUpPlan" TEXT,
  "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
  "completedById" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisitDischarge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisitCheckout" (
  "id" TEXT NOT NULL,
  "visitId" TEXT NOT NULL,
  "clientContactConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "missingAccountInformation" TEXT,
  "balanceStatus" "VisitBalanceStatus" NOT NULL DEFAULT 'Unknown',
  "outstandingBalanceCents" INTEGER,
  "completedById" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisitCheckout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisitDischarge_visitId_key" ON "VisitDischarge"("visitId");
CREATE UNIQUE INDEX "VisitCheckout_visitId_key" ON "VisitCheckout"("visitId");
ALTER TABLE "VisitDischarge" ADD CONSTRAINT "VisitDischarge_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitDischarge" ADD CONSTRAINT "VisitDischarge_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitCheckout" ADD CONSTRAINT "VisitCheckout_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitCheckout" ADD CONSTRAINT "VisitCheckout_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
