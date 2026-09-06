"use client";
import { useActionState } from "react";
import { proposeLibraryReferenceAction } from "@/lib/actions/library-actions";

export function ReferenceProposalForm({ text, url, locale }: { text: string; url: string | null; locale: "fr" | "en" }) {
  const [state, action, pending] = useActionState(proposeLibraryReferenceAction, { message: "", success: false });
  const fr = locale === "fr";
  return <form action={action} className="problem-citation-editor">
    <input type="hidden" name="language" value={locale} />
    <label><span>{fr ? "Titre de l’ouvrage ou de la ressource (sans le passage cité)" : "Book or resource title (without the passage)"}</span><input name="title" required maxLength={160} defaultValue={text} /></label>
    <label><span>{fr ? "Auteur (facultatif)" : "Author (optional)"}</span><input name="authors" maxLength={500} /></label>
    <label><span>{fr ? "Lien (facultatif)" : "Link (optional)"}</span><input name="url" type="url" maxLength={2000} defaultValue={url ?? ""} /></label>
    <p>{fr ? "La fiche sera examinée avant d’apparaître dans les recherches. Cela ne modifie pas la référence de votre problème." : "The record will be reviewed before appearing in searches. This does not change your problem reference."}</p>
    {state.message && <p role={state.success ? "status" : "alert"}>{state.message}</p>}
    <button type="submit" disabled={pending || state.success}>{pending ? (fr ? "Envoi…" : "Sending…") : (fr ? "Proposer au catalogue" : "Propose to catalogue")}</button>
  </form>;
}
