CREATE TYPE "LibraryStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'NEEDS_WORK', 'ARCHIVED');
CREATE TYPE "LibraryReferenceType" AS ENUM ('BOOK', 'ARTICLE', 'LECTURE_NOTES', 'THESIS', 'VIDEO', 'CHANNEL', 'WEBSITE', 'COMPETITION', 'DATABASE', 'OTHER');
CREATE TYPE "LibraryReferenceRole" AS ENUM ('SOURCE', 'FURTHER_READING', 'PROOF', 'ATTRIBUTION');
CREATE TYPE "HistoryEra" AS ENUM ('ANCIENT', 'MEDIEVAL', 'EARLY_MODERN', 'MODERN', 'CONTEMPORARY');
CREATE TYPE "HistoryMilestoneType" AS ENUM ('DISCOVERY', 'PUBLICATION', 'NOTATION', 'INSTITUTION', 'BIOGRAPHICAL', 'OTHER');

ALTER TYPE "NotificationType" ADD VALUE 'LIBRARY_ENTRY_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'LIBRARY_ENTRY_PUBLISHED';
ALTER TYPE "NotificationType" ADD VALUE 'LIBRARY_ENTRY_CHANGES_REQUESTED';

ALTER TABLE "Mathematician"
  ADD COLUMN "fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "status" "LibraryStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "imageAlt" TEXT,
  ADD COLUMN "imageCredit" TEXT,
  ADD COLUMN "imageCreditUrl" TEXT,
  ADD COLUMN "imageLicense" TEXT,
  ADD COLUMN "reviewedById" INTEGER,
  ADD COLUMN "reviewNote" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3);

UPDATE "Mathematician"
SET "status" = 'PUBLISHED', "publishedAt" = COALESCE("updatedAt", "createdAt");

CREATE TABLE "MathematicianTranslation" (
  "id" SERIAL NOT NULL,
  "mathematicianId" INTEGER NOT NULL,
  "language" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "teaser" TEXT NOT NULL DEFAULT '',
  "birthPlace" TEXT NOT NULL DEFAULT '',
  "biographyMarkdown" TEXT NOT NULL DEFAULT '',
  "biographyHtml" TEXT NOT NULL DEFAULT '',
  "contributionsMarkdown" TEXT NOT NULL DEFAULT '',
  "contributionsHtml" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MathematicianTranslation_pkey" PRIMARY KEY ("id")
);

INSERT INTO "MathematicianTranslation" (
  "mathematicianId", "language", "displayName", "birthPlace", "biographyMarkdown", "biographyHtml"
)
SELECT "id", 'fr', "name", "birthPlace", "contentMarkdown", "contentHtml"
FROM "Mathematician";

CREATE TABLE "LibraryReference" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "referenceType" "LibraryReferenceType" NOT NULL DEFAULT 'OTHER',
  "canonicalTitle" TEXT NOT NULL,
  "authors" TEXT,
  "publisher" TEXT,
  "year" INTEGER,
  "yearLabel" TEXT,
  "url" TEXT,
  "doi" TEXT,
  "isbn" TEXT,
  "citationKey" TEXT,
  "bibtex" TEXT,
  "formattedOverride" TEXT,
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "iconUrl" TEXT,
  "iconSize" INTEGER NOT NULL DEFAULT 40,
  "imageAlt" TEXT,
  "imageCredit" TEXT,
  "imageCreditUrl" TEXT,
  "imageLicense" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "status" "LibraryStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" INTEGER,
  "reviewedById" INTEGER,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryReference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LibraryReference_iconSize_check" CHECK ("iconSize" BETWEEN 24 AND 288)
);

CREATE TABLE "LibraryReferenceTranslation" (
  "id" SERIAL NOT NULL,
  "referenceId" INTEGER NOT NULL,
  "language" TEXT NOT NULL,
  "displayTitle" TEXT,
  "descriptionMarkdown" TEXT NOT NULL DEFAULT '',
  "descriptionHtml" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryReferenceTranslation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProblemLibraryReference" (
  "id" SERIAL NOT NULL,
  "problemId" INTEGER NOT NULL,
  "referenceId" INTEGER NOT NULL,
  "role" "LibraryReferenceRole" NOT NULL DEFAULT 'SOURCE',
  "locator" TEXT,
  "note" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ProblemLibraryReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConceptLibraryReference" (
  "id" SERIAL NOT NULL,
  "conceptId" INTEGER NOT NULL,
  "referenceId" INTEGER NOT NULL,
  "role" "LibraryReferenceRole" NOT NULL DEFAULT 'FURTHER_READING',
  "locator" TEXT,
  "note" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ConceptLibraryReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MathematicianWork" (
  "id" SERIAL NOT NULL,
  "mathematicianId" INTEGER NOT NULL,
  "referenceId" INTEGER NOT NULL,
  "note" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MathematicianWork_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MathematicianConcept" (
  "mathematicianId" INTEGER NOT NULL,
  "conceptId" INTEGER NOT NULL,
  "note" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "MathematicianConcept_pkey" PRIMARY KEY ("mathematicianId", "conceptId")
);

