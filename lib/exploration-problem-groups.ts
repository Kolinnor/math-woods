import type { Prisma } from "@prisma/client";
import { parseProblemRelationGroups } from "@/lib/problem-relations";

export async function syncExplorationProblemGroups(
  tx: Prisma.TransactionClient,
  blockId: number,
  input: FormDataEntryValue | string | null | undefined
) {
  const groups = parseProblemRelationGroups(input);
  await tx.explorationBlockProblemGroup.deleteMany({ where: { blockId } });

  for (const [groupIndex, group] of groups.entries()) {
    const problems = await tx.problem.findMany({
      where: { slug: { in: group.slugs }, status: { not: "ARCHIVED" } },
      select: { id: true, slug: true }
    });
    const problemBySlug = new Map(problems.map((problem) => [problem.slug, problem]));
    const orderedProblems = group.slugs
      .map((slug) => problemBySlug.get(slug))
      .filter((problem): problem is { id: number; slug: string } => Boolean(problem));
    if (orderedProblems.length === 0) continue;

    await tx.explorationBlockProblemGroup.create({
      data: {
        blockId,
        title: group.title,
        position: groupIndex + 1,
        problems: {
          create: orderedProblems.map((problem, problemIndex) => ({
            problemId: problem.id,
            position: problemIndex + 1
          }))
        }
      }
    });
  }
}
