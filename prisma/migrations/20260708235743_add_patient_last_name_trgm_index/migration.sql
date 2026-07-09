-- CreateIndex
CREATE INDEX "Patient_lastName_idx" ON "Patient" USING GIN ("lastName" gin_trgm_ops);
