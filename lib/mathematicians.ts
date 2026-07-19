import { MathDomain, UserMathLevel } from "@prisma/client";
import { domainLabel } from "./domains.ts";
import type { UserReputationSummary } from "./user-reputation.ts";
import { displayNameForUser } from "./user-display.ts";

export type MathematicianSort = "reputation" | "contributions" | "problems" | "newest" | "name";

const MATHEMATICIAN_SORTS: MathematicianSort[] = ["reputation", "contributions", "problems", "newest", "name"];

export function parseMathematicianSort(value: string | undefined): MathematicianSort {
  return MATHEMATICIAN_SORTS.includes(value as MathematicianSort)
    ? value as MathematicianSort
    : "reputation";
}

export function parseMathematicianDomain(value: string | undefined) {
  return Object.values(MathDomain).includes(value as MathDomain) ? value as MathDomain : null;
}

export function parseMathematicianLevel(value: string | undefined) {
  return Object.values(UserMathLevel).includes(value as UserMathLevel) ? value as UserMathLevel : null;
}

export function mathematicianContributionCount(user: UserReputationSummary) {
  return user.problemCount + user.conceptCount + user.explorationCount;
}

export function filterMathematicians(
  users: UserReputationSummary[],
  filters: {
    query?: string;
    domain?: MathDomain | null;
    level?: UserMathLevel | null;
    collaborationOnly?: boolean;
  }
) {
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";
  return users.filter((user) => {
    if (filters.domain && !user.mathematicalDomains.includes(filters.domain)) return false;
    if (filters.level && user.mathLevel !== filters.level) return false;
    if (filters.collaborationOnly && !user.openToCollaboration) return false;
    if (!query) return true;
    const searchable = [
      displayNameForUser(user),
      user.username,
      user.bio ?? "",
      user.affiliation ?? "",
      ...user.mathematicalDomains.map(domainLabel)
    ].join(" ").toLocaleLowerCase();
    return searchable.includes(query);
  });
}

export function sortMathematicians(users: UserReputationSummary[], sort: MathematicianSort) {
  return [...users].sort((left, right) => {
    if (sort === "name") return displayNameForUser(left).localeCompare(displayNameForUser(right));
    if (sort === "newest") return right.joinedAt.getTime() - left.joinedAt.getTime();
    const leftValue = sort === "contributions"
      ? mathematicianContributionCount(left)
      : sort === "problems"
        ? left.problemCount
        : left.reputation;
    const rightValue = sort === "contributions"
      ? mathematicianContributionCount(right)
      : sort === "problems"
        ? right.problemCount
        : right.reputation;
    if (rightValue !== leftValue) return rightValue - leftValue;
    if (right.reputation !== left.reputation) return right.reputation - left.reputation;
    return displayNameForUser(left).localeCompare(displayNameForUser(right));
  });
}
