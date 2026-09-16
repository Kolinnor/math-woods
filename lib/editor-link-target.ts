import { prisma } from "@/lib/db";
import { ensureSlug } from "@/lib/slug";
import { renderInlineMarkdown } from "@/lib/markdown";
import type { EditorLinkSuggestion } from "@/lib/editor-links";

// Resolve the selected destination directly: suggestion ranking and language grouping
// must not replace it with a similarly named page or another translation.
export async function resolveEditorLinkTarget(type: string, target: string): Promise<EditorLinkSuggestion | null> {
  const slug = ensureSlug(target, "");
  if (!slug) return null;
  if (type === "problem") {
    const historical = await prisma.problemRedirect.findUnique({ where: { sourceSlug: slug }, select: { targetProblemId: true } });
    const problem = await prisma.problem.findFirst({
      where: { ...(historical ? { id: historical.targetProblemId } : { slug }), status: "PUBLISHED", listed: true },
      select: { slug: true, title: true, language: true }
    });
    return problem ? { ...problem, targetType: "problem", aliases: [], titleHtml: await renderInlineMarkdown(problem.title) } : null;
  }
  if (type !== "concept") return null;
  const select = { slug: true, title: true, language: true, aliases: { select: { alias: true } } } as const;
  const direct = await prisma.concept.findUnique({ where: { slug }, select });
  const redirect = direct ? null : await prisma.conceptRedirect.findUnique({
    where: { sourceSlug: slug }, include: { targetConcept: { select } }
  });
  const concept = direct ?? redirect?.targetConcept ?? await prisma.concept.findFirst({
    where: { OR: [{ title: { equals: target, mode: "insensitive" } }, { aliases: { some: { aliasSlug: slug } } }] },
    select, orderBy: { id: "asc" }
  });
  return concept ? {
    ...concept, targetType: "concept", aliases: concept.aliases.map(alias => alias.alias),
    titleHtml: await renderInlineMarkdown(concept.title)
  } : null;
}
