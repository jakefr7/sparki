-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Patient_name_idx" ON "Patient" USING GIN ("name" gin_trgm_ops);
