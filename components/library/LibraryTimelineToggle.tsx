import { Star } from "lucide-react";
import { FieldHelp } from "@/components/FieldHelp";
import { setTimelineFeaturedAction } from "@/lib/actions/library-timeline-actions";

/** Editors put an entry first on the timeline of the library home page. */
export function LibraryTimelineToggle({ entity, id, featured, locale }: { entity: "mathematician" | "milestone"; id: number; featured: boolean; locale: "fr" | "en" }) {
  const fr = locale === "fr";
  return <form action={setTimelineFeaturedAction.bind(null, entity, id, !featured)} className="library-timeline-toggle">
    <button type="submit" aria-pressed={featured}>
      <Star size={15} aria-hidden="true" fill={featured ? "currentColor" : "none"} />
      {featured ? (fr ? "Sur la frise" : "On the timeline") : (fr ? "Mettre sur la frise" : "Put on the timeline")}
    </button>
    <FieldHelp text={fr
      ? "La frise de l’accueil montre quelques fiches par époque : d’abord celles choisies ici, puis les plus complètes (portrait, présentation, repères et liens). Cliquer à nouveau retire le choix."
      : "The timeline of the library home page shows a few entries per era: first those chosen here, then the most complete ones (portrait, summary, milestones and links). Click again to undo the choice."} />
  </form>;
}
