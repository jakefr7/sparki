CREATE TABLE "VisitExamFindings" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitExamFindings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisitExamFindings_visitId_key" ON "VisitExamFindings"("visitId");

ALTER TABLE "VisitExamFindings"
ADD CONSTRAINT "VisitExamFindings_visitId_fkey"
FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
