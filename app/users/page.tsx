import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { roleLabel } from "@/lib/roles";
import { getReputationLeaderboard, type UserReputationSummary } from "@/lib/user-reputation";
import { displayNameForUser } from "@/lib/user-display";
import { UsersRankingSelect } from "./UsersRankingSelect";

export const dynamic = "force-dynamic";

type RankingMode = "reputation" | "favorites" | "solved" | "problems";

const rankingOptions: Array<{
  value: RankingMode;
  label: string;
  title: string;
  subtitle: string;
}> = [
  {
    value: "reputation",
    label: "Reputation",
    title: "Ranking by reputation",
    subtitle: "Reputation is calculated based on various criteria for quality submissions."
  },
  {
    value: "favorites",
    label: "Number of favorites",
    title: "Ranking by favorites",
    subtitle: "Problems that other members have saved as favorites."
  },
  {
    value: "solved",
    label: "Number of solved",
    title: "Ranking by solved problems",
    subtitle: "Problems that other members have marked as solved."
  },
  {
    value: "problems",
    label: "Number of problems",
    title: "Ranking by problems created",
    subtitle: "All members, ranked by how many problems they have created."
  }
];

function parseRankingMode(value: string | undefined): RankingMode {
  return rankingOptions.some((option) => option.value === value) ? (value as RankingMode) : "reputation";
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
  const mode = parseRankingMode((await searchParams).sort);
  const selectedOption = rankingOptions.find((option) => option.value === mode) ?? rankingOptions[0];
  const users = sortUsers(await getReputationLeaderboard(), mode);

  return (
    <ForestPageLayout
      title="Users"
      eyebrow="Community"
      heroImage="/art/users-forest.webp"
      heroAlt="Ivan Shishkin, The Forest Clearing"
      description="A quiet leaderboard for contributors, solvers, and problem writers."
      meta={
        <>
          <p>{users.length} members</p>
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
          <UsersRankingSelect options={rankingOptions} value={mode} />
        </div>
        <p className="result-summary">{users.length} members</p>

        <div className="users-list">
          {users.map((user, index) => (
            <Link key={user.userId} href={`/profile/${user.username}`} className="users-row">
              <span className="users-rank">#{index + 1}</span>
              <span className="users-main">
                <strong>{displayNameForUser(user)}</strong>
                <small>{roleLabel(user.role)}</small>
              </span>
              <span className="users-stat">
                <strong>{user.reputation}</strong>
                <small>reputation</small>
              </span>
              <span className="users-stat">
                <strong>{user.problemCount}</strong>
                <small>problems</small>
              </span>
              <span className="users-stat">
                <strong>{user.favoriteCount}</strong>
                <small>favorites</small>
              </span>
              <span className="users-stat">
                <strong>{user.solvedCount}</strong>
                <small>solved</small>
              </span>
            </Link>
          ))}
          {users.length === 0 && <p className="empty-state">No users yet.</p>}
        </div>
      </section>
    </ForestPageLayout>
  );
}
