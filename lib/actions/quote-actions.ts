"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth";
import { boundedText, CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";
import { ensureSlug } from "@/lib/slug";
import { uniqueSlug } from "@/lib/unique-slug";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

function parseSlugList(value: FormDataEntryValue | null): string[] {
  const seen = new Set<string>();
  const slugs = String(value ?? "")
    .split(/[\s,;]+/)
    .map((item) => ensureSlug(item, ""))
    .filter(Boolean);

  return slugs.filter((slug) => {
    if (seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });
}

export async function createQuoteAction(formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`quote:${user.id}`, 8, 60_000);

  const text = requiredBoundedText(formData.get("text"), CONTENT_LIMITS.mediumText, "Quote text");
  const attributedTo = boundedText(formData.get("attributedTo"), CONTENT_LIMITS.title, "Attribution") || null;
  const provenance = boundedText(formData.get("provenance"), CONTENT_LIMITS.shortText, "Provenance") || "Unknown";
  const provenanceDetails = boundedText(formData.get("provenanceDetails"), CONTENT_LIMITS.longNote, "Provenance details") || null;
  const noteMarkdown = boundedText(formData.get("noteMarkdown"), CONTENT_LIMITS.longNote, "Quote note") || null;
  const problemSlugs = parseSlugList(formData.get("problemSlugs"));
  const conceptSlugs = parseSlugList(formData.get("conceptSlugs"));

  const slugSource = attributedTo ? `${attributedTo} ${text}` : text;
  const slug = await uniqueSlug("quote", slugSource);
  const noteHtml = noteMarkdown ? await renderMarkdownContent(noteMarkdown) : null;

  const [problems, concepts] = await Promise.all([
    problemSlugs.length
      ? prisma.problem.findMany({
          where: { slug: { in: problemSlugs } },
          select: { id: true }
        })
      : [],
    conceptSlugs.length
      ? prisma.concept.findMany({
          where: { slug: { in: conceptSlugs } },
          select: { id: true }
        })
      : []
  ]);

  const quote = await prisma.quote.create({
    data: {
      slug,
      text,
      attributedTo,
      provenance,
      provenanceDetails,
      noteMarkdown,
      noteHtml,
      contributorId: user.id,
      relatedProblems: {
        create: problems.map((problem) => ({ problemId: problem.id }))
      },
      relatedConcepts: {
        create: concepts.map((concept) => ({ conceptId: concept.id }))
      }
    }
  });

  revalidatePath("/quotes");
  revalidatePath("/search");
  redirect(`/quotes/${quote.slug}`);
}
