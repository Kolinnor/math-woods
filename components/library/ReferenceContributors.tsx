import Link from "next/link";
import { UsersRound } from "lucide-react";
import { UserName } from "@/components/UserName";
import { referenceContributors } from "@/lib/reference-contributors";

export function ReferenceContributors({ creator, contributions, locale }: {
  creator: Parameters<typeof referenceContributors>[0];
  contributions: Parameters<typeof referenceContributors>[1];
  locale: "fr" | "en";
}) {
  const people = referenceContributors(creator, contributions);
  if (!people.length) return null;
  const fr = locale === "fr";
  return <section className="concept-rail-section concept-contributors reference-contributors">
    <h2><UsersRound size={16} aria-hidden="true" />{fr ? "Contributeurs de la fiche" : "Record contributors"}</h2>
    <ul className="reference-contributor-list">{people.map(person => <li key={person.user.id}>
      <Link className="concept-contributor-link" href={`/profile/${person.user.profileSlug}`}><UserName user={person.user} /></Link>
      <small>{[
        person.created && (fr ? "Création" : "Created the record"),
        person.edited && (fr ? "Modifications" : "Edits"),
        person.reviewed && (fr ? "Relecture" : "Review")
      ].filter(Boolean).join(" · ") || (fr ? "Contribution" : "Contribution")}</small>
    </li>)}</ul>
  </section>;
}
