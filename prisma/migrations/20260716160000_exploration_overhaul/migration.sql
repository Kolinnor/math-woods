CREATE TYPE "ExplorationStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "ExplorationCollaboratorRole" AS ENUM ('EDITOR', 'REVIEWER');
CREATE TYPE "ExplorationBlockKind" AS ENUM (
  'MARKDOWN', 'HEADING', 'DEFINITION', 'THEOREM', 'LEMMA', 'PROPOSITION', 'COROLLARY',
  'PROOF', 'EXAMPLE', 'COUNTEREXAMPLE', 'REMARK', 'CALLOUT', 'IMAGE', 'DIVIDER',
  'PROBLEM', 'CONCEPT', 'QUIZ', 'CHOICE'
);
CREATE TYPE "ExplorationQuizType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_TEXT', 'NUMBER');
CREATE TYPE "ExplorationSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXPLORATION_PUBLISHED';

ALTER TABLE "Playlist"
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "coverImageUrl" TEXT,
  ADD COLUMN "domain" "MathDomain" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "audience" TEXT,
  ADD COLUMN "prerequisitesMarkdown" TEXT,
  ADD COLUMN "prerequisitesHtml" TEXT,
  ADD COLUMN "estimatedMinutes" INTEGER,
  ADD COLUMN "difficulty" INTEGER,
  ADD COLUMN "license" TEXT NOT NULL DEFAULT 'CC BY-NC-SA 4.0',
  ADD COLUMN "status" "ExplorationStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "publishedAt" TIMESTAMP(3);

UPDATE "Playlist"
SET
  "status" = 'PUBLISHED',
  "publishedAt" = COALESCE("updatedAt", "createdAt"),
  "summary" = NULLIF(LEFT(REGEXP_REPLACE("descriptionMarkdown", '\s+', ' ', 'g'), 240), '');

ALTER TABLE "Playlist"
  ADD CONSTRAINT "Playlist_estimatedMinutes_check" CHECK ("estimatedMinutes" IS NULL OR "estimatedMinutes" > 0),
  ADD CONSTRAINT "Playlist_difficulty_check" CHECK ("difficulty" IS NULL OR ("difficulty" >= 0 AND "difficulty" <= 100));

CREATE TABLE "ExplorationPage" (
  "id" SERIAL NOT NULL,
  "playlistId" INTEGER NOT NULL,
  "key" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "position" INTEGER NOT NULL,
  "isStart" BOOLEAN NOT NULL DEFAULT false,
  "visibilityRule" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExplorationPage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExplorationBlock" (
  "id" SERIAL NOT NULL,
  "pageId" INTEGER NOT NULL,
  "key" TEXT NOT NULL,
  "kind" "ExplorationBlockKind" NOT NULL DEFAULT 'MARKDOWN',
  "title" TEXT,
  "bodyMarkdown" TEXT,
  "bodyHtml" TEXT,
  "explanationMarkdown" TEXT,
  "explanationHtml" TEXT,
  "position" INTEGER NOT NULL,
  "problemId" INTEGER,
  "conceptId" INTEGER,
  "quizType" "ExplorationQuizType",
  "settings" JSONB,
  "visibilityRule" JSONB,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "points" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExplorationBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExplorationBlock_points_check" CHECK ("points" >= 0)
);

CREATE TABLE "ExplorationBlockOption" (
  "id" SERIAL NOT NULL,
  "blockId" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "value" TEXT,
  "feedbackMarkdown" TEXT,
  "feedbackHtml" TEXT,
  "isCorrect" BOOLEAN,
  "toPageId" INTEGER,
  "effects" JSONB,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExplorationBlockOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExplorationCollaborator" (
  "playlistId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "role" "ExplorationCollaboratorRole" NOT NULL DEFAULT 'EDITOR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExplorationCollaborator_pkey" PRIMARY KEY ("playlistId", "userId")
);

