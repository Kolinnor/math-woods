import { Trophy } from "lucide-react";
import Link from "next/link";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { prisma } from "@/lib/db";

export async function ProblemContestNotice({ translationGroupId, locale }: {
  translationGroupId: string;
  locale: "fr" | "en";
}) {
  // The entry belongs to the whole problem, including its translations.
  const entry = await prisma.problemContestSubmission.findFirst({
    where: { translationGroupId, problem: { status: "PUBLISHED" }, contest: { publishedAt: { not: null } } },
    orderBy: [{ contest: { startDateKey: "desc" } }, { id: "desc" }],
    select: {
      placement: true,
      contest: { select: { titleFr: true, titleEn: true, startDateKey: true, resultsPublishedAt: true } }
    }
  });
  if (!entry) return null;

  const { contest } = entry;
  const placement = contest.resultsPublishedAt ? entry.placement : null;
  const fr = locale === "fr";
  const label = placement === "WINNER"
    ? (fr ? "Problème lauréat du concours" : "Winning entry in")
    : placement === "HONORABLE_MENTION"
      ? (fr ? "Mention honorable au concours" : "Honorable mention in")
      : (fr ? "Ce problème a été soumis au concours" : "This problem was submitted to");

  return (
    <p className="problem-contest-notice">
      <Trophy size={15} aria-hidden="true" />
      <span>{label}{" "}
        <Link href={`/contest?week=${contest.startDateKey}`}>
          {fr ? "« " : "“"}<AsyncMarkdownInline markdown={fr ? contest.titleFr : contest.titleEn} />{fr ? " »" : "”"}
        </Link>.
      </span>
    </p>
  );
}