CREATE TABLE "MathematicianProblem" (
  "mathematicianId" INTEGER NOT NULL,
  "problemId" INTEGER NOT NULL,
  "note" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "MathematicianProblem_pkey" PRIMARY KEY ("mathematicianId", "problemId")
);

CREATE TABLE "HistoryMilestone" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "sortYear" INTEGER NOT NULL,
  "era" "HistoryEra" NOT NULL,
  "milestoneType" "HistoryMilestoneType" NOT NULL DEFAULT 'OTHER',
  "status" "LibraryStatus" NOT NULL DEFAULT 'DRAFT',
  "imageUrl" TEXT,
  "imageAlt" TEXT,
  "imageCredit" TEXT,
  "imageCreditUrl" TEXT,
  "imageLicense" TEXT,
  "createdById" INTEGER,
  "reviewedById" INTEGER,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HistoryMilestone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HistoryMilestoneTranslation" (
  "id" SERIAL NOT NULL,
  "milestoneId" INTEGER NOT NULL,
  "language" TEXT NOT NULL,
  "yearLabel" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summaryMarkdown" TEXT NOT NULL,
  "summaryHtml" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HistoryMilestoneTranslation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HistoryMilestoneConcept" (
  "milestoneId" INTEGER NOT NULL,
  "conceptId" INTEGER NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "HistoryMilestoneConcept_pkey" PRIMARY KEY ("milestoneId", "conceptId")
);

CREATE TABLE "HistoryMilestoneReference" (
  "milestoneId" INTEGER NOT NULL,
  "referenceId" INTEGER NOT NULL,
  "note" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "HistoryMilestoneReference_pkey" PRIMARY KEY ("milestoneId", "referenceId")
);

CREATE TABLE "HistoryMilestoneMathematician" (
  "milestoneId" INTEGER NOT NULL,
  "mathematicianId" INTEGER NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "HistoryMilestoneMathematician_pkey" PRIMARY KEY ("milestoneId", "mathematicianId")
);

CREATE TABLE "LibraryHomepageSelection" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "milestoneId" INTEGER,
  "mathematicianId" INTEGER,
  "referenceId" INTEGER,
  "updatedById" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryHomepageSelection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MathematicianTranslation_mathematicianId_language_key" ON "MathematicianTranslation"("mathematicianId", "language");
