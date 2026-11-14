import { extractWikiLinks } from "./wikilinks.ts";

/** Hidden form field sent once the author has seen the concept-link reminder. */
export const CONCEPT_LINK_REMINDER_FIELD = "conceptLinkReminderSeen";

/** True when the Markdown contains at least one [[...]] link outside code. */
export function hasConceptLink(markdown: string) {
  return extractWikiLinks(markdown).length > 0;
}

/**
 * The server asks the author, once, to link a word of the statement to a concept
 * before publishing a problem or an edit. Submitting again publishes as is.
 */
export function needsConceptLinkReminder(bodyMarkdown: string, acknowledged: boolean) {
  if (acknowledged || !bodyMarkdown.trim()) return false;
  return !hasConceptLink(bodyMarkdown);
}

export function conceptLinkReminderAcknowledged(formData: FormData) {
  return formData.get(CONCEPT_LINK_REMINDER_FIELD) === "1";
}
