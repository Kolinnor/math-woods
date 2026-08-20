CREATE TYPE "SiteImprovementStatus" AS ENUM ('BACKLOG', 'PLANNED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "SiteImprovementPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');
CREATE TYPE "SiteImprovementActivityType" AS ENUM ('CREATED', 'DETAILS_CHANGED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNEE_CHANGED');

CREATE TABLE "SiteImprovement" (
  "id" SERIAL NOT NULL,
  "title" TEXT NOT NULL,
  "descriptionMarkdown" TEXT NOT NULL,
  "descriptionHtml" TEXT NOT NULL,
  "status" "SiteImprovementStatus" NOT NULL DEFAULT 'BACKLOG',
  "priority" "SiteImprovementPriority" NOT NULL DEFAULT 'NORMAL',
  "creatorId" INTEGER,
  "assigneeId" INTEGER,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SiteImprovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SiteImprovementComment" (
  "id" SERIAL NOT NULL,
  "improvementId" INTEGER NOT NULL,
  "authorId" INTEGER,
  "bodyMarkdown" TEXT NOT NULL,
  "bodyHtml" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SiteImprovementComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SiteImprovementActivity" (
  "id" SERIAL NOT NULL,
  "improvementId" INTEGER NOT NULL,
  "actorId" INTEGER,
  "type" "SiteImprovementActivityType" NOT NULL,
  "fromValue" TEXT,
  "toValue" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteImprovementActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SiteImprovement_status_priority_updatedAt_idx" ON "SiteImprovement"("status", "priority", "updatedAt");
CREATE INDEX "SiteImprovement_creatorId_idx" ON "SiteImprovement"("creatorId");
CREATE INDEX "SiteImprovement_assigneeId_idx" ON "SiteImprovement"("assigneeId");
CREATE INDEX "SiteImprovementComment_improvementId_createdAt_idx" ON "SiteImprovementComment"("improvementId", "createdAt");
CREATE INDEX "SiteImprovementComment_authorId_idx" ON "SiteImprovementComment"("authorId");
CREATE INDEX "SiteImprovementActivity_improvementId_createdAt_idx" ON "SiteImprovementActivity"("improvementId", "createdAt");
CREATE INDEX "SiteImprovementActivity_actorId_idx" ON "SiteImprovementActivity"("actorId");

ALTER TABLE "SiteImprovement" ADD CONSTRAINT "SiteImprovement_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteImprovement" ADD CONSTRAINT "SiteImprovement_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteImprovementComment" ADD CONSTRAINT "SiteImprovementComment_improvementId_fkey" FOREIGN KEY ("improvementId") REFERENCES "SiteImprovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteImprovementComment" ADD CONSTRAINT "SiteImprovementComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteImprovementActivity" ADD CONSTRAINT "SiteImprovementActivity_improvementId_fkey" FOREIGN KEY ("improvementId") REFERENCES "SiteImprovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteImprovementActivity" ADD CONSTRAINT "SiteImprovementActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
