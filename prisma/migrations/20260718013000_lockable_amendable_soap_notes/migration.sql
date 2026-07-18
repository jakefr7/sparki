ALTER TABLE "SoapNote"
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "contentHash" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "amendsSoapNoteId" TEXT,
  ADD COLUMN "amendmentReason" TEXT,
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT;

CREATE INDEX "SoapNote_amendsSoapNoteId_idx" ON "SoapNote"("amendsSoapNoteId");
ALTER TABLE "SoapNote" ADD CONSTRAINT "SoapNote_amendsSoapNoteId_fkey" FOREIGN KEY ("amendsSoapNoteId") REFERENCES "SoapNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
