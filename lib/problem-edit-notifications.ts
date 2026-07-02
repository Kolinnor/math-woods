export function problemEditNotificationRecipientIds({
  authorId,
  participantIds,
  actorId
}: {
  authorId: number;
  participantIds: number[];
  actorId: number;
}) {
  const recipientIds = new Set([authorId, ...participantIds]);
  recipientIds.delete(actorId);
  return [...recipientIds];
}
