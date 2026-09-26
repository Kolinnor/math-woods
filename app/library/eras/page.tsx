import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import { LibraryEditorBack } from "@/components/library/LibraryEditorBack";
import { createDefaultLibraryErasAction, deleteLibraryEraAction, saveLibraryEraAction } from "@/lib/actions/library-era-actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { DEFAULT_LIBRARY_ERAS, libraryEraRange, libraryEraStyle, resolveLibraryEras } from "@/lib/library-display";
import { canUseAdminTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getInterfaceLocale();
  return { title: locale === "fr" ? "Époques de la bibliothèque" : "Library eras" };
}

type EraFields = { nameFr: string; nameEn: string; startYear: number | ""; color: string; descriptionFr: string; descriptionEn: string };

function EraFieldset({ locale, values }: { locale: "fr" | "en"; values: EraFields }) {
  const fr = locale === "fr";
  return <>
    <input type="hidden" name="locale" value={locale} />
    <div className="library-era-form-grid">
      <label className="library-era-color"><span>{fr ? "Couleur" : "Colour"}</span><input type="color" name="color" defaultValue={values.color} /></label>
      <label><span>{fr ? "Nom en français" : "French name"}</span><input name="nameFr" defaultValue={values.nameFr} maxLength={80} required /></label>
      <label><span>{fr ? "Nom en anglais" : "English name"}</span><input name="nameEn" defaultValue={values.nameEn} maxLength={80} /></label>
      <label className="library-era-year"><span>{fr ? "À partir de l’année" : "From the year"}</span><input name="startYear" type="number" defaultValue={values.startYear} min={-5000} step={1} required /></label>
    </div>
    <div className="library-era-form-grid library-era-form-descriptions">
      <label><span>{fr ? "Description (français)" : "Description (French)"}</span><textarea name="descriptionFr" defaultValue={values.descriptionFr} maxLength={400} rows={2} /></label>
      <label><span>{fr ? "Description (anglais)" : "Description (English)"}</span><textarea name="descriptionEn" defaultValue={values.descriptionEn} maxLength={400} rows={2} /></label>
    </div>
  </>;
}

export default async function LibraryErasPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [user, locale, query] = await Promise.all([requireAdmin(), getInterfaceLocale(), searchParams]);
  if (!canUseAdminTools(user)) notFound();
  const fr = locale === "fr";
  const rows = await prisma.libraryEra.findMany({ orderBy: { startYear: "asc" } });
  const eras = resolveLibraryEras(rows.length ? rows : DEFAULT_LIBRARY_ERAS, new Date().getFullYear());
  const lastYear = eras.at(-1)?.startYear ?? 1900;

  return <ForestPageLayout className="library-editor-page library-eras-page" titleBelowHero title={fr ? "Époques de la bibliothèque" : "Library eras"}
    description={fr ? "Chaque époque commence à l’année indiquée et se termine quand la suivante commence. Elles organisent la frise, les filtres et les couleurs de la bibliothèque." : "Each era starts in the given year and ends when the next one starts. They organise the timeline, the filters and the colours of the library."}
    heroImage="/art/history-forest-ruins.avif">
    <LibraryEditorBack href="/library/history" locale={locale} />
    {query.saved && <p className="library-era-message" role="status">{query.saved}</p>}
    {query.error && <p className="library-era-message" data-kind="error" role="alert">{query.error}</p>}

    <ol className="library-era-preview" aria-label={fr ? "Aperçu de la frise" : "Timeline preview"}>
      {eras.map((era, index) => <li key={era.slug} style={libraryEraStyle(era)}><strong>{era.name[locale]}</strong><span>{libraryEraRange(era, locale, index === eras.length - 1)}</span></li>)}
    </ol>

    {!rows.length && <form action={createDefaultLibraryErasAction} className="library-era-defaults">
      <input type="hidden" name="locale" value={locale} />
      <p>{fr ? "Ces époques sont celles proposées par défaut. Enregistrez-les pour pouvoir les modifier." : "These are the default eras. Store them to be able to edit them."}</p>
      <button className="primary" type="submit">{fr ? "Enregistrer les époques par défaut" : "Store the default eras"}</button>
    </form>}

    {rows.length > 0 && <ol className="library-era-list">
      {rows.map((row, index) => {
        const era = eras.find(item => item.slug === row.slug)!;
        return <li key={row.id} className="library-era-card" style={libraryEraStyle(era)}>
          <ActionFeedbackForm action={saveLibraryEraAction.bind(null, row.id)}>
            <div className="library-era-card-heading">
              <h2>{row[fr ? "nameFr" : "nameEn"]}</h2>
              <span>{libraryEraRange(era, locale, index === rows.length - 1)}</span>
            </div>
            <EraFieldset locale={locale} values={row} />
            <div className="library-era-card-actions">
              <button className="primary" type="submit">{fr ? "Enregistrer" : "Save"}</button>
            </div>
          </ActionFeedbackForm>
          {rows.length > 1 && <details className="library-era-delete">
                <summary><Trash2 size={15} aria-hidden="true" />{fr ? "Supprimer" : "Delete"}</summary>
                <p>{fr ? "Les fiches seront réparties entre les époques restantes selon leurs dates." : "Entries will be assigned to the remaining eras according to their dates."}</p>
                <form action={deleteLibraryEraAction.bind(null, row.id)}>
                  <input type="hidden" name="locale" value={locale} />
                  <button className="danger" type="submit">{fr ? "Confirmer la suppression" : "Confirm deletion"}</button>
                </form>
          </details>}
        </li>;
      })}
      <li className="library-era-card library-era-new">
        <ActionFeedbackForm action={saveLibraryEraAction.bind(null, null)}>
          <div className="library-era-card-heading"><h2><Plus size={18} aria-hidden="true" />{fr ? "Ajouter une époque" : "Add an era"}</h2></div>
          <EraFieldset locale={locale} values={{ nameFr: "", nameEn: "", startYear: "", color: "#6d6555", descriptionFr: "", descriptionEn: "" }} />
          <p className="library-era-hint">{fr ? `Par exemple, une époque qui commence en ${lastYear + 50} coupe la dernière époque en deux.` : `For example, an era starting in ${lastYear + 50} splits the last era in two.`}</p>
          <div className="library-era-card-actions"><button className="primary" type="submit">{fr ? "Ajouter" : "Add"}</button></div>
        </ActionFeedbackForm>
      </li>
    </ol>}
  </ForestPageLayout>;
}
