import { Settings } from "lucide-react";
import Link from "next/link";

export function ContestTabs({
  active,
  canEdit,
  locale
}: {
  active: "contest" | "edit";
  canEdit: boolean;
  locale: "en" | "fr";
}) {
  return (
    <nav className="contest-tabs" aria-label={locale === "fr" ? "Navigation du concours" : "Contest navigation"}>
      <Link href="/contest" aria-current={active === "contest" ? "page" : undefined}>
        {locale === "fr" ? "Concours" : "Contest"}
      </Link>
      {canEdit && (
        <Link href="/contest/edit" aria-current={active === "edit" ? "page" : undefined}>
          <Settings size={16} aria-hidden="true" />
          {locale === "fr" ? "Modifier la page du concours" : "Edit contest page"}
        </Link>
      )}
    </nav>
  );
}
