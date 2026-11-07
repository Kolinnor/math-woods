import { boundedText, CONTENT_LIMITS } from "./content-limits.ts";

export type ContentHistory = { historyMarkdown: string; historyEnabled: boolean; historySpoiler: boolean };
export const HISTORY_FIELDS = ["historyMarkdown", "historyEnabled", "historySpoiler"] as const;

export function contentHistory(source?: Partial<ContentHistory> | null): ContentHistory {
  return {
    historyMarkdown: source?.historyMarkdown ?? "",
    historyEnabled: source?.historyEnabled === true,
    historySpoiler: source?.historySpoiler === true
  };
}

// Older forms and proposals do not own these fields and must preserve them.
export function submittedContentHistory(form: FormData, previous?: Partial<ContentHistory>, allowSpoiler = false): ContentHistory {
  if (!form.has("historyMarkdown")) return contentHistory(previous);
  return {
    historyMarkdown: boundedText(form.get("historyMarkdown"), CONTENT_LIMITS.markdown, "History"),
    historyEnabled: form.get("historyEnabled") === "on",
    historySpoiler: allowSpoiler && form.get("historySpoiler") === "on"
  };
}

export function historyFormData(form: FormData, source: Partial<ContentHistory>) {
  if (source.historyMarkdown === undefined) return;
  const history = contentHistory(source);
  form.set("historyMarkdown", history.historyMarkdown);
  if (history.historyEnabled) form.set("historyEnabled", "on");
  if (history.historySpoiler) form.set("historySpoiler", "on");
}

export function visibleHistory(source: Partial<ContentHistory>) {
  return source.historyEnabled === true && Boolean(source.historyMarkdown?.trim());
}

// Hidden notes and solution clues must not create public backlinks.
export function contentWithHistory(body: string, source: Partial<ContentHistory>) {
  return visibleHistory(source) && !source.historySpoiler ? `${body}\n\n${source.historyMarkdown}` : body;
}

export function historyCopy(locale: string) {
  return locale === "fr" ? {
    title: "Histoire", add: "Ajouter une histoire", show: "Afficher cette section",
    help: "Origine, contexte historique, évolution des idées… Pensez à citer vos sources.",
    hidden: "Le texte est conservé lorsque la section est masquée.",
    spoiler: "Cette histoire contient des éléments de solution",
    warning: "Peut révéler des éléments de solution",
    reveal: "Lire l’histoire malgré les spoilers"
  } : {
    title: "History", add: "Add historical context", show: "Show this section",
    help: "Origins, historical context, evolution of ideas… Remember to cite your sources.",
    hidden: "The text is kept when the section is hidden.",
    spoiler: "This history contains solution spoilers",
    warning: "May reveal solution spoilers", reveal: "Read history with spoilers"
  };
}
