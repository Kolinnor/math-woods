"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
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
  const user = await requireUser();
  await assertRateLimit(`quote:${user.id}`, 8, 60_000);

  const text = String(formData.get("text") ?? "").trim().slice(0, 1200);
  const attributedTo = String(formData.get("attributedTo") ?? "").trim().slice(0, 160) || null;
  const provenance = String(formData.get("provenance") ?? "").trim().slice(0, 240) || "Unknown";
  const provenanceDetails = String(formData.get("provenanceDetails") ?? "").trim().slice(0, 3000) || null;
  const noteMarkdown = String(formData.get("noteMarkdown") ?? "").trim().slice(0, 3000) || null;
  const problemSlugs = parseSlugList(formData.get("problemSlugs"));
  const conceptSlugs = parseSlugList(formData.get("conceptSlugs"));

  if (!text) throw new Error("Quote text is required.");

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
