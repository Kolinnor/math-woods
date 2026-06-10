CREATE TYPE "PlaylistNodeKind" AS ENUM ('PROBLEM', 'CONCEPT', 'NOTE');

CREATE TABLE "PlaylistNode" (
    "id" SERIAL NOT NULL,
    "playlistId" INTEGER NOT NULL,
    "kind" "PlaylistNodeKind" NOT NULL DEFAULT 'NOTE',
    "problemId" INTEGER,
    "conceptId" INTEGER,
    "title" TEXT,
    "bodyMarkdown" TEXT,
    "bodyHtml" TEXT,
    "position" INTEGER NOT NULL,
    "isStart" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaylistNode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlaylistChoice" (
    "id" SERIAL NOT NULL,
    "fromNodeId" INTEGER NOT NULL,
    "toNodeId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaylistChoice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlaylistNode_playlistId_position_idx" ON "PlaylistNode"("playlistId", "position");
CREATE INDEX "PlaylistNode_problemId_idx" ON "PlaylistNode"("problemId");
CREATE INDEX "PlaylistNode_conceptId_idx" ON "PlaylistNode"("conceptId");
CREATE INDEX "PlaylistChoice_fromNodeId_position_idx" ON "PlaylistChoice"("fromNodeId", "position");
CREATE INDEX "PlaylistChoice_toNodeId_idx" ON "PlaylistChoice"("toNodeId");

ALTER TABLE "PlaylistNode" ADD CONSTRAINT "PlaylistNode_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaylistNode" ADD CONSTRAINT "PlaylistNode_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlaylistNode" ADD CONSTRAINT "PlaylistNode_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlaylistChoice" ADD CONSTRAINT "PlaylistChoice_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "PlaylistNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaylistChoice" ADD CONSTRAINT "PlaylistChoice_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "PlaylistNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
