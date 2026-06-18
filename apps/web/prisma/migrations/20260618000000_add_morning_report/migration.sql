-- CreateTable
CREATE TABLE "MorningReport" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "summary" TEXT NOT NULL DEFAULT '',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MorningReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportItem" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sourceContext" TEXT,
    "category" TEXT NOT NULL DEFAULT 'manual',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "reasoning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionDraft" (
    "id" TEXT NOT NULL,
    "reportItemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "emailTo" TEXT,
    "emailThreadId" TEXT,
    "emailSubject" TEXT,
    "emailBody" TEXT,
    "eventTitle" TEXT,
    "eventStart" TIMESTAMP(3),
    "eventEnd" TIMESTAMP(3),
    "eventAttendees" TEXT,
    "eventLocation" TEXT,
    "eventDescription" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "autoExecuted" BOOLEAN NOT NULL DEFAULT false,
    "executedAt" TIMESTAMP(3),
    "executionResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MorningReport_date_idx" ON "MorningReport"("date");

-- CreateIndex
CREATE INDEX "ReportItem_reportId_idx" ON "ReportItem"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionDraft_reportItemId_key" ON "ActionDraft"("reportItemId");

-- AddForeignKey
ALTER TABLE "ReportItem" ADD CONSTRAINT "ReportItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MorningReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionDraft" ADD CONSTRAINT "ActionDraft_reportItemId_fkey" FOREIGN KEY ("reportItemId") REFERENCES "ReportItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
