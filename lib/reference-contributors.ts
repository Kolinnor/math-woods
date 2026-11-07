export const referenceContributorUserSelect = {
  id: true, username: true, profileSlug: true, displayName: true, avatarUrl: true, avatarBackground: true
} as const;

type ContributorUser = {
  id: number; username: string; profileSlug: string; displayName: string | null;
  avatarUrl: string | null; avatarBackground: string | null;
};
type Contribution = { user: ContributorUser; edited: boolean; reviewed: boolean };

export function referenceContributors(creator: ContributorUser | null, contributions: Contribution[]) {
  const people = new Map<number, Contribution & { created: boolean }>();
  if (creator) people.set(creator.id, { user: creator, created: true, edited: false, reviewed: false });
  for (const contribution of contributions) {
    const previous = people.get(contribution.user.id);
    people.set(contribution.user.id, { user: contribution.user, created: previous?.created ?? false,
      edited: Boolean(previous?.edited || contribution.edited), reviewed: Boolean(previous?.reviewed || contribution.reviewed) });
  }
  return [...people.values()];
}
