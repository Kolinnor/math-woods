import { notFound, redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseContentLanguage } from "@/lib/languages";
import { getPreferredContentLanguage } from "@/lib/server-language";

export default async function TranslateProblemPage({
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
  const problem = await prisma.problem.findUnique({
    where: { slug },
    select: { slug: true, status: true }
  });

  if (!problem || problem.status === "ARCHIVED") notFound();

  const language = parseContentLanguage(queryParams.language ?? queryParams.to ?? preferredLanguage);
  redirect(`/problems/new?translateOf=${problem.slug}&language=${language}`);
}
