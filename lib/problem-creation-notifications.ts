import { contentLanguageLabel } from "./languages.ts";

type ProblemCreationNotificationCopyInput = {
  actorName: string;
  problemTitle: string;
  sourceTitle?: string | null;
  targetLanguage: string;
};

export function problemCreationNotificationCopy({
  actorName,
  problemTitle,
  sourceTitle,
  targetLanguage
}: ProblemCreationNotificationCopyInput) {
  if (!sourceTitle) {
    return {
      title: "New problem created",
      body: `${actorName} created "${problemTitle}".`
    };
  }

  const language = contentLanguageLabel(targetLanguage);
  const translatedTitle = sourceTitle === problemTitle ? "" : ` titled "${problemTitle}"`;

  return {
    title: "New problem translation",
    body: `${actorName} created a translation of "${sourceTitle}" in ${language}${translatedTitle}.`
  };
}
