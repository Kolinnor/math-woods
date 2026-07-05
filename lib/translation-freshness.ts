import { SourceType } from "@prisma/client";
import { prisma } from "@/lib/db";

type TranslationSource = {
  id: number;
  slug: string;
  title: string;
  language: string;
} | null;

export type TranslationFreshness = {
  basedOnRevisionId: number | null;
  latestRevisionId: number | null;
  sourceHref: string;
  sourceLanguage: string;
  sourceTitle: string;
  stale: boolean;
};

export async function problemTranslationFreshness(
  source: TranslationSource,
  basedOnRevisionId: number | null
): Promise<TranslationFreshness | null> {
  if (!source) return null;
  const latestRevision = await prisma.pageRevision.findFirst({
    where: { pageType: SourceType.PROBLEM, pageId: source.id },
    orderBy: { id: "desc" },
    select: { id: true }
  });

  return {
    basedOnRevisionId,
    latestRevisionId: latestRevision?.id ?? null,
    sourceHref: `/problems/${source.slug}`,
    sourceLanguage: source.language,
    sourceTitle: source.title,
    stale: Boolean(latestRevision && basedOnRevisionId && latestRevision.id > basedOnRevisionId)
  };
}

export async function conceptTranslationFreshness(
  source: TranslationSource,
  basedOnRevisionId: number | null
): Promise<TranslationFreshness | null> {
  if (!source) return null;
  const latestRevision = await prisma.pageRevision.findFirst({
    where: { pageType: SourceType.CONCEPT, pageId: source.id },
    orderBy: { id: "desc" },
    select: { id: true }
  });

  return {
    basedOnRevisionId,
    latestRevisionId: latestRevision?.id ?? null,
    sourceHref: `/concepts/${source.slug}`,
    sourceLanguage: source.language,
    sourceTitle: source.title,
    stale: Boolean(latestRevision && basedOnRevisionId && latestRevision.id > basedOnRevisionId)
  };
}
