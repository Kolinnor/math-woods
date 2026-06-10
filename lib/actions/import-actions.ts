"use server";

import { SourceType } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  getBooleanAttribute,
  getNumberAttribute,
  getStringArrayAttribute,
  getStringAttribute,
  parseMarkdownDocument
} from "@/lib/frontmatter";
import { prisma } from "@/lib/db";
import { parseAliases, syncConceptAliases } from "@/lib/concept-metadata";
import { parseMathDomain } from "@/lib/domains";
import { syncInternalLinks } from "@/lib/internal-links";
import { parseContentLicense } from "@/lib/licenses";
import { MAX_PROBLEM_DIFFICULTY, MIN_PROBLEM_DIFFICULTY } from "@/lib/problems";
import { parseContributorQualityStatus } from "@/lib/quality";
import { syncProblemTags } from "@/lib/tags";
import { uniqueSlug } from "@/lib/unique-slug";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

export async function importMarkdownAction(formData: FormData) {
  const user = await requireUser();
  const importType = String(formData.get("importType") ?? "problem");
  const markdown = String(formData.get("markdown") ?? "").trim();

  if (!markdown) throw new Error("Markdown content is required.");

  const parsed = parseMarkdownDocument(markdown);
  const explicitTitle = String(formData.get("title") ?? "").trim();
  const title =
    explicitTitle ||
    getStringAttribute(parsed.attributes, "title") ||
    firstMarkdownHeading(parsed.body) ||
    "Untitled";

  if (importType === "concept") {
    const slug = await uniqueSlug("concept", title);
    const concept = await prisma.$transaction(async (tx) => {
      const created = await tx.concept.create({
        data: {
          slug,
          title,
          bodyMarkdown: parsed.body,
          bodyHtml: await renderMarkdownContent(parsed.body),
          domain: parseMathDomain(getStringAttribute(parsed.attributes, "domain") ?? null),
          createdById: user.id,
          lastEditedById: user.id
        }
      });

      await syncInternalLinks(SourceType.CONCEPT, created.id, parsed.body, tx);
      await syncConceptAliases(
        created.id,
        parseAliases(getStringArrayAttribute(parsed.attributes, "aliases").join(",")),
        tx
      );
      await tx.pageRevision.create({
        data: {
          pageType: SourceType.CONCEPT,
          pageId: created.id,
          markdown: parsed.body,
          editedById: user.id,
          editSummary: "Imported from Markdown"
        }
      });

      return created;
    });

    redirect(`/concepts/${concept.slug}`);
  }

  const slug = await uniqueSlug("problem", title);
  const tags = getStringArrayAttribute(parsed.attributes, "tags");
  const importedDifficulty = getNumberAttribute(parsed.attributes, "difficulty");
  const difficulty =
    Number.isInteger(importedDifficulty) &&
    importedDifficulty! >= MIN_PROBLEM_DIFFICULTY &&
    importedDifficulty! <= MAX_PROBLEM_DIFFICULTY
      ? importedDifficulty
      : null;
  const problem = await prisma.$transaction(async (tx) => {
    const created = await tx.problem.create({
      data: {
        slug,
        title,
        bodyMarkdown: parsed.body,
        bodyHtml: await renderMarkdownContent(parsed.body),
        difficulty,
        origin:
          getStringAttribute(parsed.attributes, "origin") ??
          getStringAttribute(parsed.attributes, "source") ??
          "Unknown",
        originChapter: getStringAttribute(parsed.attributes, "originChapter") ?? null,
        originPage: getStringAttribute(parsed.attributes, "originPage") ?? null,
        originNote: getStringAttribute(parsed.attributes, "originNote") ?? null,
        license: parseContentLicense(getStringAttribute(parsed.attributes, "license")),
        listed: getBooleanAttribute(parsed.attributes, "listed") ?? true,
        qualityStatus: parseContributorQualityStatus(getStringAttribute(parsed.attributes, "qualityStatus") ?? null, user.role),
        authorId: user.id,
        thread: { create: {} }
      }
    });

    await syncInternalLinks(SourceType.PROBLEM, created.id, parsed.body, tx);
    await syncProblemTags(created.id, tags.join(", "), tx);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.PROBLEM,
        pageId: created.id,
        markdown: parsed.body,
        editedById: user.id,
        editSummary: "Imported from Markdown"
      }
    });

    return created;
  });

  redirect(`/problems/${problem.slug}`);
}

function firstMarkdownHeading(markdown: string): string | undefined {
  const heading = markdown.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim();
}