CREATE TABLE "ExplorationEdition" (
  "id" SERIAL NOT NULL,
  "playlistId" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "changeSummary" TEXT,
  "publishedById" INTEGER,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExplorationEdition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExplorationSession" (
  "id" SERIAL NOT NULL,
  "playlistId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "editionId" INTEGER,
  "currentPageId" INTEGER,
  "currentPageKey" TEXT,
  "state" JSONB NOT NULL DEFAULT '{}',
  "visitedPageIds" JSONB NOT NULL DEFAULT '[]',
  "visitedPageKeys" JSONB NOT NULL DEFAULT '[]',
  "status" "ExplorationSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "score" INTEGER NOT NULL DEFAULT 0,
  "maxScore" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ExplorationSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExplorationAnswer" (
  "id" SERIAL NOT NULL,
  "sessionId" INTEGER NOT NULL,
  "blockId" INTEGER,
  "blockKey" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "isCorrect" BOOLEAN,
  "score" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExplorationAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExplorationPage_playlistId_key_key" ON "ExplorationPage"("playlistId", "key");
CREATE UNIQUE INDEX "ExplorationPage_playlistId_slug_key" ON "ExplorationPage"("playlistId", "slug");
CREATE INDEX "ExplorationPage_playlistId_position_idx" ON "ExplorationPage"("playlistId", "position");
CREATE UNIQUE INDEX "ExplorationBlock_pageId_key_key" ON "ExplorationBlock"("pageId", "key");
CREATE INDEX "ExplorationBlock_pageId_position_idx" ON "ExplorationBlock"("pageId", "position");
CREATE INDEX "ExplorationBlock_problemId_idx" ON "ExplorationBlock"("problemId");
CREATE INDEX "ExplorationBlock_conceptId_idx" ON "ExplorationBlock"("conceptId");
CREATE INDEX "ExplorationBlockOption_blockId_position_idx" ON "ExplorationBlockOption"("blockId", "position");
CREATE INDEX "ExplorationBlockOption_toPageId_idx" ON "ExplorationBlockOption"("toPageId");
CREATE INDEX "ExplorationCollaborator_userId_idx" ON "ExplorationCollaborator"("userId");
CREATE UNIQUE INDEX "ExplorationEdition_playlistId_version_key" ON "ExplorationEdition"("playlistId", "version");
CREATE INDEX "ExplorationEdition_playlistId_publishedAt_idx" ON "ExplorationEdition"("playlistId", "publishedAt");
CREATE UNIQUE INDEX "ExplorationSession_playlistId_userId_key" ON "ExplorationSession"("playlistId", "userId");
CREATE INDEX "ExplorationSession_userId_lastSeenAt_idx" ON "ExplorationSession"("userId", "lastSeenAt");
CREATE INDEX "ExplorationSession_playlistId_status_idx" ON "ExplorationSession"("playlistId", "status");
CREATE UNIQUE INDEX "ExplorationAnswer_sessionId_blockKey_key" ON "ExplorationAnswer"("sessionId", "blockKey");
CREATE INDEX "ExplorationAnswer_blockKey_isCorrect_idx" ON "ExplorationAnswer"("blockKey", "isCorrect");
CREATE INDEX "ExplorationAnswer_blockId_idx" ON "ExplorationAnswer"("blockId");

ALTER TABLE "ExplorationPage" ADD CONSTRAINT "ExplorationPage_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExplorationBlock" ADD CONSTRAINT "ExplorationBlock_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ExplorationPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExplorationBlock" ADD CONSTRAINT "ExplorationBlock_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExplorationBlock" ADD CONSTRAINT "ExplorationBlock_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExplorationBlockOption" ADD CONSTRAINT "ExplorationBlockOption_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ExplorationBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExplorationBlockOption" ADD CONSTRAINT "ExplorationBlockOption_toPageId_fkey" FOREIGN KEY ("toPageId") REFERENCES "ExplorationPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExplorationCollaborator" ADD CONSTRAINT "ExplorationCollaborator_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExplorationCollaborator" ADD CONSTRAINT "ExplorationCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExplorationEdition" ADD CONSTRAINT "ExplorationEdition_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExplorationEdition" ADD CONSTRAINT "ExplorationEdition_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExplorationSession" ADD CONSTRAINT "ExplorationSession_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExplorationSession" ADD CONSTRAINT "ExplorationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExplorationSession" ADD CONSTRAINT "ExplorationSession_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "ExplorationEdition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExplorationSession" ADD CONSTRAINT "ExplorationSession_currentPageId_fkey" FOREIGN KEY ("currentPageId") REFERENCES "ExplorationPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExplorationAnswer" ADD CONSTRAINT "ExplorationAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExplorationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExplorationAnswer" ADD CONSTRAINT "ExplorationAnswer_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ExplorationBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve every current exploration as an editable introduction page.
INSERT INTO "ExplorationPage" ("playlistId", "key", "slug", "title", "position", "isStart", "createdAt", "updatedAt")
SELECT p."id", 'legacy-intro-' || p."id", 'introduction', p."title", 1,
  NOT EXISTS (SELECT 1 FROM "PlaylistNode" n WHERE n."playlistId" = p."id"),
  p."createdAt", p."updatedAt"
FROM "Playlist" p;

INSERT INTO "ExplorationBlock" ("pageId", "key", "kind", "title", "bodyMarkdown", "bodyHtml", "position", "createdAt", "updatedAt")
SELECT ep."id", 'legacy-description-' || p."id", 'MARKDOWN', NULL, p."descriptionMarkdown", p."descriptionHtml", 1, p."createdAt", p."updatedAt"
FROM "Playlist" p
JOIN "ExplorationPage" ep ON ep."playlistId" = p."id" AND ep."key" = 'legacy-intro-' || p."id"
WHERE p."descriptionMarkdown" <> '';

-- Linear playlists become embedded problem blocks on their introduction page.
INSERT INTO "ExplorationBlock" ("pageId", "key", "kind", "bodyMarkdown", "bodyHtml", "position", "problemId", "createdAt", "updatedAt")
SELECT ep."id", 'legacy-item-' || i."id", 'PROBLEM', i."noteMarkdown", NULL, i."position" + 1, i."problemId", p."createdAt", p."updatedAt"
FROM "PlaylistItem" i
JOIN "Playlist" p ON p."id" = i."playlistId"
JOIN "ExplorationPage" ep ON ep."playlistId" = p."id" AND ep."key" = 'legacy-intro-' || p."id"
WHERE NOT EXISTS (SELECT 1 FROM "PlaylistNode" n WHERE n."playlistId" = p."id");

-- Existing adaptive nodes become pages containing one canonical block.
INSERT INTO "ExplorationPage" ("playlistId", "key", "slug", "title", "position", "isStart", "createdAt", "updatedAt")
SELECT n."playlistId", 'legacy-node-' || n."id", 'step-' || n."id",
  COALESCE(n."title", pr."title", c."title", 'Untitled step'), n."position" + 1, n."isStart", n."createdAt", n."updatedAt"
FROM "PlaylistNode" n
LEFT JOIN "Problem" pr ON pr."id" = n."problemId"
LEFT JOIN "Concept" c ON c."id" = n."conceptId";

INSERT INTO "ExplorationBlock" ("pageId", "key", "kind", "title", "bodyMarkdown", "bodyHtml", "position", "problemId", "conceptId", "createdAt", "updatedAt")
SELECT ep."id", 'legacy-node-block-' || n."id",
  CASE n."kind"::text WHEN 'PROBLEM' THEN 'PROBLEM'::"ExplorationBlockKind" WHEN 'CONCEPT' THEN 'CONCEPT'::"ExplorationBlockKind" ELSE 'MARKDOWN'::"ExplorationBlockKind" END,
  n."title", n."bodyMarkdown", n."bodyHtml", 1, n."problemId", n."conceptId", n."createdAt", n."updatedAt"
FROM "PlaylistNode" n
JOIN "ExplorationPage" ep ON ep."playlistId" = n."playlistId" AND ep."key" = 'legacy-node-' || n."id";

INSERT INTO "ExplorationBlock" ("pageId", "key", "kind", "title", "position", "createdAt", "updatedAt")
SELECT ep."id", 'legacy-choice-' || ch."fromNodeId", 'CHOICE', 'Choose what comes next', 100000, MIN(ch."createdAt"), CURRENT_TIMESTAMP
FROM "PlaylistChoice" ch
JOIN "PlaylistNode" n ON n."id" = ch."fromNodeId"
JOIN "ExplorationPage" ep ON ep."playlistId" = n."playlistId" AND ep."key" = 'legacy-node-' || n."id"
GROUP BY ep."id", ch."fromNodeId";

INSERT INTO "ExplorationBlockOption" ("blockId", "label", "feedbackMarkdown", "feedbackHtml", "toPageId", "position", "createdAt")
SELECT b."id", ch."label", ch."note", NULL, target_page."id", ch."position", ch."createdAt"
FROM "PlaylistChoice" ch
JOIN "PlaylistNode" source_node ON source_node."id" = ch."fromNodeId"
JOIN "ExplorationPage" source_page ON source_page."playlistId" = source_node."playlistId" AND source_page."key" = 'legacy-node-' || source_node."id"
JOIN "ExplorationBlock" b ON b."pageId" = source_page."id" AND b."key" = 'legacy-choice-' || ch."fromNodeId"
JOIN "PlaylistNode" target_node ON target_node."id" = ch."toNodeId"
JOIN "ExplorationPage" target_page ON target_page."playlistId" = target_node."playlistId" AND target_page."key" = 'legacy-node-' || target_node."id";
