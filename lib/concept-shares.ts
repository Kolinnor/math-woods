export const CONCEPT_SHARE_MESSAGE_MAX_LENGTH = 500;

export type ConceptShareError =
  | "chooseUser"
  | "conceptUnavailable"
  | "duplicate"
  | "rateLimited"
  | "selfShare"
  | "userUnavailable";

export function normalizeConceptShareMessage(value: FormDataEntryValue | string | null | undefined) {
  return String(value ?? "").trim().slice(0, CONCEPT_SHARE_MESSAGE_MAX_LENGTH);
}

export function conceptShareChatMarkdown({
  conceptTitle,
  conceptSlug,
  message
}: {
  conceptTitle: string;
  conceptSlug: string;
  message?: string | null;
}) {
  const linkTitle = conceptTitle.replace(/([\[\]])/g, "\\$1");
  const introduction = `**Shared concept**\n\n[${linkTitle}](/concepts/${conceptSlug})`;
  return message?.trim() ? `${introduction}\n\n${message.trim()}` : introduction;
}

export function conceptShareNotificationBody({
  senderName,
  conceptTitle,
  message
}: {
  senderName: string;
  conceptTitle: string;
  message?: string | null;
}) {
  const introduction = `${senderName} shared the concept "${conceptTitle}" with you.`;
  return message?.trim() ? `${introduction} ${message.trim()}` : introduction;
}
