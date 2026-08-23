import { contentLanguageLabel } from "./languages.ts";

type ConceptCreationNotificationCopyInput = {
  actorName: string;
  conceptTitle: string;
  sourceTitle?: string | null;
  targetLanguage: string;
};

export function conceptCreationNotificationCopy({
  actorName,
  conceptTitle,
  sourceTitle,
  targetLanguage
}: ConceptCreationNotificationCopyInput) {
  if (!sourceTitle) {
    return {
      title: "New concept created",
      body: `${actorName} created "${conceptTitle}".`
    };
  }

  const language = contentLanguageLabel(targetLanguage);
  const translatedTitle = sourceTitle === conceptTitle ? "" : ` as "${conceptTitle}"`;

  return {
    title: "New concept translation",
    body: `${actorName} translated "${sourceTitle}" into ${language}${translatedTitle}.`
  };
}
