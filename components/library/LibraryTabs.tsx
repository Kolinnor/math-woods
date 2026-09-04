import Link from "next/link";
import { BookOpen, Clock3, LibraryBig, PenLine, UsersRound } from "lucide-react";
import { libraryCopy } from "@/lib/library-copy";

type LibrarySection = "overview" | "history" | "mathematicians" | "references" | "contribution";

export function LibraryTabs({ active, locale }: { active: LibrarySection; locale: "en" | "fr" }) {
  const copy = libraryCopy[locale];
  const tabs = [
    { key: "overview", href: "/library", label: copy.overview, icon: LibraryBig },
    { key: "history", href: "/library/history", label: copy.history, icon: Clock3 },
    { key: "mathematicians", href: "/library/mathematicians", label: copy.mathematicians, icon: UsersRound },
    { key: "references", href: "/library/references", label: copy.references, icon: BookOpen },
    { key: "contribution", href: "/library/contribute", label: copy.contribution, icon: PenLine }
  ] as const;

  return (
    <nav className="library-tabs" aria-label={copy.title}>
      {tabs.map(({ key, href, label, icon: Icon }) => (
        <Link key={key} href={href as never} aria-current={active === key ? "page" : undefined}>
          <Icon size={17} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
