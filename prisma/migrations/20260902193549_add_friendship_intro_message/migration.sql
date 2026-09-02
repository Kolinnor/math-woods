-- DropIndex
DROP INDEX "Problem_listed_status_createdAt_idx";

-- DropIndex
DROP INDEX "ProblemDomain_spoiler_idx";

-- AlterTable
ALTER TABLE "ExplorationAnswer" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ExplorationBlock" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ExplorationBlockOutcome" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ExplorationBranch" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ExplorationPage" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ExplorationSession" ALTER COLUMN "lastSeenAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Friendship" ADD COLUMN     "introMessage" TEXT;

-- AlterTable
ALTER TABLE "LatexPreference" ALTER COLUMN "customCommands" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Mathematician" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Report" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "SiteImprovementCompletionReview_improvementId_status_createdAt_" RENAME TO "SiteImprovementCompletionReview_improvementId_status_create_idx";
