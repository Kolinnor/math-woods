ALTER TABLE "Concept" ADD COLUMN "domain" "MathDomain" NOT NULL DEFAULT 'OTHER';

ALTER TABLE "ConceptAlias" ADD COLUMN "aliasSlug" TEXT;
UPDATE "ConceptAlias"
SET "aliasSlug" = trim(both '-' from regexp_replace(lower("alias"), '[^a-z0-9]+', '-', 'g'));
ALTER TABLE "ConceptAlias" ALTER COLUMN "aliasSlug" SET NOT NULL;
CREATE UNIQUE INDEX "ConceptAlias_aliasSlug_key" ON "ConceptAlias"("aliasSlug");

CREATE TABLE "ConceptReference" (
    "id" SERIAL NOT NULL,
    "conceptId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "note" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConceptReference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConceptReference_conceptId_position_key" ON "ConceptReference"("conceptId", "position");

CREATE TABLE "ConceptTalkPost" (
    "id" SERIAL NOT NULL,
    "conceptId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConceptTalkPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConceptTalkPost_conceptId_createdAt_idx" ON "ConceptTalkPost"("conceptId", "createdAt");

CREATE TABLE "ConceptWatch" (
    "userId" INTEGER NOT NULL,
    "conceptId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConceptWatch_pkey" PRIMARY KEY ("userId", "conceptId")
);

CREATE INDEX "ConceptWatch_conceptId_idx" ON "ConceptWatch"("conceptId");

ALTER TABLE "PageRevision"
ADD CONSTRAINT "PageRevision_editedById_fkey"
FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConceptReference"
ADD CONSTRAINT "ConceptReference_conceptId_fkey"
FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConceptTalkPost"
ADD CONSTRAINT "ConceptTalkPost_conceptId_fkey"
FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConceptTalkPost"
ADD CONSTRAINT "ConceptTalkPost_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConceptWatch"
ADD CONSTRAINT "ConceptWatch_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConceptWatch"
ADD CONSTRAINT "ConceptWatch_conceptId_fkey"
FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
