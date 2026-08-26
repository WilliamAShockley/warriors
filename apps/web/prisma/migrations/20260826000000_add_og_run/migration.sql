-- CreateTable
CREATE TABLE "OgRun" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "founderName" TEXT,
    "company" TEXT,
    "enrichment" JSONB,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OgRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OgRun_mode_createdAt_idx" ON "OgRun"("mode", "createdAt");

