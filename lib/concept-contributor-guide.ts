import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGuideMarkdown } from "@/lib/concept-guide-files";
import { prisma } from "@/lib/db";
import {
  canUseStoredConceptContributorGuide,
  type StoredConceptContributorGuide
} from "@/lib/concept-contributor-guide-locale";
import type { InterfaceLocale } from "@/lib/i18n/types";
import { renderMarkdown } from "@/lib/markdown";

export type ConceptContributorGuideContent = {
  language: InterfaceLocale;
  title: string;
  description: string;
  bodyMarkdown: string;
};

// The public guide sources live in content/guides/concepts/{en,fr}.md.
// The database remains editable; deployment synchronizes it with these files.
export const DEFAULT_CONCEPT_CONTRIBUTOR_GUIDES: Record<InterfaceLocale, ConceptContributorGuideContent> = {
  en: parseGuideMarkdown(readFileSync(join(process.cwd(), "content/guides/concepts/en.md"), "utf8"), "en"),
  fr: parseGuideMarkdown(readFileSync(join(process.cwd(), "content/guides/concepts/fr.md"), "utf8"), "fr")
};
export function conceptContributorGuideForLocale(
  stored: StoredConceptContributorGuide | null | undefined,
  locale: InterfaceLocale
): ConceptContributorGuideContent {
  if (stored && canUseStoredConceptContributorGuide(stored, locale)) {
    return {
      language: locale,
      title: stored.title,
      description: stored.description,
      bodyMarkdown: stored.bodyMarkdown
    };
  }

  return DEFAULT_CONCEPT_CONTRIBUTOR_GUIDES[locale];
}

export async function loadConceptContributorGuide(locale: InterfaceLocale) {
  const stored = await prisma.conceptContributorGuideContent.findUnique({ where: { language: locale } });
  return conceptContributorGuideForLocale(stored, locale);
}

export async function loadRenderedConceptContributorGuide(locale: InterfaceLocale) {
  const content = await loadConceptContributorGuide(locale);
  return {
    ...content,
    bodyHtml: await renderMarkdown(content.bodyMarkdown)
  };
}
