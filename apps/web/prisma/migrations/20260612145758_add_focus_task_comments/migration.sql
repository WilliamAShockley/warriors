-- CreateTable
CREATE TABLE "FocusTaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FocusTaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FocusTaskComment_taskId_idx" ON "FocusTaskComment"("taskId");

-- AddForeignKey
ALTER TABLE "FocusTaskComment" ADD CONSTRAINT "FocusTaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "FocusTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

