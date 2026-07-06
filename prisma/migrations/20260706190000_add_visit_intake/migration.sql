CREATE TABLE "VisitIntake" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "chiefComplaint" TEXT,
    "historyNotes" TEXT,
    "weight" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "heartRate" INTEGER,
    "respiratoryRate" INTEGER,
    "appetite" TEXT,
    "vomiting" BOOLEAN NOT NULL DEFAULT false,
    "diarrhea" BOOLEAN NOT NULL DEFAULT false,
    "medicationsAllergies" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitIntake_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisitIntake_visitId_key" ON "VisitIntake"("visitId");

ALTER TABLE "VisitIntake"
ADD CONSTRAINT "VisitIntake_visitId_fkey"
FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
