import type { Prisma } from "@prisma/client";

export const MIN_DIFFICULTY_VOTES = 3;
export const EDITORIAL_DIFFICULTY_WEIGHT = 3;

export function stabilizedDifficulty(editorialDifficulty: number | null, votes: number[]) {
  if (editorialDifficulty === null) return null;
  if (votes.length < MIN_DIFFICULTY_VOTES) return editorialDifficulty;
  const total = EDITORIAL_DIFFICULTY_WEIGHT * editorialDifficulty
    + votes.reduce((sum, value) => sum + value, 0);
  return Math.max(1, Math.min(100, Math.round(total / (EDITORIAL_DIFFICULTY_WEIGHT + votes.length))));
}

export async function recalculateProblemDifficulty(
  tx: Prisma.TransactionClient,
  translationGroupId: string
) {
  const [representative, votes] = await Promise.all([
    tx.problem.findFirst({
      where: { translationGroupId },
      orderBy: { id: "asc" },
      select: { editorialDifficulty: true, difficulty: true }
    }),
    tx.problemDifficultyVote.findMany({
      where: { translationGroupId },
      select: { value: true }
    })
  ]);
  if (!representative) return null;
  const editorialDifficulty = representative.editorialDifficulty ?? representative.difficulty;
  const difficulty = stabilizedDifficulty(editorialDifficulty, votes.map((vote) => vote.value));
  await tx.problem.updateMany({ where: { translationGroupId }, data: { difficulty } });
  return difficulty;
}
