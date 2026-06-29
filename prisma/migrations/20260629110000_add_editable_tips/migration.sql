CREATE TABLE "Tip" (
  "id" SERIAL NOT NULL,
  "position" INTEGER NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 0,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Tip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tip_position_key" ON "Tip"("position");
