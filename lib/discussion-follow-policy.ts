export type DiscussionTarget = { kind: "problem" | "proof" | "concept"; id: number };

export function discussionTargetWhere(target: DiscussionTarget) {
  if (target.kind === "problem") return { problemId: target.id };
  if (target.kind === "proof") return { proofId: target.id };
  return { conceptId: target.id };
}

export function isFollowingDiscussion(automatic: boolean, preference?: boolean | null) {
  return preference ?? automatic;
}

export function discussionRecipientIds(
  automaticIds: number[],
  preferences: { userId: number; following: boolean }[],
  actorId: number
) {
  const recipients = new Set(automaticIds);
  for (const preference of preferences) {
    if (preference.following) recipients.add(preference.userId);
    else recipients.delete(preference.userId);
  }
  recipients.delete(actorId);
  return [...recipients];
}
