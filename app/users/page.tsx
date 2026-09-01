import Link from "next/link";
import { LocateFixed, Search } from "lucide-react";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { UserAvatar } from "@/components/UserAvatar";
import { getCurrentUser } from "@/lib/auth";
import { formatCompactNumber } from "@/lib/compact-number";
import { getTranslations } from "@/lib/i18n/server";
import { normalizeSearchText } from "@/lib/search-ranking";
import { getReputationLeaderboard, type UserReputationSummary } from "@/lib/user-reputation";
import { displayNameForUser } from "@/lib/user-display";
import { UsersRankingSelect } from "./UsersRankingSelect";

export const dynamic = "force-dynamic";

type RankingMode = "reputation" | "favorites" | "solved" | "problems" | "solutions" | "dailyProblems" | "translations";

const rankingModes: RankingMode[] = [
  "reputation",
  "dailyProblems",
  "favorites",
  "solved",
  "problems",
  "solutions",
  "translations"
];
const USERS_PER_PAGE = 25;

function parseRankingMode(value: string | undefined): RankingMode {
  return rankingModes.includes(value as RankingMode) ? (value as RankingMode) : "reputation";
}

function rankingValue(user: UserReputationSummary, mode: RankingMode) {
  if (mode === "favorites") return user.favoriteCount;
  if (mode === "solved") return user.solvedCount;
  if (mode === "problems") return user.problemCount;
  if (mode === "solutions") return user.solutionCount;
  if (mode === "dailyProblems") return user.dailyProblemCount;
  if (mode === "translations") return user.translationCount;
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

function rankingPositions(users: UserReputationSummary[], mode: RankingMode) {
  const positions = new Map<number, number>();
  let previousValue: number | null = null;
  let previousPosition = 0;

  users.forEach((user, index) => {
    const value = rankingValue(user, mode);
    const position = previousValue === value ? previousPosition : index + 1;
    positions.set(user.userId, position);
    previousValue = value;
    previousPosition = position;
  });

  return positions;
}

function usersHref(mode: RankingMode, page: number, query: string) {
  const params = new URLSearchParams();
  if (mode !== "reputation") params.set("sort", mode);
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const queryString = params.toString();
  return queryString ? `/users?${queryString}` : "/users";
}

export default async function UsersPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; q?: string; sort?: string }>;
}) {
  const [t, currentUser] = await Promise.all([getTranslations(), getCurrentUser()]);
  const queryParams = await searchParams;
  const mode = parseRankingMode(queryParams.sort);
  const searchQuery = queryParams.q?.trim() ?? "";
  const normalizedQuery = normalizeSearchText(searchQuery);
  const rankingOptions = rankingModes.map((value) => ({ value, ...t.users.rankingOptions[value] }));
  const selectedOption = rankingOptions.find((option) => option.value === mode) ?? rankingOptions[0];
  const rankedUsers = sortUsers(await getReputationLeaderboard(), mode);
  const rankByUserId = rankingPositions(rankedUsers, mode);
  const currentUserIndex = currentUser
    ? rankedUsers.findIndex((rankedUser) => rankedUser.userId === currentUser.id)
    : -1;
  const currentUserRank = currentUserIndex >= 0 && currentUser
    ? rankByUserId.get(currentUser.id) ?? currentUserIndex + 1
    : null;
  const currentUserPage = currentUserIndex >= 0
    ? Math.floor(currentUserIndex / USERS_PER_PAGE) + 1
    : null;
  const users = normalizedQuery
    ? rankedUsers.filter((user) =>
        normalizeSearchText(
          [displayNameForUser(user), user.username, user.profileSlug].join(" ")
        ).includes(normalizedQuery)
      )
    : rankedUsers;
  const totalPages = Math.max(1, Math.ceil(users.length / USERS_PER_PAGE));
  const requestedPage = Math.max(1, Number.parseInt(queryParams.page ?? "1", 10) || 1);
  const currentPage = Math.min(requestedPage, totalPages);
  const firstUserIndex = (currentPage - 1) * USERS_PER_PAGE;
  const visibleUsers = users.slice(firstUserIndex, firstUserIndex + USERS_PER_PAGE);

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
          <div className="users-controls">
            <LiveSearchForm
              action="/users"
              className="users-search-form"
              updatingLabel={t.users.searchUpdating}
            >
              <label className="users-search-field">
                <span className="sr-only">{t.users.search}</span>
                <Search size={17} aria-hidden="true" />
                <input
                  name="q"
                  type="search"
                  defaultValue={searchQuery}
                  placeholder={t.users.searchPlaceholder}
                  autoComplete="off"
                />
              </label>
            </LiveSearchForm>
            <UsersRankingSelect options={rankingOptions} value={mode} label={t.users.rankingMode} />
          </div>
        </div>
        <p className="result-summary">{t.users.members(users.length)}</p>

        {currentUser && currentUserRank !== null && currentUserPage !== null && (
          <div className="users-current-position">
            <span>{t.users.yourPosition(currentUserRank)}</span>
            <Link
              href={`${usersHref(mode, currentUserPage, "")}#user-${currentUser.id}` as never}
              className="button secondary"
            >
              <LocateFixed size={16} aria-hidden="true" />
              {t.users.viewMyPosition}
            </Link>
          </div>
        )}

        <div className="users-list">
          {visibleUsers.map((user, index) => (
            <Link
              id={`user-${user.userId}`}
              key={user.userId}
              href={`/profile/${user.profileSlug}`}
              className={`users-row${user.userId === currentUser?.id ? " is-current-user" : ""}`}
            >
              <span className="users-rank">#{rankByUserId.get(user.userId) ?? firstUserIndex + index + 1}</span>
              <UserAvatar user={user} size="md" />
              <span className="users-main">
                <strong>
                  {displayNameForUser(user)}
                  {user.userId === currentUser?.id && <small className="users-you-label">{t.users.you}</small>}
                </strong>
                <small>{t.users.roles[user.role]}</small>
              </span>
              <span className="users-stat">
                <strong title={user.reputation >= 1_000 ? String(user.reputation) : undefined}>
                  {formatCompactNumber(user.reputation)}
                </strong>
                <small>{t.users.stats.reputation}</small>
              </span>
              <span className="users-stat">
                <strong>{user.problemCount}</strong>
                <small>{t.users.stats.problems}</small>
              </span>
              <span className="users-stat">
                <strong>{user.solutionCount}</strong>
                <small>{t.users.stats.solutions}</small>
              </span>
              <span className="users-stat">
                <strong>{user.translationCount}</strong>
                <small>{t.users.stats.translations}</small>
              </span>
              <span className="users-stat">
                <strong>{user.dailyProblemCount}</strong>
                <small>{t.users.stats.dailyProblems}</small>
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
          {visibleUsers.length === 0 && (
            <p className="empty-state">{searchQuery ? t.users.noMatches : t.users.noUsers}</p>
          )}
        </div>

        {totalPages > 1 && (
          <nav className="pagination" aria-label={t.users.paginationLabel}>
            {currentPage > 1 ? (
              <Link href={usersHref(mode, currentPage - 1, searchQuery) as never} aria-label={t.users.previous}>
                &larr;
              </Link>
            ) : (
              <span aria-disabled="true" aria-label={t.users.previous}>
                &larr;
              </span>
            )}
            <span className="pagination-status">{t.users.pageStatus(currentPage, totalPages)}</span>
            {currentPage < totalPages ? (
              <Link href={usersHref(mode, currentPage + 1, searchQuery) as never} aria-label={t.users.next}>
                &rarr;
              </Link>
            ) : (
              <span aria-disabled="true" aria-label={t.users.next}>
                &rarr;
              </span>
            )}
          </nav>
        )}
      </section>
    </ForestPageLayout>
  );
}
