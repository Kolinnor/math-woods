-- CreateEnum
CREATE TYPE "MathDomain" AS ENUM ('ANALYSIS', 'ALGEBRA', 'ARITHMETIC', 'GEOMETRY', 'COMBINATORICS', 'PROBABILITY', 'TOPOLOGY', 'LOGIC', 'OTHER');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('OPEN', 'PLANNED', 'CLOSED');

-- AlterTable
ALTER TABLE "Problem" ADD COLUMN     "domain" "MathDomain" NOT NULL DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE "ProblemFavorite" (
    "userId" INTEGER NOT NULL,
    "problemId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemFavorite_pkey" PRIMARY KEY ("userId","problemId")
);

-- CreateTable
CREATE TABLE "PlaylistFollow" (
    "userId" INTEGER NOT NULL,
    "playlistId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaylistFollow_pkey" PRIMARY KEY ("userId","playlistId")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" SERIAL NOT NULL,
    "authorId" INTEGER,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProblemFavorite_problemId_idx" ON "ProblemFavorite"("problemId");

-- CreateIndex
CREATE INDEX "PlaylistFollow_playlistId_idx" ON "PlaylistFollow"("playlistId");

-- CreateIndex
CREATE INDEX "Suggestion_status_createdAt_idx" ON "Suggestion"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ProblemFavorite" ADD CONSTRAINT "ProblemFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemFavorite" ADD CONSTRAINT "ProblemFavorite_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistFollow" ADD CONSTRAINT "PlaylistFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistFollow" ADD CONSTRAINT "PlaylistFollow_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
