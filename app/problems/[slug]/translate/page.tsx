import { notFound, redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth";
import { parseProblemTranslationTaskKey } from "@/lib/contribution-tasks";
import { prisma } from "@/lib/db";
import { parseActiveContentLanguage } from "@/lib/languages";
import { getPreferredContentLanguage } from "@/lib/server-language";

export default async function TranslateProblemPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ completed?: string; language?: string; task?: string; to?: string }>;
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

  const language = parseActiveContentLanguage(queryParams.language ?? queryParams.to ?? preferredLanguage);
  const task = parseProblemTranslationTaskKey(queryParams.task);
  const nextParams = new URLSearchParams({ translateOf: problem.slug, language });
  if (task) nextParams.set("task", task);
  if (task && queryParams.completed) nextParams.set("completed", queryParams.completed);
  redirect(`/problems/new?${nextParams.toString()}`);
}
