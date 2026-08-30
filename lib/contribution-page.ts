import { prisma } from "@/lib/db";
import { localizeContributionPage } from "@/lib/contribution-page-copy";
import type { InterfaceLocale } from "@/lib/i18n/types";
import { renderMarkdown } from "@/lib/markdown";

export type ContributionPageContent = {
  id?: number;
  title: string;
  requestEyebrow: string;
  requestTitle: string;
  requestIntro: string;
};

export type ContributionPageSectionContent = {
  id?: number;
  position: number;
  title: string;
  bodyMarkdown: string;
};

export type RenderedContributionPageSection = ContributionPageSectionContent & {
  bodyHtml: string;
};

export const DEFAULT_CONTRIBUTION_PAGE_CONTENT: ContributionPageContent = {
  title: "Requests",
  requestEyebrow: "Requests",
  requestTitle: "Requested problems and concepts",
  requestIntro:
    "Ask for the pages you would like to see from the problem and concept browsers. Trusted contributors can claim a request, work on it, release it if they stop, and mark it complete when the page or problem exists."
};

export const DEFAULT_CONTRIBUTION_PAGE_SECTIONS: ContributionPageSectionContent[] = [];

export async function ensureEditableContributionPage() {
  const [content, sectionCount] = await Promise.all([
    prisma.contributionPageContent.findUnique({ where: { id: 1 }, select: { id: true } }),
    prisma.contributionPageSection.count()
  ]);

  if (content && (sectionCount > 0 || DEFAULT_CONTRIBUTION_PAGE_SECTIONS.length === 0)) return;

  await prisma.$transaction(async (tx) => {
    if (!content) {
      await tx.contributionPageContent.create({
        data: {
          id: 1,
          ...DEFAULT_CONTRIBUTION_PAGE_CONTENT
        }
      });
    }

    if (sectionCount === 0 && DEFAULT_CONTRIBUTION_PAGE_SECTIONS.length > 0) {
      await tx.contributionPageSection.createMany({
        data: DEFAULT_CONTRIBUTION_PAGE_SECTIONS.map((section) => ({
          position: section.position,
          title: section.title,
          bodyMarkdown: section.bodyMarkdown
        }))
      });
    }
  });
}

export async function loadContributionPage() {
  const [content, sections] = await Promise.all([
    prisma.contributionPageContent.findUnique({ where: { id: 1 } }),
    prisma.contributionPageSection.findMany({
      orderBy: [{ position: "asc" }, { id: "asc" }]
    })
  ]);

  return {
    content: content ?? DEFAULT_CONTRIBUTION_PAGE_CONTENT,
    sections: sections.length ? sections : DEFAULT_CONTRIBUTION_PAGE_SECTIONS
  };
}

export async function loadRenderedContributionPage(locale: InterfaceLocale) {
  const page = localizeContributionPage(await loadContributionPage(), locale);

  return {
    content: page.content,
    sections: await Promise.all(
      page.sections.map(async (section) => ({
        ...section,
        bodyHtml: await renderMarkdown(section.bodyMarkdown)
      }))
    )
  };
}

export async function loadEditableContributionPage() {
  await ensureEditableContributionPage();

  const [content, sections] = await Promise.all([
    prisma.contributionPageContent.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.contributionPageSection.findMany({
      orderBy: [{ position: "asc" }, { id: "asc" }]
    })
  ]);

  return { content, sections };
}
