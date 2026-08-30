import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { Difficulty } from "@/components/Difficulty";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { UserAvatar } from "@/components/UserAvatar";
import { displayNameForUser } from "@/lib/user-display";
import Link from "next/link";

type CardUser = {
  id?: number | string;
  avatarBackground?: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
  username: string;
};

type DailyProblemCardProps = {
  problem: {
    slug: string;
    title: string;
    difficulty: number | null;
    language: string;
    author: CardUser;
  };
  domainLabel: string;
  imageUrl: string;
  imagePosition: string;
  expectedLanguage: string;
  labels: {
    heading: string;
    by: string;
    action: string;
    solved: (count: number) => string;
  };
  solvers?: Array<{ user: CardUser }>;
};

export function DailyProblemCard({
  problem,
  domainLabel,
  imageUrl,
  imagePosition,
  expectedLanguage,
  labels,
  solvers = []
}: DailyProblemCardProps) {
  return (
    <Link href={`/problems/${problem.slug}`} className="home-daily-problem" data-tour-target="daily">
      <div>
        <p className="mw-kicker">{labels.heading}</p>
        <h2><AsyncMarkdownInline markdown={problem.title} /><ContentLanguageFallback language={problem.language} expectedLanguage={expectedLanguage} /></h2>
        <p className="home-dashboard-author">
          <UserAvatar user={problem.author} size="xs" />
          {labels.by} {displayNameForUser(problem.author)}
        </p>
        <div className="home-daily-meta">
          <span>{domainLabel}</span>
          <Difficulty value={problem.difficulty} compact showBand />
        </div>
        <div className="home-daily-action">
          <span className="mw-primary-button">{labels.action}</span>
          {solvers.length > 0 && (
            <>
              <span className="home-solver-stack">
                {solvers.slice(0, 4).map(({ user: solver }, index) => (
                  <UserAvatar key={solver.id ?? `${solver.username}-${index}`} user={solver} size="sm" />
                ))}
              </span>
              <small>{labels.solved(solvers.length)}</small>
            </>
          )}
        </div>
      </div>
      <div className="home-daily-art" aria-hidden="true">
        <img src={imageUrl} alt="" style={{ objectPosition: imagePosition }} />
      </div>
    </Link>
  );
}
