import { extractConceptReferences } from "./concept-link-references.ts";

/** Hidden form field sent once the author has seen the concept-link reminder. */
export const CONCEPT_LINK_REMINDER_FIELD = "conceptLinkReminderSeen";

/** Recognize both editor links and ordinary Markdown links to a concept, outside code. */
export function hasConceptLink(markdown: string) {
  return extractConceptReferences(markdown).length > 0;
}

/**
 * The server asks the author, once, to link a word of the statement to a concept
 * before publishing a problem or an edit. Submitting again publishes as is.
 */
export class ConceptLinkReminderError extends Error {}

export function needsConceptLinkReminder(
  bodyMarkdown: string,
  acknowledged: boolean,
  links: { additionalConceptSlugs?: readonly string[]; linkedConcept?: boolean } = {}
) {
  if (acknowledged || !bodyMarkdown.trim() || links.additionalConceptSlugs?.length || links.linkedConcept) return false;
  return !hasConceptLink(bodyMarkdown);
}

export function conceptLinkReminderAcknowledged(formData: FormData) {
  return formData.get(CONCEPT_LINK_REMINDER_FIELD) === "1";
}