CREATE INDEX "MathematicianTranslation_language_displayName_idx" ON "MathematicianTranslation"("language", "displayName");
CREATE INDEX "Mathematician_status_name_idx" ON "Mathematician"("status", "name");
CREATE UNIQUE INDEX "LibraryReference_slug_key" ON "LibraryReference"("slug");
CREATE UNIQUE INDEX "LibraryReference_citationKey_key" ON "LibraryReference"("citationKey");
CREATE UNIQUE INDEX "LibraryReference_dedupeKey_key" ON "LibraryReference"("dedupeKey");
CREATE INDEX "LibraryReference_status_referenceType_canonicalTitle_idx" ON "LibraryReference"("status", "referenceType", "canonicalTitle");
CREATE INDEX "LibraryReference_doi_idx" ON "LibraryReference"("doi");
CREATE INDEX "LibraryReference_isbn_idx" ON "LibraryReference"("isbn");
CREATE UNIQUE INDEX "LibraryReferenceTranslation_referenceId_language_key" ON "LibraryReferenceTranslation"("referenceId", "language");
CREATE INDEX "LibraryReferenceTranslation_language_idx" ON "LibraryReferenceTranslation"("language");
CREATE UNIQUE INDEX "ProblemLibraryReference_problemId_referenceId_key" ON "ProblemLibraryReference"("problemId", "referenceId");
CREATE INDEX "ProblemLibraryReference_referenceId_idx" ON "ProblemLibraryReference"("referenceId");
CREATE INDEX "ProblemLibraryReference_problemId_position_idx" ON "ProblemLibraryReference"("problemId", "position");
CREATE UNIQUE INDEX "ConceptLibraryReference_conceptId_referenceId_key" ON "ConceptLibraryReference"("conceptId", "referenceId");
CREATE INDEX "ConceptLibraryReference_referenceId_idx" ON "ConceptLibraryReference"("referenceId");
CREATE INDEX "ConceptLibraryReference_conceptId_position_idx" ON "ConceptLibraryReference"("conceptId", "position");
CREATE UNIQUE INDEX "MathematicianWork_mathematicianId_referenceId_key" ON "MathematicianWork"("mathematicianId", "referenceId");
CREATE INDEX "MathematicianWork_referenceId_idx" ON "MathematicianWork"("referenceId");
CREATE INDEX "MathematicianConcept_conceptId_idx" ON "MathematicianConcept"("conceptId");
CREATE INDEX "MathematicianProblem_problemId_idx" ON "MathematicianProblem"("problemId");
CREATE UNIQUE INDEX "HistoryMilestone_slug_key" ON "HistoryMilestone"("slug");
CREATE INDEX "HistoryMilestone_status_sortYear_idx" ON "HistoryMilestone"("status", "sortYear");
CREATE INDEX "HistoryMilestone_era_sortYear_idx" ON "HistoryMilestone"("era", "sortYear");
CREATE UNIQUE INDEX "HistoryMilestoneTranslation_milestoneId_language_key" ON "HistoryMilestoneTranslation"("milestoneId", "language");
CREATE INDEX "HistoryMilestoneTranslation_language_title_idx" ON "HistoryMilestoneTranslation"("language", "title");
CREATE INDEX "HistoryMilestoneConcept_conceptId_idx" ON "HistoryMilestoneConcept"("conceptId");
CREATE INDEX "HistoryMilestoneReference_referenceId_idx" ON "HistoryMilestoneReference"("referenceId");
CREATE INDEX "HistoryMilestoneMathematician_mathematicianId_idx" ON "HistoryMilestoneMathematician"("mathematicianId");

ALTER TABLE "Mathematician" ADD CONSTRAINT "Mathematician_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MathematicianTranslation" ADD CONSTRAINT "MathematicianTranslation_mathematicianId_fkey" FOREIGN KEY ("mathematicianId") REFERENCES "Mathematician"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryReference" ADD CONSTRAINT "LibraryReference_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LibraryReference" ADD CONSTRAINT "LibraryReference_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LibraryReferenceTranslation" ADD CONSTRAINT "LibraryReferenceTranslation_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "LibraryReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemLibraryReference" ADD CONSTRAINT "ProblemLibraryReference_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemLibraryReference" ADD CONSTRAINT "ProblemLibraryReference_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "LibraryReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConceptLibraryReference" ADD CONSTRAINT "ConceptLibraryReference_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConceptLibraryReference" ADD CONSTRAINT "ConceptLibraryReference_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "LibraryReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MathematicianWork" ADD CONSTRAINT "MathematicianWork_mathematicianId_fkey" FOREIGN KEY ("mathematicianId") REFERENCES "Mathematician"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MathematicianWork" ADD CONSTRAINT "MathematicianWork_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "LibraryReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MathematicianConcept" ADD CONSTRAINT "MathematicianConcept_mathematicianId_fkey" FOREIGN KEY ("mathematicianId") REFERENCES "Mathematician"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MathematicianConcept" ADD CONSTRAINT "MathematicianConcept_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MathematicianProblem" ADD CONSTRAINT "MathematicianProblem_mathematicianId_fkey" FOREIGN KEY ("mathematicianId") REFERENCES "Mathematician"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MathematicianProblem" ADD CONSTRAINT "MathematicianProblem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoryMilestone" ADD CONSTRAINT "HistoryMilestone_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HistoryMilestone" ADD CONSTRAINT "HistoryMilestone_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HistoryMilestoneTranslation" ADD CONSTRAINT "HistoryMilestoneTranslation_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "HistoryMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoryMilestoneConcept" ADD CONSTRAINT "HistoryMilestoneConcept_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "HistoryMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoryMilestoneConcept" ADD CONSTRAINT "HistoryMilestoneConcept_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoryMilestoneReference" ADD CONSTRAINT "HistoryMilestoneReference_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "HistoryMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoryMilestoneReference" ADD CONSTRAINT "HistoryMilestoneReference_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "LibraryReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoryMilestoneMathematician" ADD CONSTRAINT "HistoryMilestoneMathematician_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "HistoryMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoryMilestoneMathematician" ADD CONSTRAINT "HistoryMilestoneMathematician_mathematicianId_fkey" FOREIGN KEY ("mathematicianId") REFERENCES "Mathematician"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryHomepageSelection" ADD CONSTRAINT "LibraryHomepageSelection_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "HistoryMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LibraryHomepageSelection" ADD CONSTRAINT "LibraryHomepageSelection_mathematicianId_fkey" FOREIGN KEY ("mathematicianId") REFERENCES "Mathematician"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LibraryHomepageSelection" ADD CONSTRAINT "LibraryHomepageSelection_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "LibraryReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LibraryHomepageSelection" ADD CONSTRAINT "LibraryHomepageSelection_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "LibraryReference" (
  "slug", "referenceType", "canonicalTitle", "aliases", "iconUrl", "iconSize", "dedupeKey", "status", "publishedAt", "createdAt", "updatedAt"
)
SELECT "slug", 'OTHER', "name", "aliases", "iconUrl", LEAST(GREATEST("iconSize", 24), 288), 'known-source:' || "id", 'PUBLISHED', "updatedAt", "createdAt", "updatedAt"
FROM "KnownProblemSource";

