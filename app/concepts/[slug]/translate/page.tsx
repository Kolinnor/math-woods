import { notFound, redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseContentLanguage } from "@/lib/languages";
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
  const concept = await prisma.concept.findUnique({
    where: { slug },
    select: { slug: true }
  });

  if (!concept) notFound();

  const language = parseContentLanguage(queryParams.language ?? queryParams.to ?? preferredLanguage);
  redirect(`/concepts/new?translateOf=${concept.slug}&language=${language}`);
}
