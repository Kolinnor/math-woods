import { notFound } from "next/navigation";
import { frontmatter, markdownResponse } from "@/lib/export-markdown";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewExploration } from "@/lib/explorations";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const exploration = await prisma.playlist.findUnique({
    where: { slug },
    include: {
      author: true,
      collaborators: true,
      pages: {
        orderBy: { position: "asc" },
        include: {
          blocks: {
            orderBy: { position: "asc" },
            include: {
              problem: { select: { slug: true, title: true } },
              concept: { select: { slug: true, title: true } },
              options: { include: { toPage: { select: { title: true } } }, orderBy: { position: "asc" } }
            }
          }
        }
      }
    }
  });
  if (!exploration || !canViewExploration(user, exploration)) notFound();

  const pagesMarkdown = exploration.pages.map((page) => {
    const blocks = page.blocks.map((block) => {
      if (block.kind === "DIVIDER") return "---";
      if (block.kind === "HEADING") return `### ${block.title || "Section"}`;
      if (block.kind === "PROBLEM" && block.problem) {
        return `### Problem: ${block.problem.title}\n\n[Open problem](/problems/${block.problem.slug})${block.bodyMarkdown ? `\n\n${block.bodyMarkdown}` : ""}`;
      }
      if (block.kind === "CONCEPT" && block.concept) {
        return `### Concept: ${block.concept.title}\n\n[Open concept](/concepts/${block.concept.slug})${block.bodyMarkdown ? `\n\n${block.bodyMarkdown}` : ""}`;
      }
      if (block.kind === "QUIZ") {
        const options = block.options.map((option) => `- [ ] ${option.label}`).join("\n");
        return `### Quiz: ${block.title || "Check your understanding"}\n\n${block.bodyMarkdown || ""}${options ? `\n\n${options}` : ""}`;
      }
      if (block.kind === "CHOICE") {
        const options = block.options
          .map((option) => `- ${option.label}${option.toPage ? ` -> ${option.toPage.title}` : ""}`)
          .join("\n");
        return `### ${block.title || "Choose a path"}\n\n${block.bodyMarkdown || ""}${options ? `\n\n${options}` : ""}`;
      }
      const heading = block.kind !== "MARKDOWN" && block.title ? `### ${block.title}\n\n` : block.title ? `### ${block.title}\n\n` : "";
      return `${heading}${block.bodyMarkdown || ""}`.trim();
    }).filter(Boolean).join("\n\n");
    return `## ${page.title}\n\n${page.summary ? `${page.summary}\n\n` : ""}${blocks}`;
  }).join("\n\n");

  const markdown = frontmatter({
    type: "exploration",
    title: exploration.title,
    slug: exploration.slug,
    language: exploration.language,
    translationGroupId: exploration.translationGroupId,
    author: exploration.author.username,
    visibility: exploration.visibility.toLowerCase(),
    status: exploration.status.toLowerCase(),
    license: exploration.license,
    domain: exploration.domain.toLowerCase(),
    estimatedMinutes: exploration.estimatedMinutes ?? undefined,
    difficulty: exploration.difficulty ?? undefined
  }) + `${exploration.descriptionMarkdown}\n\n${pagesMarkdown}\n`;

  return markdownResponse(markdown, `${exploration.slug}.md`);
}
