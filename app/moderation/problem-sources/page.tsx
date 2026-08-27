import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { KnownProblemSourceIconField } from "@/components/KnownProblemSourceIconField";
import {
  createKnownProblemSourceAction,
  updateKnownProblemSourceAction
} from "@/lib/actions/known-problem-source-actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function KnownProblemSourcesPage({
  searchParams
}: {
  searchParams: Promise<{ created?: string; updated?: string; attached?: string }>;
}) {
  await requireAdmin();
  const [locale, sources, query] = await Promise.all([
    getInterfaceLocale(),
    prisma.knownProblemSource.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { problems: true } } }
    }),
    searchParams
  ]);
  const fr = locale === "fr";
  const attached = Number(query.attached ?? 0);

  return (
    <ForestPageLayout
      title={fr ? "Sources de problèmes" : "Problem sources"}
      description={fr
        ? "Gérez les sources reconnues qui peuvent afficher un pictogramme sur les pages des problèmes."
        : "Manage recognized sources that can display a pictogram on problem pages."}
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      actions={<Link href="/moderation" className="button secondary">{fr ? "Retour à la modération" : "Back to moderation"}</Link>}
    >
      {(query.created || query.updated) && (
        <p className="quality-banner mb-5" role="status">
          {query.created ? (fr ? "Source créée." : "Source created.") : (fr ? "Source mise à jour." : "Source updated.")}
          {attached > 0 && ` ${fr ? `${attached} attribution(s) existante(s) rattachée(s).` : `${attached} existing attribution(s) attached.`}`}
        </p>
      )}

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">{fr ? "Ajouter une source" : "Add a source"}</h2>
        <form action={createKnownProblemSourceAction} className="panel grid gap-4 p-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium">{fr ? "Nom" : "Name"}</span>
            <input name="name" required maxLength={180} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{fr ? "Alias" : "Aliases"}</span>
            <textarea name="aliases" rows={3} placeholder={fr ? "Un alias par ligne" : "One alias per line"} />
          </label>
          <KnownProblemSourceIconField locale={locale} />
          <button type="submit" className="justify-self-start">{fr ? "Ajouter" : "Add"}</button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">{fr ? "Sources enregistrées" : "Registered sources"}</h2>
        <div className="grid gap-4">
          {sources.map((source) => (
            <form key={source.id} action={updateKnownProblemSourceAction.bind(null, source.id)} className="panel grid gap-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <strong>{source.name}</strong>
                <span className="muted text-sm">
                  {source._count.problems} {fr ? "problème(s)" : "problem(s)"}
                </span>
              </div>
              <label className="grid gap-2">
                <span className="text-sm font-medium">{fr ? "Nom" : "Name"}</span>
                <input name="name" required maxLength={180} defaultValue={source.name} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium">{fr ? "Alias" : "Aliases"}</span>
                <textarea name="aliases" rows={3} defaultValue={source.aliases.join("\n")} />
              </label>
              <KnownProblemSourceIconField initialValue={source.iconUrl} locale={locale} />
              <label className="checkbox-field">
                <input name="active" type="checkbox" defaultChecked={source.active} />
                <span><strong>{fr ? "Disponible dans le menu" : "Available in the menu"}</strong></span>
              </label>
              <button type="submit" className="justify-self-start">{fr ? "Enregistrer" : "Save"}</button>
            </form>
          ))}
        </div>
      </section>
    </ForestPageLayout>
  );
}
