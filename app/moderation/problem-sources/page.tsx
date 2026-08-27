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
  searchParams: Promise<{
    created?: string;
    updated?: string;
    attached?: string;
    duplicate?: string;
    pendingIcon?: string;
  }>;
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

      {query.duplicate && (
        <p className="quality-banner mb-5" role="alert">
          {fr
            ? "Cette source existe déjà. Le pictogramme téléversé a été conservé dans sa fiche ci-dessous : cliquez sur « Enregistrer » pour l’associer."
            : "This source already exists. The uploaded pictogram has been kept in its record below: select “Save” to attach it."}
        </p>
      )}

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">{fr ? "Sources enregistrées" : "Registered sources"}</h2>
        <div className="grid gap-4">
          {sources.map((source) => (
            <form
              key={source.id}
              id={`source-${source.slug}`}
              action={updateKnownProblemSourceAction.bind(null, source.id)}
              className="panel grid gap-4 p-4"
              data-source-conflict={query.duplicate === source.slug ? "true" : undefined}
            >
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
              <KnownProblemSourceIconField
                initialValue={query.duplicate === source.slug && query.pendingIcon ? query.pendingIcon : source.iconUrl}
                locale={locale}
              />
              <label className="checkbox-field">
                <input name="active" type="checkbox" defaultChecked={source.active} />
                <span><strong>{fr ? "Disponible dans le menu" : "Available in the menu"}</strong></span>
              </label>
              <button type="submit" className="justify-self-start">{fr ? "Enregistrer" : "Save"}</button>
            </form>
          ))}
        </div>
      </section>

      <details className="panel p-4">
        <summary className="cursor-pointer font-semibold">{fr ? "Ajouter une nouvelle source" : "Add a new source"}</summary>
        <form action={createKnownProblemSourceAction} className="mt-4 grid gap-4">
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
      </details>
    </ForestPageLayout>
  );
}
