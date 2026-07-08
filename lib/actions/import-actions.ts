"use server";

import { MathDomain, SourceType } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth";
import { boundedText, CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
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
import { refreshLinksForConceptId, syncInternalLinks } from "@/lib/internal-links";
import { parseContentLanguage } from "@/lib/languages";
import { parseProblemDomains, syncProblemDomains } from "@/lib/problem-domains";
import { MAX_PROBLEM_DIFFICULTY, MIN_PROBLEM_DIFFICULTY } from "@/lib/problems";
import { parseContributorQualityStatus } from "@/lib/quality";
import { assertRateLimit } from "@/lib/rate-limit";
import { syncProblemSpoilerTags, syncProblemTags } from "@/lib/tags";
import { uniqueSlug } from "@/lib/unique-slug";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

export async function importMarkdownAction(formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`markdown-import:${user.id}`, 4, 60_000);
  const importType = String(formData.get("importType") ?? "problem");
  const markdown = requiredBoundedText(formData.get("markdown"), CONTENT_LIMITS.importMarkdown, "Markdown content");

  const parsed = parseMarkdownDocument(markdown);
  const explicitTitle = boundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const title =
    explicitTitle ||
    getStringAttribute(parsed.attributes, "title") ||
    firstMarkdownHeading(parsed.body) ||
    "Untitled";
  const safeTitle = boundedText(title, CONTENT_LIMITS.title, "Title");
  const bodyMarkdown = requiredBoundedText(parsed.body, CONTENT_LIMITS.markdown, "Imported body");
  const language = parseContentLanguage(getStringAttribute(parsed.attributes, "language"));

  if (importType === "concept") {
    const slug = await uniqueSlug("concept", safeTitle);
    const concept = await prisma.$transaction(async (tx) => {
      const created = await tx.concept.create({
        data: {
          slug,
          language,
          title: safeTitle,
          bodyMarkdown,
          bodyHtml: await renderMarkdownContent(bodyMarkdown),
          domain: parseMathDomain(getStringAttribute(parsed.attributes, "domain") ?? null),
          createdById: user.id,
          lastEditedById: user.id
        }
      });

      await syncInternalLinks(SourceType.CONCEPT, created.id, bodyMarkdown, tx);
      await syncConceptAliases(
        created.id,
        parseAliases(getStringArrayAttribute(parsed.attributes, "aliases").join(",")),
        tx
      );
      await refreshLinksForConceptId(created.id, tx);
      await tx.pageRevision.create({
        data: {
          pageType: SourceType.CONCEPT,
          pageId: created.id,
          markdown: bodyMarkdown,
          editedById: user.id,
          editSummary: "Imported from Markdown"
        }
      });

      return created;
    });

    redirect(`/concepts/${concept.slug}`);
  }

  const slug = await uniqueSlug("problem", safeTitle);
  const tags = getStringArrayAttribute(parsed.attributes, "tags");
  const spoilerTags = getStringArrayAttribute(parsed.attributes, "spoilerTags");
  const domains = parseProblemDomains(
    getStringArrayAttribute(parsed.attributes, "domains"),
    getStringAttribute(parsed.attributes, "domain") ?? null,
    getStringArrayAttribute(parsed.attributes, "spoilerDomains")
  );
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
        language,
        title: safeTitle,
        bodyMarkdown,
        bodyHtml: await renderMarkdownContent(bodyMarkdown),
        difficulty,
        domain: domains.find((item) => !item.spoiler)?.domain ?? MathDomain.OTHER,
        origin:
          boundedText(
            getStringAttribute(parsed.attributes, "origin") ?? getStringAttribute(parsed.attributes, "source"),
            CONTENT_LIMITS.shortText,
            "Origin"
          ) ||
          "Unknown",
        originChapter: boundedText(getStringAttribute(parsed.attributes, "originChapter"), CONTENT_LIMITS.shortText, "Origin chapter") || null,
        originPage: boundedText(getStringAttribute(parsed.attributes, "originPage"), CONTENT_LIMITS.shortText, "Origin page") || null,
        originNote: boundedText(getStringAttribute(parsed.attributes, "originNote"), CONTENT_LIMITS.longNote, "Origin note") || null,
        listed: getBooleanAttribute(parsed.attributes, "listed") ?? true,
        qualityStatus: parseContributorQualityStatus(getStringAttribute(parsed.attributes, "qualityStatus") ?? null, user.role),
        authorId: user.id,
        thread: { create: {} }
      }
    });
    await tx.problemFavorite.create({
      data: {
        userId: user.id,
        problemId: created.id
      }
    });

    await syncInternalLinks(SourceType.PROBLEM, created.id, bodyMarkdown, tx);
    await syncProblemDomains(tx, created.id, domains);
    await syncProblemTags(created.id, tags.join(", "), tx);
    await syncProblemSpoilerTags(created.id, spoilerTags.join(", "), tx);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.PROBLEM,
        pageId: created.id,
        markdown: bodyMarkdown,
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
