import { SourceType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { contentLanguageViewHref } from "@/lib/translation-routing";
import {
  latestConceptTextRevisionIdFromRevisions,
  latestProblemTextRevisionIdFromRevisions
} from "@/lib/translation-text-revisions";

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

export async function latestProblemTextRevisionId(pageId: number) {
  const revisions = await prisma.pageRevision.findMany({
    where: { pageType: SourceType.PROBLEM, pageId },
    orderBy: { id: "asc" },
    select: { id: true, markdown: true, problemSnapshot: true }
  });
  return latestProblemTextRevisionIdFromRevisions(revisions);
}

export async function latestConceptTextRevisionId(pageId: number) {
  const revisions = await prisma.pageRevision.findMany({
    where: { pageType: SourceType.CONCEPT, pageId },
    orderBy: { id: "asc" },
    select: { id: true, markdown: true, conceptTitle: true, conceptSnapshot: true }
  });
  return latestConceptTextRevisionIdFromRevisions(revisions);
}

export async function problemTranslationFreshness(
  source: TranslationSource,
  basedOnRevisionId: number | null
): Promise<TranslationFreshness | null> {
  if (!source) return null;
  const latestRevisionId = await latestProblemTextRevisionId(source.id);

  return {
    basedOnRevisionId,
    latestRevisionId,
    sourceHref: contentLanguageViewHref("/problems", source.slug, source.language),
    sourceLanguage: source.language,
    sourceTitle: source.title,
    stale: Boolean(latestRevisionId && basedOnRevisionId && latestRevisionId > basedOnRevisionId)
  };
}

export async function conceptTranslationFreshness(
  source: TranslationSource,
  basedOnRevisionId: number | null
): Promise<TranslationFreshness | null> {
  if (!source) return null;
  const latestRevisionId = await latestConceptTextRevisionId(source.id);

  return {
    basedOnRevisionId,
    latestRevisionId,
    sourceHref: contentLanguageViewHref("/concepts", source.slug, source.language),
    sourceLanguage: source.language,
    sourceTitle: source.title,
    stale: Boolean(latestRevisionId && basedOnRevisionId && latestRevisionId > basedOnRevisionId)
  };
}