INSERT INTO "ProblemLibraryReference" ("problemId", "referenceId", "role", "locator", "note", "position", "isPrimary")
SELECT p."id", r."id", 'SOURCE',
  NULLIF(CONCAT_WS(' · ', NULLIF(p."originChapter", ''), NULLIF(p."originPage", '')), ''),
  p."originNote", 0, true
FROM "Problem" p
JOIN "LibraryReference" r ON r."dedupeKey" = 'known-source:' || p."knownSourceId"
WHERE p."knownSourceId" IS NOT NULL
ON CONFLICT ("problemId", "referenceId") DO NOTHING;

INSERT INTO "LibraryReference" (
  "slug", "referenceType", "canonicalTitle", "dedupeKey", "status", "publishedAt"
)
SELECT 'legacy-origin-' || SUBSTRING(MD5(normalized) FROM 1 FOR 16), 'OTHER', MIN(origin),
  'legacy-origin:' || MD5(normalized), 'PUBLISHED', CURRENT_TIMESTAMP
FROM (
  SELECT "origin" AS origin, REGEXP_REPLACE(LOWER(TRIM("origin")), '\s+', ' ', 'g') AS normalized
  FROM "Problem"
  WHERE "knownSourceId" IS NULL
    AND TRIM("origin") <> ''
    AND LOWER(TRIM("origin")) NOT IN ('unknown', 'inconnu', 'unspecified', 'non précisée', 'non precisee')
) origins
GROUP BY normalized;

INSERT INTO "ProblemLibraryReference" ("problemId", "referenceId", "role", "locator", "note", "position", "isPrimary")
SELECT p."id", r."id", 'SOURCE',
  NULLIF(CONCAT_WS(' · ', NULLIF(p."originChapter", ''), NULLIF(p."originPage", '')), ''),
  p."originNote", 0, true
FROM "Problem" p
JOIN "LibraryReference" r
  ON r."dedupeKey" = 'legacy-origin:' || MD5(REGEXP_REPLACE(LOWER(TRIM(p."origin")), '\s+', ' ', 'g'))
WHERE p."knownSourceId" IS NULL
ON CONFLICT ("problemId", "referenceId") DO NOTHING;

INSERT INTO "LibraryReference" (
  "slug", "referenceType", "canonicalTitle", "url", "dedupeKey", "status", "publishedAt"
)
SELECT 'legacy-concept-reference-' || MIN("id"), 'OTHER', MIN("title"), MAX("url"), dedupe_key, 'PUBLISHED', CURRENT_TIMESTAMP
FROM (
  SELECT *, CASE
    WHEN "url" IS NOT NULL AND TRIM("url") <> '' THEN 'legacy-concept-url:' || MD5(LOWER(TRIM("url")))
    ELSE 'legacy-concept-title:' || MD5(REGEXP_REPLACE(LOWER(TRIM("title")), '\s+', ' ', 'g'))
  END AS dedupe_key
  FROM "ConceptReference"
) legacy
GROUP BY dedupe_key;

INSERT INTO "ConceptLibraryReference" ("conceptId", "referenceId", "role", "note", "position")
SELECT c."conceptId", r."id", 'FURTHER_READING', c."note", c."position"
FROM "ConceptReference" c
JOIN "LibraryReference" r ON r."dedupeKey" = CASE
  WHEN c."url" IS NOT NULL AND TRIM(c."url") <> '' THEN 'legacy-concept-url:' || MD5(LOWER(TRIM(c."url")))
  ELSE 'legacy-concept-title:' || MD5(REGEXP_REPLACE(LOWER(TRIM(c."title")), '\s+', ' ', 'g'))
END
ON CONFLICT ("conceptId", "referenceId") DO NOTHING;
