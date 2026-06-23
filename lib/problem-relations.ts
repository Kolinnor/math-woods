import type { Prisma } from "@prisma/client";
import { ensureSlug } from "@/lib/slug";

export const SPECIFIC_TO_THIS_PROBLEM_GROUP = "Specific to this problem";

type RelationInputGroup = {
  title: string;
  slugs: string[];
};

type RelationGroupForTextarea = {
  title: string;
  relations: { targetProblem: { slug: string } }[];
};

export function parseProblemRelationGroups(input: FormDataEntryValue | string | null | undefined): RelationInputGroup[] {
  const lines = String(input ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const groups = new Map<string, string[]>();

  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const title = line.slice(0, separator).trim();
    const slugs = line
      .slice(separator + 1)
      .split(/[,\s]+/)
      .map((slug) => ensureSlug(slug, ""))
      .filter(Boolean);
    if (!title || slugs.length === 0) continue;
    groups.set(title, Array.from(new Set([...(groups.get(title) ?? []), ...slugs])));
  }

  return Array.from(groups, ([title, slugs]) => ({ title, slugs }));
}

export function formatProblemRelationGroupsForTextarea(groups: RelationGroupForTextarea[]) {
  return groups
    .map((group) => {
      const slugs = group.relations.map((relation) => relation.targetProblem.slug).join(", ");
      return slugs ? `${group.title}: ${slugs}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export async function syncProblemRelationGroups(
  tx: Prisma.TransactionClient,
  sourceProblemId: number,
  input: FormDataEntryValue | string | null | undefined
) {
  const groups = parseProblemRelationGroups(input);
  await tx.problemRelationGroup.deleteMany({ where: { sourceProblemId } });

  for (const [groupIndex, group] of groups.entries()) {
    const targets = await tx.problem.findMany({
      where: {
        slug: { in: group.slugs },
        id: { not: sourceProblemId },
        status: { not: "ARCHIVED" }
      },
      select: { id: true, slug: true }
    });
    const targetBySlug = new Map(targets.map((target) => [target.slug, target]));
    const orderedTargets = group.slugs
      .map((slug) => targetBySlug.get(slug))
      .filter((target): target is { id: number; slug: string } => Boolean(target));

    if (orderedTargets.length === 0) continue;

    await tx.problemRelationGroup.create({
      data: {
        sourceProblemId,
        title: group.title,
        position: groupIndex + 1,
        relations: {
          create: orderedTargets.map((target, relationIndex) => ({
            targetProblemId: target.id,
            position: relationIndex + 1
          }))
        }
      }
    });
  }
}

export async function linkSpecificProblem(
  tx: Prisma.TransactionClient,
  sourceProblemId: number,
  targetProblemId: number
) {
  if (sourceProblemId === targetProblemId) return;

  const group = await tx.problemRelationGroup.upsert({
    where: {
      sourceProblemId_title: {
        sourceProblemId,
        title: SPECIFIC_TO_THIS_PROBLEM_GROUP
      }
    },
    update: {},
    create: {
      sourceProblemId,
      title: SPECIFIC_TO_THIS_PROBLEM_GROUP,
      position: 999
    },
    select: { id: true }
  });
  const lastRelation = await tx.problemRelation.findFirst({
    where: { groupId: group.id },
    orderBy: { position: "desc" },
    select: { position: true }
  });

  await tx.problemRelation.upsert({
    where: {
      groupId_targetProblemId: {
        groupId: group.id,
        targetProblemId
      }
    },
    update: {},
    create: {
      groupId: group.id,
      targetProblemId,
      position: (lastRelation?.position ?? 0) + 1
    }
  });
}
