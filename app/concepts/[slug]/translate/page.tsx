import { notFound, redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseActiveContentLanguage } from "@/lib/languages";
import { getPreferredContentLanguage } from "@/lib/server-language";

export default async function TranslateConceptPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ language?: string; to?: string }>;
}) {
  await requireVerifiedUser();
  const [{ slug }, queryParams, preferredLanguage] = await Promise.all([
    params,
    searchParams,
    getPreferredContentLanguage()
  ]);
  const language = parseActiveContentLanguage(queryParams.language ?? queryParams.to ?? preferredLanguage);
  const concept = await prisma.concept.findUnique({
    where: { slug },
    select: { slug: true }
  });

  if (!concept) {
    const merged = await prisma.conceptRedirect.findUnique({
      where: { sourceSlug: slug },
      include: { targetConcept: true }
    });
    if (merged) redirect(`/concepts/${merged.targetConcept.slug}/translate?language=${encodeURIComponent(language)}`);
    notFound();
  }

  redirect(`/concepts/new?translateOf=${concept.slug}&language=${language}`);
}
