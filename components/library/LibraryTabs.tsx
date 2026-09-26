import Link from "next/link";
import { BookOpen, Clock3, LibraryBig, UsersRound } from "lucide-react";
import { LibraryNavTrack } from "@/components/library/LibraryNavTrack";
import { libraryCopy } from "@/lib/library-copy";

type LibrarySection = "overview" | "history" | "mathematicians" | "references" | "contribute";

/** The sections of the library, as a segmented control (same family as the Map/List switch). */
export function LibraryTabs({ active, locale }: { active?: LibrarySection; locale: "en" | "fr" }) {
  const copy = libraryCopy[locale];
  const tabs = [
    { key: "overview", href: "/library", label: copy.overview, icon: LibraryBig },
    { key: "history", href: "/library/history", label: copy.history, icon: Clock3 },
    { key: "mathematicians", href: "/library/mathematicians", label: copy.mathematicians, icon: UsersRound },
    { key: "references", href: "/library/references", label: copy.references, icon: BookOpen }
  ] as const;

  return (
    <nav className="library-nav" aria-label={copy.title}>
      <LibraryNavTrack>
        {tabs.map(({ key, href, label, icon: Icon }) => (
          <Link key={key} href={href as never} className="library-nav-link" data-section={key} aria-current={active === key ? "page" : undefined}>
            <Icon size={16} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </LibraryNavTrack>
    </nav>
  );
}
