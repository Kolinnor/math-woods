import type { ReactNode } from "react";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { LibraryFilters } from "@/components/library/LibraryFilters";

export function LibraryCatalogueForm({ locale, pathname, query, searchLabel, children, activeCount = 0 }: {
  locale: "fr" | "en";
  pathname: string;
  query?: string;
  searchLabel: string;
  children: ReactNode;
  activeCount?: number;
}) {
  return <LiveSearchForm className="library-catalogue-form" updatingLabel={locale === "fr" ? "Actualisation des résultats" : "Updating results"}>
    <label className="library-catalogue-search"><span>{searchLabel}</span><input type="search" name="q" defaultValue={query} placeholder={locale === "fr" ? "Nom, titre, mot-clé…" : "Name, title, keyword…"} /></label>
    <LibraryFilters locale={locale} activeCount={activeCount}>
      {children}
      <a className="library-reset" href={pathname}>{locale === "fr" ? "Réinitialiser les filtres" : "Reset filters"}</a>
    </LibraryFilters>
    <noscript><button type="submit">{locale === "fr" ? "Rechercher" : "Search"}</button></noscript>
  </LiveSearchForm>;
}

export function LibraryLanguageFilter({ locale, value }: { locale: "fr" | "en"; value?: string }) {
  return <label><span>{locale === "fr" ? "Langue de la fiche" : "Entry language"}</span><select name="language" defaultValue={value ?? ""}>
    <option value="">{locale === "fr" ? "Toutes les langues" : "All languages"}</option>
    <option value="fr">Français</option><option value="en">English</option>
  </select></label>;
}
