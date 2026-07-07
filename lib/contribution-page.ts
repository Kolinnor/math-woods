import { prisma } from "@/lib/db";
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
  title: "Contribution",
  requestEyebrow: "Requests",
  requestTitle: "Requested problems and concepts",
  requestIntro:
    "Ask for the pages you would like to see from the problem and concept browsers. Trusted contributors can claim a request, work on it, release it if they stop, and mark it complete when the page or problem exists."
};

export const DEFAULT_CONTRIBUTION_PAGE_SECTIONS: ContributionPageSectionContent[] = [
  {
    position: 0,
    title: "Do not wait for perfection.",
    bodyMarkdown:
      "A clean problem, a stub concept, a source note, a partial solution, or a correction request can already help."
  },
  {
    position: 1,
    title: "Make rough work visible",
    bodyMarkdown:
      "Mark unfinished material honestly. Use **Needs work**, stub statuses, talk pages, edit summaries, and reports. A rough page with clear uncertainty is useful."
  },
  {
    position: 2,
    title: "Keep barriers low",
    bodyMarkdown:
      "Beginners should be able to add examples, ask for clarification, report copied wording, propose a better hint, or create a missing concept."
  },
  {
    position: 3,
    title: "Write for verification",
    bodyMarkdown:
      "Cite reliable textbooks, papers, lecture notes, or established reference works when a claim needs support. If the source is uncertain, say so. Uncertainty is useful when it is visible."
  },
  {
    position: 4,
    title: "Prefer clarity over completeness",
    bodyMarkdown:
      "A useful first version can be short. Add definitions, examples, counterexamples, solutions, and links when they are ready."
  },
  {
    position: 5,
    title: "Make edits accountable",
    bodyMarkdown:
      "Use concise edit summaries. For disputed scope, terminology, or sources, discuss the change on the talk page before repeatedly rewriting it."
  },
  {
    position: 6,
    title: "Use reports without making them scary",
    bodyMarkdown:
      "Reports are not only for emergencies. They can flag copied wording, questionable origins, wrong statements, spoilers, or pages that need attention."
  }
];

export async function ensureEditableContributionPage() {
  const [content, sectionCount] = await Promise.all([
    prisma.contributionPageContent.findUnique({ where: { id: 1 }, select: { id: true } }),
    prisma.contributionPageSection.count()
  ]);

  if (content && sectionCount > 0) return;

  await prisma.$transaction(async (tx) => {
    if (!content) {
      await tx.contributionPageContent.create({
        data: {
          id: 1,
          ...DEFAULT_CONTRIBUTION_PAGE_CONTENT
        }
      });
    }

    if (sectionCount === 0) {
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

export async function loadRenderedContributionPage() {
  const page = await loadContributionPage();

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
