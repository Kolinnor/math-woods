-- AlterTable
ALTER TABLE "Problem" ADD COLUMN     "reviewedById" INTEGER;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
