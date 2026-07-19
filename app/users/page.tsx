import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { getTranslations } from "@/lib/i18n/server";
import { getReputationLeaderboard, type UserReputationSummary } from "@/lib/user-reputation";
import { displayNameForUser } from "@/lib/user-display";
import { UsersRankingSelect } from "./UsersRankingSelect";

export const dynamic = "force-dynamic";

type RankingMode = "reputation" | "favorites" | "solved" | "problems";

const rankingModes: RankingMode[] = ["reputation", "favorites", "solved", "problems"];

function parseRankingMode(value: string | undefined): RankingMode {
  return rankingModes.includes(value as RankingMode) ? (value as RankingMode) : "reputation";
}

function rankingValue(user: UserReputationSummary, mode: RankingMode) {
  if (mode === "favorites") return user.favoriteCount;
  if (mode === "solved") return user.solvedCount;
  if (mode === "problems") return user.problemCount;
  return user.reputation;
}

function sortUsers(users: UserReputationSummary[], mode: RankingMode) {
  return [...users].sort((left, right) => {
    const rightValue = rankingValue(right, mode);
    const leftValue = rankingValue(left, mode);
    if (rightValue !== leftValue) return rightValue - leftValue;
    if (right.reputation !== left.reputation) return right.reputation - left.reputation;
    if (right.problemCount !== left.problemCount) return right.problemCount - left.problemCount;
    return left.username.localeCompare(right.username);
  });
}

export default async function UsersPage({
  searchParams
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const t = await getTranslations();
  const mode = parseRankingMode((await searchParams).sort);
  const rankingOptions = rankingModes.map((value) => ({ value, ...t.users.rankingOptions[value] }));
  const selectedOption = rankingOptions.find((option) => option.value === mode) ?? rankingOptions[0];
  const users = sortUsers(await getReputationLeaderboard(), mode);

  return (
    <ForestPageLayout
      title={t.users.title}
      heroImage="/art/users-forest.webp"
      heroAlt="Ivan Shishkin, The Forest Clearing"
      meta={
        <>
          <p>{t.users.members(users.length)}</p>
          <p>{selectedOption.label}</p>
        </>
      }
    >
      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{selectedOption.title}</h2>
            <p className="muted text-sm">{selectedOption.subtitle}</p>
          </div>
          <UsersRankingSelect options={rankingOptions} value={mode} label={t.users.rankingMode} />
        </div>
        <p className="result-summary">{t.users.members(users.length)}</p>

        <div className="users-list">
          {users.map((user, index) => (
            <Link key={user.userId} href={`/profile/${user.username}`} className="users-row">
              <span className="users-rank">#{index + 1}</span>
              <span className="users-main">
                <strong>{displayNameForUser(user)}</strong>
                <small>{t.users.roles[user.role]}</small>
              </span>
              <span className="users-stat">
                <strong>{user.reputation}</strong>
                <small>{t.users.stats.reputation}</small>
              </span>
              <span className="users-stat">
                <strong>{user.problemCount}</strong>
                <small>{t.users.stats.problems}</small>
              </span>
              <span className="users-stat">
                <strong>{user.favoriteCount}</strong>
                <small>{t.users.stats.favorites}</small>
              </span>
              <span className="users-stat">
                <strong>{user.solvedCount}</strong>
                <small>{t.users.stats.solved}</small>
              </span>
            </Link>
          ))}
          {users.length === 0 && <p className="empty-state">{t.users.noUsers}</p>}
        </div>
      </section>
    </ForestPageLayout>
  );
}
