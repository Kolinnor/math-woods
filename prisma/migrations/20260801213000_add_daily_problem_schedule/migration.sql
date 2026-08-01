CREATE TABLE "DailyProblemSchedule" (
    "dateKey" VARCHAR(10) NOT NULL,
    "problemId" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "imagePositionX" INTEGER NOT NULL DEFAULT 50,
    "imagePositionY" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyProblemSchedule_pkey" PRIMARY KEY ("dateKey"),
    CONSTRAINT "DailyProblemSchedule_imagePositionX_range" CHECK ("imagePositionX" BETWEEN 0 AND 100),
    CONSTRAINT "DailyProblemSchedule_imagePositionY_range" CHECK ("imagePositionY" BETWEEN 0 AND 100)
);

CREATE INDEX "DailyProblemSchedule_problemId_idx" ON "DailyProblemSchedule"("problemId");

ALTER TABLE "DailyProblemSchedule" ADD CONSTRAINT "DailyProblemSchedule_problemId_fkey"
FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
